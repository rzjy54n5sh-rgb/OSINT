#!/usr/bin/env bash
# Nightly encrypted logical backup of the Supabase database, and its weekly restore drill.
# Used by .github/workflows/db-backup.yml; runnable locally for testing (see `usage`).
#
#   dump    <out_dir>              pg_dump public (schema+data) and auth (schema+data) from ONE
#                                  exported snapshot, record exact per-table row counts taken in
#                                  that same snapshot (manifest.json), tar, encrypt with age.
#   upload  <file.tar.age>         upload to R2 daily/, copy to monthly/<YYYY-MM>/ if the month has
#                                  none yet, prune to the newest 30 daily / 12 monthly (best effort;
#                                  the R2 lifecycle rules are the primary retention control).
#   fetch-latest <out_dir>         download the newest daily/ backup and check its .sha256.
#   restore-verify <file.tar.age> <target_db_url>
#                                  decrypt, restore into an empty Postgres, compare every table's
#                                  row count with the manifest (must match exactly).
#
# Environment:
#   DB_URL                 source connection string (Supabase session pooler, port 5432)  [dump]
#   BACKUP_AGE_RECIPIENT   age public key(s), one per line ("age1...")                     [dump]
#   BACKUP_AGE_KEY         age private key ("AGE-SECRET-KEY-1...")                       [restore]
#   R2_ACCOUNT_ID R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY            [upload/fetch-latest]
#   S3_ENDPOINT            optional override of https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com
#   KEEP_DAILY (30) KEEP_MONTHLY (12)
#
# Never prints secrets: connection strings and keys are only passed through env/files (umask 077).
set -Eeuo pipefail
umask 077

log() { printf '[db_backup] %s\n' "$*" >&2; }
die() { printf '::error::[db_backup] %s\n' "$*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "missing tool: $1"; }

usage() {
  sed -n '2,24p' "$0" >&2
  exit 2
}

# Per-table exact row counts for the given schemas, as one JSON object {"schema.table": n}.
# query_to_xml runs count(*) per table inside the current transaction/snapshot.
count_sql() {
  cat <<'SQL'
SELECT coalesce(json_object_agg(t.k, t.n ORDER BY t.k), '{}'::json)
FROM (
  SELECT format('%s.%s', n.nspname, c.relname) AS k,
         (xpath('/row/c/text()',
                query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname),
                             false, true, '')))[1]::text::bigint AS n
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relkind IN ('r', 'p') AND n.nspname IN ('public', 'auth')
) t;
SQL
}

