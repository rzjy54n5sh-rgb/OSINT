#!/usr/bin/env bash
# Scratch-only test runner for 20261013120000_outlet_registry_seed.sql. NEVER point it at production.
#   SCHEMA_DIR = dir with 00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql (live-schema replica)
#   PSQL       = psql command for a scratch cluster as postgres (default: socket /var/tmp port 55417)
#   DB_PREFIX  = scratch database name prefix (default outlet_seed); the database is dropped at the end
# Builds replica + outlet_registry_seed_fixture.sql (production constraints/triggers on outlets & outlet_aliases,
# the 26 production article_sources rows, the production top-120 source_names), then:
#   apply (exit 0) -> tests (PASS) -> re-apply (fingerprint identical = no-op) -> a later manual edit survives a
#   re-apply (ON CONFLICT DO NOTHING, WARNING raised) -> a DELETE is still refused by the retention trigger.
# Part B (second scratch DB, ${DB_PREFIX}_b) covers 20261013200000_outlet_registry_rulings.sql on top of the seed:
#   seed + candidate guard -> snapshot (= production registry, md5-checked) -> rulings apply (exit 0) -> rulings tests
#   -> seed and rulings candidate-guard tests -> re-apply rulings AND seed (fingerprint identical = no-op) -> a later
#   edit survives a re-apply (WARNINGs) -> preflight refuses a database without the registry tables.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"
SCHEMA_DIR="${SCHEMA_DIR:?set SCHEMA_DIR to the live-schema replica directory}"
PSQL="${PSQL:-psql -h /var/tmp -p 55417 -U postgres -X}"
DB="${DB_PREFIX:-outlet_seed}_a"
MIG="$REPO/supabase/migrations/20261013120000_outlet_registry_seed.sql"
MIG_GUARD="$REPO/supabase/migrations/20261013120100_candidate_guard_distinct_outlets.sql"
MIG_RUL="$REPO/supabase/migrations/20261013200000_outlet_registry_rulings.sql"
DB_B="${DB_PREFIX:-outlet_seed}_b"
DB_C="${DB_PREFIX:-outlet_seed}_c"
rc=0
apply() { PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$1" -v ON_ERROR_STOP=1 -q -f "$2" 2>&1 | grep -v '^$'; return "${PIPESTATUS[0]}"; }
fp() { $PSQL -d "$DB" -At -f "$HERE/outlet_registry_seed_fingerprint.sql"; }

PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB" -c "CREATE DATABASE $DB" >/dev/null
for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
  $PSQL -d "$DB" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
done
apply "$DB" "$HERE/outlet_registry_seed_fixture.sql" || { echo "fixture FAILED"; exit 2; }
apply "$DB" "$HERE/outlet_registry_seed_unregistered.sql" || { echo "unregistered fixture FAILED"; exit 2; }
apply "$DB" "$HERE/outlet_registry_guard_fixture.sql" || { echo "guard fixture FAILED"; exit 2; }
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

echo "-- candidate guard (apply $(basename "$MIG_GUARD"), twice)"
apply "$DB" "$MIG_GUARD"; s=$?; apply "$DB" "$MIG_GUARD"; s2=$?; echo "   exit=$s/$s2"; [ $s -ne 0 ] || [ $s2 -ne 0 ] && rc=1
out=$($PSQL -d "$DB" -v ON_ERROR_STOP=1 -q -At -f "$HERE/outlet_registry_guard_test.sql" 2>&1); s=$?
echo "$out" | sed 's/^/   /'
echo "   guard tests exit=$s"; [ $s -ne 0 ] && rc=1

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

# ===================================== Part B: 20261013200000_outlet_registry_rulings.sql =====================================
fpb() { $PSQL -d "$DB_B" -At -f "$HERE/outlet_registry_seed_fingerprint.sql"; }
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB_B" -c "CREATE DATABASE $DB_B" >/dev/null
for f in 00_live_schema.sql 01_seed_synthetic.sql 02_harness.sql; do
  $PSQL -d "$DB_B" -q -v ON_ERROR_STOP=1 -f "$SCHEMA_DIR/$f" >/dev/null || { echo "schema load failed: $f"; exit 2; }
done
for f in outlet_registry_seed_fixture.sql outlet_registry_seed_unregistered.sql outlet_registry_guard_fixture.sql; do
  apply "$DB_B" "$HERE/$f" || { echo "$f FAILED"; exit 2; }
done
echo "== Part B: scratch DB $DB_B (rulings on top of the seed)"
echo "-- seed + candidate guard (production state)"
apply "$DB_B" "$MIG"; s=$?; apply "$DB_B" "$MIG_GUARD"; s2=$?; echo "   exit=$s/$s2"; [ $s -ne 0 ] || [ $s2 -ne 0 ] && rc=1
$PSQL -d "$DB_B" -q -v ON_ERROR_STOP=1 \
  -c "CREATE TABLE t_registry_before AS SELECT a.alias_kind, a.alias, o.name AS outlet_name FROM public.outlet_aliases a JOIN public.outlets o ON o.id = a.outlet_id" \
  -c "CREATE TABLE t_outlets_before AS SELECT * FROM public.outlets" >/dev/null || rc=1
b0=$(fpb); echo "   before rulings: $b0"

echo "-- apply rulings (1st)"
apply "$DB_B" "$MIG_RUL"; s=$?; echo "   exit=$s"; [ $s -ne 0 ] && rc=1
b1=$(fpb); echo "   after:  $b1"
$PSQL -d "$DB_B" -At -F ' | ' -c "SELECT party_status, coalesce(source_tier::text,'-') AS tier, count(*) FROM public.outlets GROUP BY 1,2 ORDER BY 1,2" | sed 's/^/   /'

echo "-- rulings tests"
out=$($PSQL -d "$DB_B" -v ON_ERROR_STOP=1 -q -At -f "$HERE/outlet_registry_rulings_test.sql" 2>&1); s=$?
echo "$out" | sed 's/^/   /'
echo "   rulings tests exit=$s"; [ $s -ne 0 ] && rc=1

echo "-- candidate guard after the rulings (seed guard tests, then rulings guard tests)"
out=$($PSQL -d "$DB_B" -v ON_ERROR_STOP=1 -q -At -f "$HERE/outlet_registry_guard_test.sql" 2>&1); s=$?
echo "$out" | sed 's/^/   /'; echo "   seed guard tests exit=$s"; [ $s -ne 0 ] && rc=1
out=$($PSQL -d "$DB_B" -v ON_ERROR_STOP=1 -q -At -f "$HERE/outlet_registry_rulings_guard_test.sql" 2>&1); s=$?
echo "$out" | sed 's/^/   /'; echo "   rulings guard tests exit=$s"; [ $s -ne 0 ] && rc=1

echo "-- re-apply rulings, then the seed (idempotency)"
apply "$DB_B" "$MIG_RUL"; s=$?; b2=$(fpb); apply "$DB_B" "$MIG"; s2=$?; b3=$(fpb)
echo "   exit=$s/$s2"; [ $s -ne 0 ] || [ $s2 -ne 0 ] && rc=1
echo "   fingerprint 1st:            $b1"; echo "   after rulings re-apply:     $b2"; echo "   after seed re-apply:        $b3"
[ -n "$b1" ] && [ "$b1" = "$b2" ] && [ "$b1" = "$b3" ] && echo "   re-apply is a no-op: YES" || { echo "   re-apply is a no-op: NO"; rc=1; }

echo "-- a later edit is never overwritten (edit Gulf News's status + the abc.net.au host alias, re-apply rulings)"
$PSQL -d "$DB_B" -q -v ON_ERROR_STOP=1 \
  -c "UPDATE public.outlets SET party_status = 'state_aligned', party_affiliation = 'UAE (operator edit)' WHERE name = 'Gulf News'" \
  -c "UPDATE public.outlet_aliases SET outlet_id = (SELECT id FROM public.outlets WHERE name = 'BBC News') WHERE alias_kind = 'host' AND alias = 'abc.net.au'" >/dev/null || rc=1
b4=$(fpb)
w=$(PGOPTIONS="-c client_min_messages=warning" $PSQL -d "$DB_B" -v ON_ERROR_STOP=1 -q -f "$MIG_RUL" 2>&1); s=$?
echo "   exit=$s"; echo "$w" | grep -o 'WARNING:.*' | cut -c1-200 | sed 's/^/   /'; [ $s -ne 0 ] && rc=1
b5=$(fpb)
[ "$b4" = "$b5" ] && echo "   edited rows kept as edited (fingerprint unchanged by re-apply): YES" || { echo "   edited rows kept: NO"; rc=1; }
echo "$w" | grep -q 'outlet_registry_rulings: existing outlet rows kept' && echo "$w" | grep -q 'outlet_registry_rulings: existing aliases point elsewhere' \
  && echo "   both WARNINGs raised: YES" || { echo "   WARNINGs raised: NO"; rc=1; }

echo "-- preflight refuses a database without the registry tables (nothing written)"
PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB_C" -c "CREATE DATABASE $DB_C" >/dev/null
w=$(apply "$DB_C" "$MIG_RUL"); s=$?
echo "$w" | grep -o 'ERROR:.*' | cut -c1-160 | sed 's/^/   /'
[ $s -ne 0 ] && echo "$w" | grep -q 'outlet_registry_rulings: public.outlets / public.outlet_aliases missing' \
  && echo "   refused: YES (exit=$s)" || { echo "   refused: NO (exit=$s)"; rc=1; }

PGOPTIONS="-c client_min_messages=warning" $PSQL -q -c "DROP DATABASE IF EXISTS $DB_B" -c "DROP DATABASE IF EXISTS $DB_C" >/dev/null && echo "-- dropped $DB_B, $DB_C"
echo "================ overall rc=$rc"
exit $rc
