#!/usr/bin/env bash
# Scratch-only test runner for 20261012120000_reject_paused_report_types.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql for a scratch cluster as postgres (default: socket /var/tmp port 55417)
# Builds a fresh DB = replica + security_hardening + trust_ledgers (no-silent-edit + corrections, both applied in
# prod) + brief_lineup_fixture.sql + 20261012090000_brief_lineup (really pauses egypt / uae / business) +
# reject_paused_report_types_fixture.sql (prod unique indexes + old paused-type briefs), then:
# tests BEFORE (must fail) -> apply -> tests AFTER (must pass) -> re-apply -> fingerprint identical -> tests again.
# Also checks that applying the migration writes no data (daily_briefings / report_types / report_type_events).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
MIG="$REPO/supabase/migrations/20261012120000_reject_paused_report_types.sql"
DB="${DB:-rpt_reject_paused_types}"
rc=0
q() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null || { echo "cannot create $DB"; exit 2; }
for f in "$SCHEMA_DIR/00_live_schema.sql" "$SCHEMA_DIR/01_seed_synthetic.sql" "$SCHEMA_DIR/02_harness.sql" \
         "$REPO/supabase/migrations/20261008090000_security_hardening.sql" "$REPO/supabase/migrations/20261009090000_trust_ledgers.sql" \
         "$HERE/brief_lineup_fixture.sql" "$REPO/supabase/migrations/20261012090000_brief_lineup_and_scenario_labels.sql" \
         "$HERE/reject_paused_report_types_fixture.sql"; do
  q -f "$f" >/dev/null || { echo "setup failed: $f"; exit 2; }
done
echo "-- setup: replica + security_hardening + trust_ledgers + brief_lineup (fixture + migration) + fixture loaded"
echo "-- report_types:"; q -At -c "SELECT code||' '||status FROM public.report_types ORDER BY display_order"
echo "-- daily_briefings BEFORE:"; q -At -c "SELECT conflict_day||' '||report_type||' gen '||CASE WHEN generated_at < now() - interval '1 day' THEN 'old' ELSE 'in-window' END FROM public.daily_briefings ORDER BY conflict_day, report_type"
DATA="SELECT md5(coalesce(string_agg(x, E'\\n' ORDER BY x), '')) FROM (SELECT 'db|' || to_jsonb(b)::text x FROM public.daily_briefings b UNION ALL SELECT 'rt|' || to_jsonb(t)::text FROM public.report_types t UNION ALL SELECT 'rte|' || to_jsonb(e)::text FROM public.report_type_events e) s"
FP="SELECT md5(coalesce((SELECT pg_get_functiondef('public.daily_briefings_reject_inactive_type()'::regprocedure)), '-') || coalesce((SELECT string_agg(pg_get_triggerdef(oid) || tgenabled::text, ',' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.daily_briefings'::regclass AND NOT tgisinternal), '-') || coalesce((SELECT array_to_string(proacl, ',') FROM pg_proc WHERE oid = 'public.daily_briefings_reject_inactive_type()'::regprocedure), '-'))"
echo "-- tests BEFORE migration (expected: FAIL)"
out=$(q -At -f "$HERE/reject_paused_report_types_test.sql" 2>&1); s=$?
echo "$out" | grep -E '^FAIL ' | sed 's/^/   /'
echo "   exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$')"
[ $s -eq 0 ] && { echo "   UNEXPECTED: tests passed without the migration"; rc=1; }
d0=$(q -At -c "$DATA")
echo "-- apply (1st)"; q -f "$MIG" || { echo "apply FAILED"; rc=1; }
d1=$(q -At -c "$DATA"); f1=$(q -At -c "$FP")
echo "   data (daily_briefings + report_types + report_type_events) before: $d0 after: $d1"
[ "$d0" = "$d1" ] && echo "   migration wrote no data: YES" || { echo "   migration wrote no data: NO"; rc=1; }
echo "-- tests AFTER (expected: PASS)"
out=$(q -At -f "$HERE/reject_paused_report_types_test.sql" 2>&1); s=$?
echo "$out" | grep -E '^(PASS|FAIL) ' | sed 's/^/   /'
echo "   exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$')"; [ $s -ne 0 ] && { echo "$out" | tail -3; rc=1; }
echo "-- apply (2nd, idempotency)"; q -f "$MIG" || { echo "re-apply FAILED"; rc=1; }
f2=$(q -At -c "$FP"); d2=$(q -At -c "$DATA")
echo "   guard fingerprint after 1st apply: $f1"
echo "   guard fingerprint after 2nd apply: $f2"
[ -n "$f1" ] && [ "$f1" = "$f2" ] && [ "$d1" = "$d2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }
n=$(q -At -c "SELECT count(*) FROM pg_trigger WHERE tgrelid = 'public.daily_briefings'::regclass AND tgname = 'daily_briefings_reject_inactive_type'")
echo "   trigger count after 2 applies: $n"; [ "$n" = "1" ] || rc=1
out=$(q -At -f "$HERE/reject_paused_report_types_test.sql" 2>&1); s=$?; echo "-- tests after re-apply: exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$')"; [ $s -ne 0 ] && rc=1
echo "-- daily_briefings AFTER (probes roll back; must equal BEFORE):"; q -At -c "SELECT conflict_day||' '||report_type||' '||title FROM public.daily_briefings ORDER BY conflict_day, report_type"
[ "${KEEP_DB:-0}" = "1" ] || PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null
echo "================ overall rc=$rc"
exit $rc