cmd_dump() {
  local out="${1:?out_dir}"
  need psql; need pg_dump; need pg_restore; need age; need sha256sum; need tar
  [ -n "${DB_URL:-}" ] || die "DB_URL is not set"
  [ -n "${BACKUP_AGE_RECIPIENT:-}" ] || die "BACKUP_AGE_RECIPIENT is not set"
  mkdir -p "$out"
  local work stamp server_num client_major
  work="$(mktemp -d)"
  # EXIT, not RETURN: die() exits, and a RETURN trap never runs on exit, which left the plaintext
  # dumps/tar in $work after any failure. One command per invocation, so EXIT is safe.
  # shellcheck disable=SC2064  # expand now: the trap must remove this run's dir
  trap "rm -rf '$work'" EXIT
  stamp="$(date -u +%Y%m%dT%H%M%SZ)"
  local recips="$work/recipients.txt" name="mena-db-$stamp.tar"
  printf '%s\n' "$BACKUP_AGE_RECIPIENT" | grep -E '^age1[0-9a-z]+$' > "$recips" \
    || die "BACKUP_AGE_RECIPIENT holds no age public key (expected lines starting with age1)"

  server_num="$(psql "$DB_URL" -X -At -v ON_ERROR_STOP=1 -c 'SHOW server_version_num')" \
    || die "cannot connect to the source database (pooler unreachable or bad DB_URL)"
  client_major="$(pg_dump --version | sed -E 's/.* ([0-9]+)(\.[0-9]+)?.*/\1/')"
  [ "$client_major" -ge $((server_num / 10000)) ] \
    || die "pg_dump $client_major is older than server $((server_num / 10000)); install postgresql-client-$((server_num / 10000))"
  log "server_version_num=$server_num pg_dump major=$client_major"

  # Hold one REPEATABLE READ transaction open and export its snapshot: both pg_dump runs and the
  # row counts see exactly the same data, so the restore drill can demand exact equality.
  coproc SNAP { psql "$DB_URL" -X -q -At -v ON_ERROR_STOP=1 2>&1; }
  local snap counts
  # statement_timeout 0: a role/pooler default (e.g. 2 min) must not cut the row counts short.
  # idle_in_transaction_session_timeout 0: this session sits idle-in-transaction while pg_dump runs;
  # a role default would kill it and the next pg_dump fails with 'snapshot ... does not exist'.
  printf 'SET statement_timeout = 0;\nSET idle_in_transaction_session_timeout = 0;\nBEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\nSELECT pg_export_snapshot();\n' >&"${SNAP[1]}"
  IFS= read -r -t 60 snap <&"${SNAP[0]}" || die "could not export a snapshot"
  [[ "$snap" =~ ^[0-9A-F-]+$ ]] || die "unexpected snapshot id from the server: $snap"
  { count_sql | tr '\n' ' '; printf '\n'; } >&"${SNAP[1]}"
  IFS= read -r -t 600 counts <&"${SNAP[0]}" || die "row-count query failed"
  [[ "$counts" == \{* ]] || die "row-count query failed: ${counts:0:200}"

  log "pg_dump public (schema + data) at snapshot $snap"
  pg_dump "$DB_URL" --snapshot="$snap" --format=custom --compress=6 --schema=public \
    --file="$work/public.dump"
  # auth: schema + data. For a restore into a NEW Supabase project use only its data section
  # (pg_restore --data-only): Supabase manages the auth DDL (see RUNBOOK in docs/backup-restore.md).
  log "pg_dump auth (schema + data) at snapshot $snap"
  pg_dump "$DB_URL" --snapshot="$snap" --format=custom --compress=6 --schema=auth \
    --file="$work/auth.dump"
  # Release the snapshot session. pg_dump has already imported the snapshot, so a session the
  # pooler dropped meanwhile is harmless: ignore SIGPIPE / a closed coproc instead of aborting.
  if [ -n "${SNAP_PID:-}" ] && kill -0 "$SNAP_PID" 2>/dev/null; then
    trap '' PIPE
    { printf 'COMMIT;\n\\q\n' >&"${SNAP[1]}"; } 2>/dev/null || true
    trap - PIPE
    wait "$SNAP_PID" 2>/dev/null || true
  fi

  pg_restore --list "$work/public.dump" >/dev/null || die "public.dump TOC unreadable"
  pg_restore --list "$work/auth.dump" >/dev/null || die "auth.dump TOC unreadable"

  local tables rows
  tables="$(python3 -c 'import json,sys; print(len(json.loads(sys.argv[1])))' "$counts")"
  rows="$(python3 -c 'import json,sys; print(sum(json.loads(sys.argv[1]).values()))' "$counts")"
  python3 - "$work/manifest.json" "$stamp" "$server_num" "$(pg_dump --version)" "$counts" \
    "$work/public.dump" "$work/auth.dump" <<'PY'
import hashlib, json, os, sys
path, stamp, server, client, counts, *files = sys.argv[1:]
def sha(p):
    h = hashlib.sha256()
    with open(p, 'rb') as f:
        for b in iter(lambda: f.read(1 << 20), b''):
            h.update(b)
    return h.hexdigest()
json.dump({
    'format': 'mena-intel-desk-backup/1',
    'created_utc': stamp,
    'server_version_num': int(server),
    'pg_dump': client,
    'snapshot_consistent': True,
    'schemas': {'public': 'schema+data', 'auth': 'schema+data (restore data only into Supabase)'},
    'row_counts': json.loads(counts),
    'files': {os.path.basename(p): {'bytes': os.path.getsize(p), 'sha256': sha(p)} for p in files},
}, open(path, 'w'), indent=1, sort_keys=True)
PY
  log "manifest: $tables tables, $rows rows"

  tar -C "$work" -cf "$work/$name" manifest.json public.dump auth.dump
  age --encrypt --recipients-file "$recips" --output "$out/$name.age" "$work/$name"
  (cd "$out" && sha256sum "$name.age" > "$name.age.sha256")
  log "wrote $out/$name.age ($(stat -c %s "$out/$name.age") bytes)"
  if [ -n "${GITHUB_OUTPUT:-}" ]; then
    { echo "file=$out/$name.age"; echo "tables=$tables"; echo "rows=$rows"; } >> "$GITHUB_OUTPUT"
  fi
}

s3_env_check() {
  local v missing=""
  for v in R2_BUCKET R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY; do
    [ -n "${!v:-}" ] || missing="$missing $v"
  done
  [ -n "${S3_ENDPOINT:-}${R2_ACCOUNT_ID:-}" ] || missing="$missing R2_ACCOUNT_ID"
  [ -z "$missing" ] || die "not set:$missing"
}

s3() {
  need aws
  local endpoint="${S3_ENDPOINT:-}"
  if [ -z "$endpoint" ]; then
    [ -n "${R2_ACCOUNT_ID:-}" ] || die "R2_ACCOUNT_ID is not set"
    endpoint="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  fi
  AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:?R2_ACCESS_KEY_ID is not set}" \
  AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:?R2_SECRET_ACCESS_KEY is not set}" \
  AWS_DEFAULT_REGION=auto AWS_EC2_METADATA_DISABLED=true \
    aws --endpoint-url "$endpoint" "$@"
}

