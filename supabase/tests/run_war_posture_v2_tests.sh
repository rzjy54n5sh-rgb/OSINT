#!/usr/bin/env bash
# Scratch-only test runner for 20261012091000_war_posture_v2.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql command for a scratch cluster as postgres (default: socket /var/tmp port 55417)
# Builds a fresh database = live replica + security_hardening + trust_ledgers (the prod state on
# 2026-10-11), runs the tests BEFORE (must fail), applies, runs AFTER (must pass), re-applies and compares
# the fingerprint (must be identical), runs the tests again, then runs the trust_ledgers tests on top
# (no regression) and checks the hardening post-conditions still hold.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
MIG="$REPO/supabase/migrations/20261012091000_war_posture_v2.sql"
HARD="$REPO/supabase/migrations/20261008090000_security_hardening.sql"
TL="$REPO/supabase/migrations/20261009090000_trust_ledgers.sql"
DB=wp2_test
rc=0
apply() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" 2>&1 | grep -v '^$'; return "${PIPESTATUS[0]}"; }
tests() { $PSQL -d "$DB" -v ON_ERROR_STOP=1 -At -f "$HERE/war_posture_v2_test.sql" 2>&1; }
summary() { grep -E '^[0-9]+\|[0-9]+\|[0-9]+$|war_posture_v2_test:' | tr '\n' ' '; }

PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
done
echo "-- apply security_hardening + trust_ledgers (prod state)"
apply "$HARD" || { echo "hardening apply FAILED"; exit 2; }
apply "$TL" || { echo "trust_ledgers apply FAILED"; exit 2; }

echo "-- tests BEFORE war_posture_v2 (expected: FAIL)"
out=$(tests); s=$?; echo "   exit=$s  total|pass|fail: $(echo "$out" | summary)"
echo "$out" | grep -cE '^FAIL ' | sed 's/^/   failing checks: /'
[ $s -eq 0 ] && { echo "   UNEXPECTED: tests passed without the migration"; rc=1; }

echo "-- apply war_posture_v2 (1st)"; apply "$MIG" || { echo "apply FAILED"; rc=1; }
echo "-- tests AFTER (expected: PASS)"
out=$(tests); s=$?; echo "$out" | grep -E '^(PASS|FAIL) '
echo "   exit=$s  total|pass|fail: $(echo "$out" | summary)"; [ $s -ne 0 ] && rc=1
f1=$($PSQL -d "$DB" -At -f "$HERE/war_posture_v2_fingerprint.sql" | tail -1)
echo "-- apply war_posture_v2 (2nd, idempotency)"; apply "$MIG" || { echo "re-apply FAILED"; rc=1; }
f2=$($PSQL -d "$DB" -At -f "$HERE/war_posture_v2_fingerprint.sql" | tail -1)
echo "   fingerprint before re-apply: $f1"; echo "   fingerprint after  re-apply: $f2"
[ -n "$f1" ] && [ "$f1" = "$f2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }
out=$(tests); s=$?; echo "-- tests after re-apply: exit=$s  total|pass|fail: $(echo "$out" | summary)"; [ $s -ne 0 ] && rc=1

echo "-- trust_ledgers tests on top of war_posture_v2 (no regression)"
out=$($PSQL -d "$DB" -v ON_ERROR_STOP=1 -At -f "$HERE/trust_ledgers_test.sql" 2>&1); s=$?
echo "   exit=$s  total|pass|fail: $(echo "$out" | grep -E '^[0-9]+\|[0-9]+\|[0-9]+$' | tr '\n' ' ')"; echo "$out" | grep -E '^FAIL '; [ $s -ne 0 ] && rc=1
echo "-- security_hardening re-apply on top (its post-condition asserts must still pass)"
apply "$HARD" && echo "   hardening post-checks: PASS" || { echo "   hardening post-checks: FAIL"; rc=1; }
# Re-running the OLDER hardening file restores its own viewer_nai_v2 body (CREATE OR REPLACE), which
# drops the EG/AE/SA withholding inside that RPC (RLS on direct reads stays). Migrations run once, in
# order; if hardening is ever re-run, re-run war_posture_v2 after it. Shown here explicitly:
out=$(tests); echo "   war_posture_v2 checks failing right after a hardening re-run (expected: the 2 legacy viewer_nai_v2 EG checks): $(echo "$out" | grep -E '^FAIL ' | sed -E 's/^FAIL +[a-z_]+ +//; s/ ->.*//' | tr '\n' ';')"
apply "$MIG" || { echo "re-apply after hardening FAILED"; rc=1; }
out=$(tests); s=$?; echo "-- war_posture_v2 tests after hardening + war_posture_v2 re-apply: exit=$s  total|pass|fail: $(echo "$out" | summary)"; [ $s -ne 0 ] && rc=1
echo "================ overall rc=$rc"
exit $rc
