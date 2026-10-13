#!/usr/bin/env bash
# Scratch-only test runner for 20261013120000_outlet_registry_seed.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql command for a scratch cluster as postgres (default: socket /var/tmp port 55417)
#   DB_PREFIX  = scratch database name prefix (default outlet_seed); the database is dropped at the end
# Builds replica + outlet_registry_seed_fixture.sql (production constraints/triggers on outlets & outlet_aliases,
# the 26 production article_sources rows, the production top-120 source_names), then:
#   apply (exit 0) -> tests (PASS) -> re-apply (fingerprint identical = no-op) -> a later manual edit survives a
#   re-apply (ON CONFLICT DO NOTHING, WARNING raised) -> a DELETE is still refused by the retention trigger.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
DB="${DB_PREFIX:-outlet_seed}_a"
MIG="$REPO/supabase/migrations/20261013120000_outlet_registry_seed.sql"
rc=0
apply() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$1" -v ON_ERROR_STOP=1 -q -f "$2" 2>&1 | grep -v '^$'; return "${PIPESTATUS[0]}"; }
fp() { $PSQL -d "$DB" -At -f "$HERE/outlet_registry_seed_fingerprint.sql"; }

PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
done
apply "$DB" "$HERE/outlet_registry_seed_fixture.sql" || { echo "fixture FAILED"; exit 2; }
apply "$DB" "$HERE/outlet_registry_seed_unregistered.sql" || { echo "unregistered fixture FAILED"; exit 2; }
echo "== scratch DB $DB: replica + production constraints + 26 article_sources + top-120 source_names"
echo "   before: $(fp)"

echo "-- apply (1st)"
apply "$DB" "$MIG"; s=$?; echo "   exit=$s"; [ $s -ne 0 ] && rc=1
f1=$(fp); echo "   after:  $f1"
$PSQL -d "$DB" -At -F ' | ' -c "SELECT party_status, coalesce(source_tier::text,'-') AS tier, count(*) FROM public.outlets GROUP BY 1,2 ORDER BY 1,2" | sed 's/^/   /'

echo "-- tests"
out=$($PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -At -f "$HERE/outlet_registry_seed_test.sql" 2>&1); s=$?
echo "$out" | sed 's/^/   /'
echo "   tests exit=$s"; [ $s -ne 0 ] && rc=1

echo "-- apply (2nd, idempotency)"
apply "$DB" "$MIG"; s=$?; echo "   exit=$s"; [ $s -ne 0 ] && rc=1
f2=$(fp); echo "   fingerprint 1st: $f1"; echo "   fingerprint 2nd: $f2"
[ -n "$f1" ] && [ "$f1" = "$f2" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }

echo "-- a later edit is never overwritten (edit Naharnet's tier + one alias, re-apply)"
$PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -c "UPDATE public.outlets SET source_tier = 2, classification_basis = classification_basis || ' [operator edit]' WHERE name = 'Naharnet'" \
      -c "UPDATE public.outlet_aliases SET outlet_id = (SELECT id FROM public.outlets WHERE name = 'BBC News') WHERE alias_kind = 'host' AND alias = 'prod.naharnet.com'" >/dev/null || rc=1
f3=$(fp)
w=$(PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -f "$MIG" 2>&1); s=$?
echo "   exit=$s"; echo "$w" | grep -o 'WARNING:.*' | cut -c1-200 | sed 's/^/   /'; [ $s -ne 0 ] && rc=1
f4=$(fp)
[ "$f3" = "$f4" ] && echo "   edited rows kept as edited (fingerprint unchanged by re-apply): YES" || { echo "   edited rows kept: NO"; rc=1; }
echo "$w" | grep -q 'existing outlet rows kept' && echo "$w" | grep -q 'existing aliases point elsewhere' && echo "   both WARNINGs raised: YES" || { echo "   WARNINGs raised: NO"; rc=1; }

echo "-- retention trigger still refuses DELETE"
if $PSQL -d "$DB" -q -c "DELETE FROM public.outlet_aliases WHERE alias = 'jpost.com'" >/dev/null 2>&1; then echo "   DELETE allowed: UNEXPECTED"; rc=1; else echo "   DELETE refused: YES"; fi

PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" >/dev/null && echo "-- dropped $DB"
echo "================ overall rc=$rc"
exit $rc