# Keys under a prefix, oldest first (names embed a UTC timestamp, so lexical order = time order).
list_keys() {
  s3 s3api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$1" \
    --query 'Contents[].Key' --output text | tr '\t' '\n' | grep -v '^None$' | sort || true
}

prune() {
  local prefix="$1" keep="$2" k old
  mapfile -t old < <(list_keys "$prefix" | grep -E '\.tar\.age$' | head -n "-$keep")
  for k in "${old[@]}"; do
    [ -n "$k" ] || continue
    log "prune s3://$R2_BUCKET/$k"
    s3 s3 rm --only-show-errors "s3://$R2_BUCKET/$k" \
      && s3 s3 rm --only-show-errors "s3://$R2_BUCKET/$k.sha256" \
      || echo "::warning::[db_backup] could not delete $k (token may lack delete; the R2 lifecycle rule will expire it)"
  done
}

cmd_upload() {
  local file="${1:?file.tar.age}" name month size remote
  s3_env_check
  if [ ! -s "$file" ] || [ ! -s "$file.sha256" ]; then die "missing $file or its .sha256"; fi
  name="$(basename "$file")"
  month="$(sed -E 's/^mena-db-([0-9]{4})([0-9]{2}).*/\1-\2/' <<<"$name")"
  size="$(stat -c %s "$file")"
  # .sha256 first: fetch-latest picks the newest .tar.age, so a run that dies between the two
  # uploads must not leave a tarball without its checksum (the drill would fail on it).
  s3 s3 cp --only-show-errors "$file.sha256" "s3://$R2_BUCKET/daily/$name.sha256"
  s3 s3 cp --only-show-errors "$file" "s3://$R2_BUCKET/daily/$name"
  remote="$(s3 s3api head-object --bucket "$R2_BUCKET" --key "daily/$name" --query ContentLength --output text)"
  [ "$remote" = "$size" ] || die "uploaded size $remote != local $size"
  log "uploaded daily/$name ($size bytes, verified)"
  if [ -z "$(list_keys "monthly/$month/" | grep -E '\.tar\.age$' || true)" ]; then
    s3 s3 cp --only-show-errors "$file.sha256" "s3://$R2_BUCKET/monthly/$month/$name.sha256"
    s3 s3 cp --only-show-errors "$file" "s3://$R2_BUCKET/monthly/$month/$name"
    log "first backup of $month: also stored as monthly/$month/$name"
  fi
  prune daily/ "${KEEP_DAILY:-30}"
  prune monthly/ "${KEEP_MONTHLY:-12}"
}

cmd_fetch_latest() {
  local out="${1:?out_dir}" key name
  s3_env_check
  mkdir -p "$out"
  key="$(list_keys daily/ | grep -E '\.tar\.age$' | tail -n 1 || true)"
  [ -n "$key" ] || die "no backups under s3://$R2_BUCKET/daily/"
  name="$(basename "$key")"
  s3 s3 cp --only-show-errors "s3://$R2_BUCKET/$key" "$out/$name"
  s3 s3 cp --only-show-errors "s3://$R2_BUCKET/$key.sha256" "$out/$name.sha256"
  (cd "$out" && sha256sum --check --quiet "$name.sha256") || die "checksum mismatch for $name"
  log "fetched $key"
  [ -z "${GITHUB_OUTPUT:-}" ] || echo "file=$out/$name" >> "$GITHUB_OUTPUT"
}

# Minimal stand-ins for what a Supabase database provides, so a dump restores into a vanilla
# postgres:17: API roles (named in GRANTs/policies), auth.uid()/role()/jwt() (used by RLS
# policies), and the extensions schema (pgcrypto / uuid-ossp defaults). Idempotent.
STUB_SQL=$(cat <<'SQL'
SET client_min_messages = warning;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role','authenticator',
                           'supabase_admin','supabase_auth_admin','dashboard_user'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('CREATE ROLE %I NOLOGIN', r);
    END IF;
  END LOOP;
END $$;
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions;
SQL
)
# auth.* helper functions are created only if the auth dump did not bring them.
AUTH_FN_SQL=$(cat <<'SQL'
SET client_min_messages = warning;
CREATE SCHEMA IF NOT EXISTS auth;
DO $$
BEGIN
  IF to_regprocedure('auth.uid()') IS NULL THEN
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULL::uuid';
  END IF;
  IF to_regprocedure('auth.role()') IS NULL THEN
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS 'SELECT NULL::text';
  END IF;
  IF to_regprocedure('auth.jwt()') IS NULL THEN
    CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS 'SELECT NULL::jsonb';
  END IF;
END $$;
SQL
)

