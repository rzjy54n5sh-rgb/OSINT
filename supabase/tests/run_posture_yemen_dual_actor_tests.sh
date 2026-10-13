#!/usr/bin/env bash
# Scratch-only test runner for 20261013090000_posture_yemen_dual_actor.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql command for a scratch cluster as postgres (default: socket /var/tmp port 55417)
#   DB_PREFIX  = scratch database name prefix (default ya_dual); both databases are dropped at the end
# DB A = replica + security_hardening + trust_ledgers + war_posture_v2 (prod state on 2026-10-13) + the
# production-shaped fixture (6 evidence, 3 score rows). Runs the tests BEFORE (must fail), snapshots every
# public table, applies, runs AFTER (must pass), checks no data changed except the seed / actor default,
# re-applies (fingerprint identical = no-op), and shows that re-running the OLDER war_posture_v2 file on
# top fails as a whole (rolled back) instead of silently dropping the actor rules.
# DB B = same chain + this migration, no fixture: the existing war_posture_v2 and trust_ledgers test
# suites must still pass (no regression).
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
PREFIX="${DB_PREFIX:-ya_dual}"
MIG="$REPO/supabase/migrations/20261013090000_posture_yemen_dual_actor.sql"
WP2="$REPO/supabase/migrations/20261012091000_war_posture_v2.sql"
HARD="$REPO/supabase/migrations/20261008090000_security_hardening.sql"
TL="$REPO/supabase/migrations/20261009090000_trust_ledgers.sql"
rc=0
apply() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$1" -v ON_ERROR_STOP=1 -q -f "$2" 2>&1 | grep -v '^$'; return "${PIPESTATUS[0]}"; }
tests() { $PSQL -d "$1" -v ON_ERROR_STOP=1 -At -f "$2" 2>&1; }
summary() { grep -E '^[0-9]+\|[0-9]+\|[0-9]+$|_test:' | tr '\n' ' '; }
build() {
  PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" >/dev/null
  for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
    $PSQL -d "$1" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
  done
  apply "$1" "$HARD" || { echo "hardening apply FAILED"; exit 2; }
  apply "$1" "$TL" || { echo "trust_ledgers apply FAILED"; exit 2; }
  apply "$1" "$WP2" || { echo "war_posture_v2 apply FAILED"; exit 2; }
}
A="${PREFIX}_a"; B="${PREFIX}_b"

echo "== DB A: replica + hardening + trust_ledgers + war_posture_v2 + production-shaped fixture"
build "$A"
apply "$A" "$HERE/posture_yemen_dual_actor_fixture.sql" || { echo "fixture FAILED"; exit 2; }
echo "   rows: $($PSQL -d "$A" -At -c "SELECT (SELECT count(*) FROM posture_evidence) || ' evidence, ' || (SELECT count(*) FROM posture_scores) || ' scores'")"

echo "-- tests BEFORE the migration (expected: FAIL)"
out=$(tests "$A" "$HERE/posture_yemen_dual_actor_test.sql"); s=$?
echo "   exit=$s  total|pass|fail: $(echo "$out" | summary)"
echo "$out" | grep -cE '^FAIL ' | sed 's/^/   failing checks: /'
[ $s -eq 0 ] && { echo "   UNEXPECTED: tests passed without the migration"; rc=1; }
s0=$($PSQL -d "$A" -At -f "$HERE/posture_yemen_dual_actor_data.sql")

echo "-- apply posture_yemen_dual_actor (1st)"; apply "$A" "$MIG" || { echo "apply FAILED"; rc=1; }
echo "-- tests AFTER (expected: PASS)"
out=$(tests "$A" "$HERE/posture_yemen_dual_actor_test.sql"); s=$?; echo "$out" | grep -E '^(PASS|FAIL) '
echo "   exit=$s  total|pass|fail: $(echo "$out" | summary)"; [ $s -ne 0 ] && rc=1
s1=$($PSQL -d "$A" -At -f "$HERE/posture_yemen_dual_actor_data.sql")
seed=$($PSQL -d "$A" -At -c "SELECT string_agg(country_code || ':' || actor, ',' ORDER BY actor) FROM posture_actors")
dflt=$($PSQL -d "$A" -At -c "SELECT (SELECT count(*) FROM posture_evidence WHERE actor <> 'government') + (SELECT count(*) FROM posture_scores WHERE actor <> 'government')")
if [ -n "$s0" ] && [ "$s0" = "$s1" ]; then echo "   data unchanged in every public table (actor column aside): YES ($(echo "$s0" | wc -l) tables)"; else echo "   data unchanged: NO"; diff <(echo "$s0") <(echo "$s1"); rc=1; fi
echo "   posture_actors seed: $seed"; [ "$seed" = "YE:de_facto_authority,YE:government" ] || rc=1
echo "   existing rows with actor <> government: $dflt"; [ "$dflt" = "0" ] || rc=1

f1=$($PSQL -d "$A" -At -f "$HERE/posture_yemen_dual_actor_fingerprint.sql" | tail -1)
echo "-- apply posture_yemen_dual_actor (2nd, idempotency)"; apply "$A" "$MIG" || { echo "re-apply FAILED"; rc=1; }
f2=$($PSQL -d "$A" -At -f "$HERE/posture_yemen_dual_actor_fingerprint.sql" | tail -1)
echo "   fingerprint before re-apply: $f1"; echo "   fingerprint after  re-apply: $f2"
[ -n "$f1" ] && [ "$f1" = "$f2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }
out=$(tests "$A" "$HERE/posture_yemen_dual_actor_test.sql"); s=$?; echo "-- tests after re-apply: exit=$s  total|pass|fail: $(echo "$out" | summary)"; [ $s -ne 0 ] && rc=1
s2=$($PSQL -d "$A" -At -f "$HERE/posture_yemen_dual_actor_data.sql"); [ "$s0" = "$s2" ] && echo "   data still unchanged after re-apply: YES" || { echo "   data still unchanged after re-apply: NO"; rc=1; }

echo "-- re-running the OLDER war_posture_v2 on top (expected: FAILS as a whole, nothing changed)"
if apply "$A" "$WP2" >/dev/null 2>&1; then echo "   UNEXPECTED: war_posture_v2 re-run succeeded (would replace the actor-aware validator)"; rc=1; else echo "   war_posture_v2 re-run refused: YES"; fi
f3=$($PSQL -d "$A" -At -f "$HERE/posture_yemen_dual_actor_fingerprint.sql" | tail -1)
[ "$f1" = "$f3" ] && echo "   fingerprint unchanged after the refused re-run: YES" || { echo "   fingerprint unchanged after the refused re-run: NO"; rc=1; }

echo "== DB B: same chain + posture_yemen_dual_actor, no fixture (regression of the existing suites)"
build "$B"
apply "$B" "$MIG" || { echo "apply on B FAILED"; rc=1; }
out=$(tests "$B" "$HERE/war_posture_v2_test.sql"); s=$?
echo "   war_posture_v2_test: exit=$s  total|pass|fail: $(echo "$out" | summary)"; echo "$out" | grep -E '^FAIL '; [ $s -ne 0 ] && rc=1
out=$(tests "$B" "$HERE/trust_ledgers_test.sql"); s=$?
echo "   trust_ledgers_test:  exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' | tr '\n' ' ')"; echo "$out" | grep -E '^FAIL '; [ $s -ne 0 ] && rc=1

PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $A" -c "DROP DATABASE IF EXISTS $B" >/dev/null
echo "================ overall rc=$rc"
exit $rc
