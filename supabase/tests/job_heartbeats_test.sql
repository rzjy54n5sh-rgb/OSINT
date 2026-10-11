-- Tests for 20261010090000_job_heartbeats.sql and 20261010090100_job_watchdog.sql.
-- Run with supabase/tests/run_job_heartbeats_tests.sh against a THROWAWAY Postgres 17 database
-- (never against Supabase). Every check raises on failure; the script ends with 'ALL PASSED'.
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

-- helper: statement must fail with the given SQLSTATE
CREATE OR REPLACE FUNCTION pg_temp.expect_fail(p_sql text, p_state text, p_role text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN
    IF p_role IS NOT NULL THEN EXECUTE format('SET LOCAL ROLE %I', p_role); END IF;
    EXECUTE p_sql;
  EXCEPTION WHEN OTHERS THEN
    IF p_role IS NOT NULL THEN RESET ROLE; END IF;
    IF SQLSTATE <> p_state THEN
      RAISE EXCEPTION 'expected % for [%] as %, got % (%)', p_state, p_sql, p_role, SQLSTATE, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'expected failure % for [%] as %, but it succeeded', p_state, p_sql, p_role;
END $$;

BEGIN;
-- 1. service_role: insert + select allowed; update/delete/truncate denied (append-only)
SET LOCAL ROLE service_role;
INSERT INTO public.job_heartbeats (job, status, detail) VALUES ('collect-markets', 'ok', 'test');
DO $$ BEGIN ASSERT (SELECT count(*) FROM public.job_heartbeats WHERE detail = 'test') = 1, 'service_role select'; END $$;
RESET ROLE;
SELECT pg_temp.expect_fail($q$UPDATE public.job_heartbeats SET status = 'fail'$q$, '42501', 'service_role');
SELECT pg_temp.expect_fail($q$DELETE FROM public.job_heartbeats$q$, '42501', 'service_role');
SELECT pg_temp.expect_fail($q$TRUNCATE public.job_heartbeats$q$, '42501', 'service_role');

-- 2. anon / authenticated: no access at all (table, sequence, functions)
SELECT pg_temp.expect_fail($q$SELECT * FROM public.job_heartbeats$q$, '42501', 'anon');
SELECT pg_temp.expect_fail($q$INSERT INTO public.job_heartbeats (job, status) VALUES ('x1', 'ok')$q$, '42501', 'anon');
SELECT pg_temp.expect_fail($q$SELECT * FROM public.job_heartbeats$q$, '42501', 'authenticated');
SELECT pg_temp.expect_fail($q$INSERT INTO public.job_heartbeats (job, status) VALUES ('x1', 'ok')$q$, '42501', 'authenticated');
SELECT pg_temp.expect_fail($q$SELECT * FROM public.job_heartbeat_latest()$q$, '42501', 'anon');
SELECT pg_temp.expect_fail($q$SELECT * FROM public.job_heartbeat_overdue()$q$, '42501', 'authenticated');
SELECT pg_temp.expect_fail($q$SELECT public.job_watchdog_tick()$q$, '42501', 'service_role');

-- 3. constraints
SELECT pg_temp.expect_fail($q$INSERT INTO public.job_heartbeats (job, status) VALUES ('Bad Job!', 'ok')$q$, '23514');
SELECT pg_temp.expect_fail($q$INSERT INTO public.job_heartbeats (job, status) VALUES ('collect-markets', 'great')$q$, '23514');
SELECT pg_temp.expect_fail($q$INSERT INTO public.job_heartbeats (job, status, detail) VALUES ('collect-markets', 'ok', repeat('x', 2001))$q$, '23514');
SELECT pg_temp.expect_fail($q$INSERT INTO public.job_heartbeats (id, job, status) VALUES (1, 'collect-markets', 'ok')$q$, '428C9');

-- 4. grants and RLS as declared
DO $$
BEGIN
  ASSERT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.job_heartbeats'::regclass), 'RLS on';
  ASSERT NOT has_table_privilege('anon', 'public.job_heartbeats', 'SELECT'), 'anon no select';
  ASSERT NOT has_table_privilege('authenticated', 'public.job_heartbeats', 'INSERT'), 'auth no insert';
  ASSERT has_table_privilege('service_role', 'public.job_heartbeats', 'INSERT'), 'service insert';
  ASSERT NOT has_table_privilege('service_role', 'public.job_heartbeats', 'UPDATE'), 'service no update';
  ASSERT (SELECT array_agg(policyname::text ORDER BY policyname) FROM pg_policies WHERE tablename = 'job_heartbeats')
         = ARRAY['job_heartbeats_service_insert', 'job_heartbeats_service_select'], 'policies';
  ASSERT (SELECT bool_and(roles = '{service_role}') FROM pg_policies WHERE tablename = 'job_heartbeats'), 'policy roles';
END $$;
ROLLBACK;

-- 5. overdue / latest logic at fixed times
BEGIN;
TRUNCATE public.job_heartbeats;
INSERT INTO public.job_heartbeats (job, ran_at, status) VALUES
  ('collect-markets',  '2026-10-10 10:00Z', 'ok'),
  ('collect-markets',  '2026-10-10 10:30Z', 'fail'),      -- latest run failed; last OK 10:00
  ('collect-articles', '2026-10-10 11:00Z', 'ok'),
  ('scenario-daily',   '2026-10-09 05:21Z', 'fail');      -- never succeeded
-- db-backup / db-restore-test never reported: must NOT be overdue (not set up yet)
DO $$
DECLARE got text;
BEGIN
  SELECT string_agg(job || '=' || coalesce(late_by::text, 'never'), ',' ORDER BY job) INTO got
  FROM public.job_heartbeat_overdue('2026-10-10 12:00Z');
  ASSERT got = 'collect-markets=00:30:00,scenario-daily=never', 'overdue at 12:00 got ' || coalesce(got, '<none>');
  SELECT string_agg(job, ',' ORDER BY job) INTO got FROM public.job_heartbeat_overdue('2026-10-10 11:20Z');
  ASSERT got = 'scenario-daily', 'overdue at 11:20 got ' || coalesce(got, '<none>');
  SELECT string_agg(job || ':' || last_status || ':' || to_char(last_ok_at AT TIME ZONE 'UTC', 'HH24:MI'), ',' ORDER BY job)
    INTO got FROM public.job_heartbeat_latest() WHERE job = 'collect-markets';
  ASSERT got = 'collect-markets:fail:10:00', 'latest got ' || got;
END $$;
ROLLBACK;

-- 6. watchdog tick with stand-ins for vault / net (see runner): not configured -> 0; configured ->
--    one message per late job; second tick inside the 6 h cooldown -> 0.
BEGIN;
TRUNCATE public.job_heartbeats;
INSERT INTO public.job_heartbeats (job, ran_at, status) VALUES
  ('collect-markets', now() - interval '3 hours', 'ok'),
  ('collect-articles', now() - interval '10 minutes', 'ok'),
  ('db-backup', now() - interval '30 hours', 'ok');
DELETE FROM vault.decrypted_secrets;
DO $$ BEGIN ASSERT public.job_watchdog_tick() = 0, 'not configured -> 0'; END $$;
INSERT INTO vault.decrypted_secrets (name, decrypted_secret) VALUES
  ('telegram_bot_token', '123:TEST'), ('telegram_chat_id', '42');
DO $$
DECLARE n int;
BEGIN
  n := public.job_watchdog_tick();
  ASSERT n = 2, 'first tick sends 2, got ' || n;
  ASSERT (SELECT count(*) FROM net.sent) = 2, 'two POSTs';
  ASSERT (SELECT bool_and(url = 'https://api.telegram.org/bot123:TEST/sendMessage' AND body->>'chat_id' = '42'
                          AND body->>'text' LIKE 'MENA Intel Desk watchdog: % is late.%') FROM net.sent), 'payload';
  n := public.job_watchdog_tick();
  ASSERT n = 0, 'cooldown: second tick sends 0, got ' || n;
  ASSERT (SELECT count(*) FROM public.job_heartbeats WHERE job = 'watchdog') = 2, 'cooldown state rows';
  ASSERT NOT EXISTS (SELECT 1 FROM public.job_heartbeat_latest() WHERE job = 'watchdog'), 'watchdog hidden from latest';
END $$;
ROLLBACK;

DO $$ BEGIN ASSERT (SELECT count(*) FROM cron_stub.jobs WHERE jobname = 'job-watchdog' AND schedule = '*/15 * * * *') = 1,
  'cron job registered once'; END $$;

SELECT 'ALL PASSED' AS result;
