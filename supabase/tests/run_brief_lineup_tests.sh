#!/usr/bin/env bash
# Scratch-only test runner for 20261012090000_brief_lineup_and_scenario_labels.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql for a scratch cluster as postgres (default: socket /var/tmp port 55417)
# Builds a fresh DB = replica + security_hardening + trust_ledgers (both applied in prod) + brief_lineup_fixture.sql
# (live registry guards and rows), then: tests BEFORE (must fail) -> apply -> tests AFTER (must pass) ->
# re-apply -> fingerprint identical -> tests again.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
MIG="$REPO/supabase/migrations/20261012090000_brief_lineup_and_scenario_labels.sql"
DB="${DB:-ws5a_brief_lineup}"
rc=0
q() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
for f in "$SCHEMA_DIR/00_live_schema.sql" "$SCHEMA_DIR/01_seed_synthetic.sql" "$SCHEMA_DIR/02_harness.sql" \
         "$REPO/supabase/migrations/20261008090000_security_hardening.sql" "$REPO/supabase/migrations/20261009090000_trust_ledgers.sql" \
         "$HERE/brief_lineup_fixture.sql"; do
  q -f "$f" >/dev/null || { echo "setup failed: $f"; exit 2; }
done
echo "-- setup: replica + security_hardening + trust_ledgers + fixture loaded"
echo "-- report_types BEFORE:"; q -At -c "SELECT code||' '||status||' '||cadence||' '||name_en FROM public.report_types ORDER BY display_order"
echo "-- tests BEFORE migration (expected: FAIL)"
out=$(q -At -f "$HERE/brief_lineup_test.sql" 2>&1); s=$?
echo "   exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$')"
[ $s -eq 0 ] && { echo "   UNEXPECTED: tests passed without the migration"; rc=1; }
f0=$(q -At -f "$HERE/brief_lineup_fingerprint.sql")
UNTOUCHED="SELECT md5(coalesce(string_agg(x, E'\\n' ORDER BY x), '')) FROM (SELECT 'db|' || to_jsonb(b)::text x FROM public.daily_briefings b UNION ALL SELECT 'sp|' || to_jsonb(p)::text FROM public.scenario_probabilities p UNION ALL SELECT 'sd|' || to_jsonb(d)::text FROM public.scenario_daily d UNION ALL SELECT 'sr|' || to_jsonb(r)::text FROM public.scenario_runs r) t"
u0=$(q -At -c "$UNTOUCHED")
echo "-- apply (1st)"; q -f "$MIG" || { echo "apply FAILED"; rc=1; }
echo "-- tests AFTER (expected: PASS)"
out=$(q -At -f "$HERE/brief_lineup_test.sql" 2>&1); s=$?
echo "$out" | grep -E '^(PASS|FAIL) '; echo "   exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$')"; [ $s -ne 0 ] && { echo "$out" | tail -3; rc=1; }
echo "-- report_types AFTER:"; q -At -c "SELECT code||' '||status||' '||cadence||' '||name_en FROM public.report_types ORDER BY display_order"
echo "-- report_type_events:"; q -At -c "SELECT report_type||' '||coalesce(from_status,'NULL')||'->'||to_status||' by '||actor_kind FROM public.report_type_events ORDER BY id"
echo "-- scenarios AFTER:"; q -At -c "SELECT code||' | '||name_en||' | was: '||coalesce(former_name_en,'-') FROM public.scenarios ORDER BY code"
f1=$(q -At -f "$HERE/brief_lineup_fingerprint.sql")
u1=$(q -At -c "$UNTOUCHED")
echo "   daily_briefings + scenario_probabilities + scenario_daily + scenario_runs before: $u0 after: $u1"
[ "$u0" = "$u1" ] && echo "   history tables untouched: YES" || { echo "   history tables untouched: NO"; rc=1; }
echo "-- apply (2nd, idempotency)"; q -f "$MIG" || { echo "re-apply FAILED"; rc=1; }
f2=$(q -At -f "$HERE/brief_lineup_fingerprint.sql")
echo "   fingerprint before migration : $f0"
echo "   fingerprint after 1st apply  : $f1"
echo "   fingerprint after 2nd apply  : $f2"
[ "$f0" != "$f1" ] && echo "   migration changed state: YES" || { echo "   migration changed state: NO (unexpected)"; rc=1; }
[ "$f1" = "$f2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }
out=$(q -At -f "$HERE/brief_lineup_test.sql" 2>&1); s=$?; echo "-- tests after re-apply: exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$')"; [ $s -ne 0 ] && rc=1
echo "-- daily_briefings rows (must be unchanged, 2 synthetic):"; q -At -c "SELECT conflict_day||' '||report_type||' '||title FROM public.daily_briefings ORDER BY report_type"
echo "================ overall rc=$rc"
exit $rc
