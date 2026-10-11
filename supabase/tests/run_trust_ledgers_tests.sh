#!/usr/bin/env bash
# Scratch-only test runner for 20261009090000_trust_ledgers.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql command for a scratch cluster as postgres (default: socket /var/tmp port 55417)
# For each order — (A) trust_ledgers on the current live schema (hardening NOT applied),
# (B) hardening then trust_ledgers, (C) trust_ledgers then hardening — it builds a fresh database, runs the
# tests BEFORE the migration (must fail), applies, runs them AFTER (must pass), re-applies and compares the
# fingerprint (must be identical), and runs the tests again.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
MIG="$REPO/supabase/migrations/20261009090000_trust_ledgers.sql"
HARD="${HARDENING:-$REPO/supabase/migrations/20261008090000_security_hardening.sql}"
rc=0
fresh() {
  PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $1" -c "CREATE DATABASE $1" >/dev/null
  for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
    $PSQL -d "$1" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
  done
}
apply() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$1" -v ON_ERROR_STOP=1 -q -f "$2" 2>&1 | grep -v '^$' ; return "${PIPESTATUS[0]}"; }
tests() { $PSQL -d "$1" -v ON_ERROR_STOP=1 -At -f "$HERE/trust_ledgers_test.sql" 2>&1; }
summary() { grep -E '^[0-9]+\|[0-9]+\|[0-9]+$|trust_ledgers_test:' | tr '\n' ' '; }
for order in A B C; do
  db="tl_$(echo $order | tr A-Z a-z)"
  echo "================ ORDER $order ($( [ $order = A ] && echo 'trust_ledgers only, no hardening' ; [ $order = B ] && echo 'hardening -> trust_ledgers' ; [ $order = C ] && echo 'trust_ledgers -> hardening' ))"
  fresh "$db"
  [ $order = B ] && { echo "-- apply hardening"; apply "$db" "$HARD" || { echo "hardening apply FAILED"; rc=1; }; }
  echo "-- tests BEFORE trust_ledgers (expected: FAIL)"
  out=$(tests "$db"); s=$?; echo "   exit=$s  total|pass|fail: $(echo "$out" | summary)"
  [ $s -eq 0 ] && { echo "   UNEXPECTED: tests passed without the migration"; rc=1; }
  echo "-- apply trust_ledgers (1st)"; apply "$db" "$MIG" || { echo "apply FAILED"; rc=1; }
  [ $order = C ] && { echo "-- apply hardening after trust_ledgers"; apply "$db" "$HARD" || { echo "hardening apply FAILED"; rc=1; }; }
  echo "-- tests AFTER (expected: PASS)"
  out=$(tests "$db"); s=$?; echo "$out" | grep -E '^(PASS|FAIL) ' > "/tmp/tl_${order}_after.txt"
  echo "   exit=$s  total|pass|fail: $(echo "$out" | summary)"; echo "$out" | grep -E '^FAIL ' ; [ $s -ne 0 ] && rc=1
  f1=$($PSQL -d "$db" -At -f "$HERE/trust_ledgers_fingerprint.sql" | tail -1)
  echo "-- apply trust_ledgers (2nd, idempotency)"; apply "$db" "$MIG" || { echo "re-apply FAILED"; rc=1; }
  f2=$($PSQL -d "$db" -At -f "$HERE/trust_ledgers_fingerprint.sql" | tail -1)
  echo "   fingerprint before re-apply: $f1"; echo "   fingerprint after  re-apply: $f2"
  [ "$f1" = "$f2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; $PSQL -d "$db" -At -f "$HERE/trust_ledgers_fingerprint.sql"; rc=1; }
  out=$(tests "$db"); s=$?; echo "-- tests after re-apply: exit=$s  total|pass|fail: $(echo "$out" | summary)"; [ $s -ne 0 ] && rc=1
done
echo "================ overall rc=$rc"
exit $rc