cmd_restore_verify() {
  local file="${1:?file.tar.age}" target="${2:?target_db_url}"
  need age; need pg_restore; need psql; need tar
  [ -n "${BACKUP_AGE_KEY:-}" ] || die "BACKUP_AGE_KEY is not set"
  local work errs=0 rc
  work="$(mktemp -d)"
  # EXIT (see cmd_dump): the decrypted dumps must not survive a failed drill.
  # shellcheck disable=SC2064
  trap "rm -rf '$work'" EXIT
  printf '%s\n' "$BACKUP_AGE_KEY" > "$work/key.txt"
  age --decrypt --identity "$work/key.txt" --output "$work/b.tar" "$file" || die "decrypt failed (wrong BACKUP_AGE_KEY?)"
  rm -f "$work/key.txt"
  tar -C "$work" -xf "$work/b.tar"
  python3 - "$work" <<'PY' || die "dump files do not match the manifest checksums"
import hashlib, json, os, sys
w = sys.argv[1]; m = json.load(open(os.path.join(w, 'manifest.json')))
for name, meta in m['files'].items():
    h = hashlib.sha256(open(os.path.join(w, name), 'rb').read()).hexdigest()
    assert h == meta['sha256'], name
PY
  # The target must be empty: restoring over existing tables fails on conflicts and would leave
  # the old rows in place, so the counts could match by accident.
  local existing
  existing="$(psql "$target" -X -At -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname IN ('public','auth')")" \
    || die "cannot connect to the restore target"
  [ "$existing" = 0 ] || die "restore target is not empty ($existing tables in public/auth); use a fresh database"
  psql "$target" -X -q -v ON_ERROR_STOP=1 -c "$STUB_SQL" >/dev/null
  # auth first (public RLS policies and FKs may reference auth.users / auth.uid()).
  for part in auth public; do
    rc=0
    # pg_restore continues past errors and exits 1 at the end; counts decide pass/fail.
    pg_restore --dbname="$target" --no-owner --no-acl \
      "$work/$part.dump" 2> "$work/$part.err" || rc=$?
    if [ "$rc" -ne 0 ]; then
      # 'schema "public" already exists' is expected (every database has it) and not counted.
      grep '^pg_restore: error:' "$work/$part.err" | grep -v 'schema "public" already exists' \
        > "$work/$part.real" || true
      if [ -s "$work/$part.real" ]; then
        errs=$((errs + $(wc -l < "$work/$part.real")))
        echo "::warning::[db_backup] pg_restore $part reported errors (first lines below)"
        head -n 15 "$work/$part.real" >&2
      fi
    fi
    if [ "$part" = auth ]; then
      psql "$target" -X -q -v ON_ERROR_STOP=1 -c "$AUTH_FN_SQL" >/dev/null
    fi
  done
  local restored
  restored="$(psql "$target" -X -At -v ON_ERROR_STOP=1 -c "$(count_sql)")"
  python3 - "$work/manifest.json" "$restored" "$errs" <<'PY'
import json, sys
m = json.load(open(sys.argv[1])); got = json.loads(sys.argv[2]); errs = int(sys.argv[3])
want = m['row_counts']; bad = []
for t, n in sorted(want.items()):
    g = got.get(t)
    status = 'OK' if g == n else 'MISMATCH'
    if g != n: bad.append(t)
    print(f'{status:8} {t:55} manifest={n:>9} restored={g}')
print(f'tables={len(want)} rows={sum(want.values())} mismatches={len(bad)} pg_restore_errors={errs} '
      f'backup_created={m["created_utc"]}')
if bad:
    print('::error::[db_backup] restore drill FAILED: ' + ', '.join(bad[:20]))
    sys.exit(1)
PY
}

main() {
  local cmd="${1:-}"; shift || true
  case "$cmd" in
    dump) cmd_dump "$@" ;;
    upload) cmd_upload "$@" ;;
    fetch-latest) cmd_fetch_latest "$@" ;;
    restore-verify) cmd_restore_verify "$@" ;;
    *) usage ;;
  esac
}
main "$@"
