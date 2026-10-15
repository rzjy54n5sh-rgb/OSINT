#!/usr/bin/env bash
# Scratch-only test runner for 20261014090000_posture_v2_days.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql command for a scratch cluster as postgres (default: socket /var/tmp port 55417)
#   DB         = scratch database name (default pv2_days); dropped at the end
# Chain: replica + security_hardening + trust_ledgers + war_posture_v2 + production-shaped fixture +
# posture_yemen_dual_actor, then this migration twice (idempotency), then posture_v2_days_test.sql.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
DB="${DB:-pv2_days}"
M="$REPO/supabase/migrations"
apply() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -f "$1" 2>&1 | grep -v '^$'; return "${PIPESTATUS[0]}"; }
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
done
for f in "$M/20261008090000_security_hardening.sql" "$M/20261009090000_trust_ledgers.sql" "$M/20261012091000_war_posture_v2.sql" \
         "$HERE/posture_yemen_dual_actor_fixture.sql" "$M/20261013090000_posture_yemen_dual_actor.sql"; do
  apply "$f" || { echo "chain apply FAILED: $f"; exit 2; }
done
echo "-- before the migration: posture_v2_days exists? $($PSQL -d "$DB" -At -c "SELECT to_regprocedure('public.posture_v2_days()') IS NOT NULL")"
apply "$M/20261014090000_posture_v2_days.sql" || { echo "apply (1st) FAILED"; exit 1; }
apply "$M/20261014090000_posture_v2_days.sql" || { echo "apply (2nd, idempotency) FAILED"; exit 1; }
echo "-- applied twice (idempotent)"
out=$($PSQL -d "$DB" -v ON_ERROR_STOP=1 -At -f "$HERE/posture_v2_days_test.sql" 2>&1); s=$?
echo "$out"
$PSQL -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null
if [ $s -ne 0 ] || echo "$out" | grep -q '^FAIL'; then echo "posture_v2_days tests: FAILED"; exit 1; fi
echo "posture_v2_days tests: all passed ($(echo "$out" | grep -c '^PASS') checks)"
