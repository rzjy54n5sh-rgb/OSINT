#!/usr/bin/env bash
# Applies the WS4 heartbeat + watchdog migrations to a FRESH throwaway database and runs
# job_heartbeats_test.sql. Never point this at Supabase.
#   PGHOST=/var/tmp PGPORT=55418 PGUSER=postgres supabase/tests/run_job_heartbeats_tests.sh [dbname]
# Stand-ins (only here, never in migrations): Supabase API roles, vault.decrypted_secrets (table),
# net.http_post (records calls in net.sent), cron.schedule (records in cron_stub.jobs). The
# watchdog migration's `CREATE EXTENSION pg_net` line is skipped because a vanilla Postgres has no
# pg_net; everything else is applied verbatim.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
mig="$here/../migrations"
db="${1:-ws4_job_heartbeats_test}"

psql -X -q -v ON_ERROR_STOP=1 -d postgres -c "DROP DATABASE IF EXISTS $db" -c "CREATE DATABASE $db"
P=(psql -X -q -v ON_ERROR_STOP=1 -d "$db")

"${P[@]}" <<'SQL'
SET client_min_messages = warning;
DO $$
DECLARE r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN', r); END IF;
  END LOOP;
END $$;
CREATE SCHEMA extensions;
CREATE SCHEMA vault;
CREATE TABLE vault.decrypted_secrets (name text PRIMARY KEY, decrypted_secret text);
CREATE SCHEMA net;
CREATE TABLE net.sent (id bigserial, url text, body jsonb, timeout_milliseconds int);
CREATE FUNCTION net.http_post(url text, body jsonb DEFAULT '{}', params jsonb DEFAULT '{}',
                              headers jsonb DEFAULT '{}', timeout_milliseconds int DEFAULT 2000)
RETURNS bigint LANGUAGE sql AS
$f$ INSERT INTO net.sent (url, body, timeout_milliseconds) VALUES (url, body, timeout_milliseconds) RETURNING id $f$;
CREATE SCHEMA cron;
CREATE SCHEMA cron_stub;
CREATE TABLE cron_stub.jobs (jobname text PRIMARY KEY, schedule text, command text);
CREATE FUNCTION cron.schedule(job_name text, schedule text, command text) RETURNS bigint LANGUAGE sql AS
$f$ INSERT INTO cron_stub.jobs VALUES (job_name, schedule, command)
    ON CONFLICT (jobname) DO UPDATE SET schedule = EXCLUDED.schedule, command = EXCLUDED.command RETURNING 1::bigint $f$;
SQL

for pass in 1 2; do  # second pass proves both migrations are idempotent
  "${P[@]}" -f "$mig/20261010090000_job_heartbeats.sql" >/dev/null 2>&1 \
    || { "${P[@]}" -f "$mig/20261010090000_job_heartbeats.sql"; exit 1; }
  grep -v '^CREATE EXTENSION IF NOT EXISTS pg_net' "$mig/20261010090100_job_watchdog.sql" \
    | "${P[@]}" >/dev/null
  echo "migrations applied (pass $pass)"
done

"${P[@]}" -At -f "$here/job_heartbeats_test.sql" | grep -v "^$"
