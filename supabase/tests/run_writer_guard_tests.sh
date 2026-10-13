#!/usr/bin/env bash
# Scratch-only test runner for 20261013121000_writer_guard.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   DUMP_DIR   = dir with the read-only production export (one JSON row per line):
#                daily_briefings_d219_d228.jsonl  <- SELECT to_jsonb(b)::text FROM daily_briefings b WHERE conflict_day BETWEEN 219 AND 228
#                country_reports.jsonl            <- SELECT to_jsonb(c)::text FROM country_reports c
#                (not committed: it is published content, 750 KB; re-export it with the two SELECTs above)
#   PSQL       = psql for a scratch cluster as postgres (default: socket /var/tmp port 55417)
# Main DB = replica + security_hardening + trust_ledgers + brief_lineup (fixture + migration: egypt/uae/business paused)
#   + reject_paused_report_types (fixture + migration) + writer_guard_fixture.sql (production provenance trigger)
#   + the production dump loaded as EXISTING rows (writer_guard_load.sql), checked byte-for-byte against the
#   production md5. Then: tests BEFORE (must fail) -> apply -> data unchanged? -> tests AFTER (must pass)
#   -> re-apply -> fingerprint identical -> tests again.
# Regression DBs: the sibling suites still pass with the guard installed:
#   reject_paused_report_types_test.sql (its own chain + this migration) and trust_ledgers_test.sql
#   (replica + hardening + trust_ledgers + reject_paused fixture for the unique index + this migration).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
M="$REPO/supabase/migrations"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
DUMP_DIR="${DUMP_DIR:?set DUMP_DIR to the production dump directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
MIG="$M/20261013121000_writer_guard.sql"
DB="${DB:-wg_writer_guard}"
PROD_DB_MD5=34281f4b91c51468ce1e17e65e175078   # production, read-only 2026-10-13: md5(string_agg(to_jsonb(b)::text, E'\n' ORDER BY conflict_day, report_type)) for Days 219-228 (49 rows)
PROD_CR_MD5=a4f4be1e4427547734d087a61fca3a41   # production, read-only 2026-10-13: same over country_reports ORDER BY country_code (25 rows)
rc=0
q()  { PGOPTIONS="-c client_min_messages=warning -c TimeZone=UTC" $PSQL -d "$1" -v ON_ERROR_STOP=1 -q "${@:2}"; }
mk() { PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" >/dev/null || { echo "cannot create $1"; exit 2; }; }
load() { local db=$1; shift; for f in "$@"; do q "$db" -f "$f" >/dev/null || { echo "setup failed: $f"; exit 2; }; done; }
summ() { grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' | tail -1; }

BASE=("$SCHEMA_DIR/00_live_schema.sql" "$SCHEMA_DIR/01_seed_synthetic.sql" "$SCHEMA_DIR/02_harness.sql"
      "$M/20261008090000_security_hardening.sql" "$M/20261009090000_trust_ledgers.sql")
PAUSED=("$HERE/brief_lineup_fixture.sql" "$M/20261012090000_brief_lineup_and_scenario_labels.sql"
        "$HERE/reject_paused_report_types_fixture.sql" "$M/20261012120000_reject_paused_report_types.sql")

mk "$DB"
load "$DB" "${BASE[@]}" "${PAUSED[@]}" "$HERE/writer_guard_fixture.sql"
q "$DB" -c "\\copy wg_dump.db(j) FROM '$DUMP_DIR/daily_briefings_d219_d228.jsonl' WITH (FORMAT csv, QUOTE E'\\x01', DELIMITER E'\\x02')" >/dev/null || { echo "dump load failed"; exit 2; }
q "$DB" -c "\\copy wg_dump.cr(j) FROM '$DUMP_DIR/country_reports.jsonl' WITH (FORMAT csv, QUOTE E'\\x01', DELIMITER E'\\x02')" >/dev/null || { echo "dump load failed"; exit 2; }
load "$DB" "$HERE/writer_guard_load.sql"
echo "-- setup: replica + security_hardening + trust_ledgers + brief_lineup + reject_paused_report_types + provenance trigger + production dump"
dbm=$(q "$DB" -At -c "SELECT md5(string_agg(to_jsonb(b)::text, E'\n' ORDER BY conflict_day, report_type)) FROM public.daily_briefings b WHERE conflict_day BETWEEN 219 AND 228")
crm=$(q "$DB" -At -c "SELECT md5(string_agg(to_jsonb(c)::text, E'\n' ORDER BY country_code)) FROM public.country_reports c")
echo "   daily_briefings Days 219-228 in scratch: $(q "$DB" -At -c "SELECT count(*) FROM public.daily_briefings WHERE conflict_day BETWEEN 219 AND 228") rows, md5 $dbm (production $PROD_DB_MD5)"
echo "   country_reports in scratch:              $(q "$DB" -At -c "SELECT count(*) FROM public.country_reports") rows, md5 $crm (production $PROD_CR_MD5)"
[ "$dbm" = "$PROD_DB_MD5" ] && [ "$crm" = "$PROD_CR_MD5" ] && echo "   scratch copy identical to production: YES" || { echo "   scratch copy identical to production: NO"; rc=1; }
echo "   daily_briefings triggers: $(q "$DB" -At -c "SELECT string_agg(tgname || ':' || tgenabled::text, ', ' ORDER BY tgname) FROM pg_trigger WHERE tgrelid = 'public.daily_briefings'::regclass AND NOT tgisinternal")"

DATA="SELECT md5(coalesce(string_agg(x, E'\\n' ORDER BY x), '')) FROM (SELECT 'db|' || to_jsonb(b)::text x FROM public.daily_briefings b UNION ALL SELECT 'cr|' || to_jsonb(c)::text FROM public.country_reports c UNION ALL SELECT 'co|' || to_jsonb(k)::text FROM public.corrections k UNION ALL SELECT 'rt|' || to_jsonb(t)::text FROM public.report_types t) s"
FP="SELECT md5(coalesce((SELECT string_agg(pg_get_functiondef(p.oid) || coalesce(array_to_string(p.proacl, ','), '-'), E'\\n' ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname IN ('first_hidden_char', 'strip_hidden_chars', 'strip_hidden_chars_jsonb', 'jsonb_first_hidden_char', 'brief_fixed_line_ok', 'brief_sections_problems', 'brief_content_problems', 'country_report_content_problems', 'daily_briefings_writer_guard', 'country_reports_writer_guard')), '-') || coalesce((SELECT string_agg(pg_get_triggerdef(oid) || tgenabled::text, ',' ORDER BY tgrelid::regclass::text, tgname) FROM pg_trigger WHERE tgrelid IN ('public.daily_briefings'::regclass, 'public.country_reports'::regclass) AND NOT tgisinternal), '-'))"

echo "-- tests BEFORE migration (expected: FAIL)"
out=$(q "$DB" -At -f "$HERE/writer_guard_test.sql" 2>&1); s=$?
echo "   FAIL lines: $(echo "$out" | grep -c '^FAIL ')   PASS lines: $(echo "$out" | grep -c '^PASS ')"
echo "   ($(echo "$out" | grep -c '^FAIL replay real Day') of them are 'replay real Day 219/220 ... refused' probes; the others:)"
echo "$out" | grep -E '^FAIL ' | grep -v '^FAIL replay real Day' | cut -c1-170 | sed 's/^/   /'
echo "   exit=$s  total|pass|fail: $(echo "$out" | summ)"
[ $s -eq 0 ] && { echo "   UNEXPECTED: tests passed without the migration"; rc=1; }

d0=$(q "$DB" -At -c "$DATA")
echo "-- apply (1st)"; PGOPTIONS="-c client_min_messages=notice" $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG" 2>&1 | sed 's/^/   /'; [ "${PIPESTATUS[0]}" -eq 0 ] || { echo "apply FAILED"; rc=1; }
d1=$(q "$DB" -At -c "$DATA"); f1=$(q "$DB" -At -c "$FP")
echo "   data (daily_briefings + country_reports + corrections + report_types) before: $d0 after: $d1"
[ "$d0" = "$d1" ] && echo "   migration wrote no data: YES" || { echo "   migration wrote no data: NO"; rc=1; }

echo "-- tests AFTER (expected: PASS)"
out=$(q "$DB" -At -f "$HERE/writer_guard_test.sql" 2>&1); s=$?
echo "$out" | grep -E '^(PASS|FAIL) ' | sed 's/^/   /'
echo "-- verbatim error text of selected refusals:"
echo "$out" | grep -E '^ERROR TEXT ' | sed 's/^/   /'
echo "   exit=$s  total|pass|fail: $(echo "$out" | summ)"; [ $s -ne 0 ] && { echo "$out" | grep -vE '^(PASS|FAIL|ERROR TEXT) ' | tail -5; rc=1; }

echo "-- apply (2nd, idempotency)"; q "$DB" -f "$MIG" >/dev/null 2>&1 || { echo "re-apply FAILED"; rc=1; }
f2=$(q "$DB" -At -c "$FP"); d2=$(q "$DB" -At -c "$DATA")
echo "   guard fingerprint after 1st apply: $f1"
echo "   guard fingerprint after 2nd apply: $f2"
[ -n "$f1" ] && [ "$f1" = "$f2" ] && [ "$d1" = "$d2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }
n=$(q "$DB" -At -c "SELECT count(*) FROM pg_trigger WHERE tgname IN ('daily_briefings_writer_guard', 'country_reports_writer_guard')")
echo "   guard trigger count after 2 applies: $n"; [ "$n" = "2" ] || rc=1
out=$(q "$DB" -At -f "$HERE/writer_guard_test.sql" 2>&1); s=$?; echo "-- tests after re-apply: exit=$s  total|pass|fail: $(echo "$out" | summ)"; [ $s -ne 0 ] && rc=1
[ "${KEEP_DB:-0}" = "1" ] || PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null

echo "-- regression: reject_paused_report_types_test.sql with the writer guard installed"
R1="${DB}_rg_paused"; mk "$R1"; load "$R1" "${BASE[@]}" "${PAUSED[@]}" "$MIG"
out=$(q "$R1" -At -f "$HERE/reject_paused_report_types_test.sql" 2>&1); s=$?
echo "   exit=$s  total|pass|fail: $(echo "$out" | summ)"; echo "$out" | grep -E '^FAIL ' | sed 's/^/   /'; [ $s -ne 0 ] && rc=1
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $R1" >/dev/null

echo "-- regression: trust_ledgers_test.sql before and after the writer guard"
R2="${DB}_rg_trust"; mk "$R2"; load "$R2" "${BASE[@]}" "$HERE/reject_paused_report_types_fixture.sql"
out=$(q "$R2" -At -f "$HERE/trust_ledgers_test.sql" 2>&1); s=$?
echo "   without guard: exit=$s  $(echo "$out" | grep -E 'trust_ledgers_test:|^[0-9]+\|[0-9]+\|[0-9]+$' | tr '\n' ' ')"; [ $s -ne 0 ] && rc=1
load "$R2" "$MIG"
out=$(q "$R2" -At -f "$HERE/trust_ledgers_test.sql" 2>&1); s=$?
echo "   with guard:    exit=$s  $(echo "$out" | grep -E 'trust_ledgers_test:|^[0-9]+\|[0-9]+\|[0-9]+$' | tr '\n' ' ')"; echo "$out" | grep -E '^FAIL ' | sed 's/^/   /'; [ $s -ne 0 ] && rc=1
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $R2" >/dev/null

echo "================ overall rc=$rc"
exit $rc
