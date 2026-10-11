-- =====================================================================================================
-- 20261010090100_job_watchdog.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- WS4 watchdog: every 15 min pg_cron asks public.job_heartbeat_overdue() (20261010090000) which jobs
-- are past their SLA and sends ONE Telegram message per late job per 6 hours via pg_net.
-- Why in the database: it is independent of both clocks it watches (GitHub schedule and the
-- Cloudflare scheduler Worker); it needs no new key anywhere (the bot token stays in Supabase Vault).
--
-- Prerequisites (operator, once, in the SQL editor — values are never committed):
--   select vault.create_secret('<bot token from @BotFather>', 'telegram_bot_token', 'WS4 watchdog');
--   select vault.create_secret('<numeric chat id>',          'telegram_chat_id',   'WS4 watchdog');
-- Without them the tick is a no-op that returns 0 (NOTICE 'not configured').
-- Free tier: pg_net and pg_cron are included extensions; 96 ticks/day, each one indexed query.
-- Privacy note: pg_net keeps the request URL (which embeds the bot token) in net.http_request_queue
-- until sent and responses in net._http_response for ~6 h; both are readable only by postgres/
-- supabase_admin, like Vault itself.
--
-- NOT APPLIED by this PR; apply AFTER 20261010090000_job_heartbeats.sql:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261010090100_job_watchdog.sql
-- Idempotent. Tested on a scratch Postgres 17 with stand-ins for net/vault/cron
-- (supabase/tests/job_heartbeats_test.sql); the real Telegram delivery is untested until applied.
-- Rollback: select cron.unschedule('job-watchdog'); DROP FUNCTION public.job_watchdog_tick();
-- =====================================================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $pre$
BEGIN
  IF to_regclass('public.job_heartbeats') IS NULL
     OR to_regprocedure('public.job_heartbeat_overdue(timestamptz)') IS NULL THEN
    RAISE EXCEPTION 'job_watchdog: apply 20261010090000_job_heartbeats.sql first';
  END IF;
END $pre$;

CREATE OR REPLACE FUNCTION public.job_watchdog_tick()
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_token text;
  v_chat  text;
  v_sent  integer := 0;
  r       record;
BEGIN
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE name = 'telegram_bot_token';
  SELECT decrypted_secret INTO v_chat  FROM vault.decrypted_secrets WHERE name = 'telegram_chat_id';
  IF v_token IS NULL OR v_chat IS NULL THEN
    RAISE NOTICE 'job_watchdog: telegram_bot_token / telegram_chat_id not configured in Vault';
    RETURN 0;
  END IF;

  FOR r IN SELECT * FROM public.job_heartbeat_overdue(now()) LOOP
    -- Cooldown: at most one alert per job per 6 h (state kept as 'watchdog' heartbeat rows).
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.job_heartbeats h
      WHERE h.job = 'watchdog' AND h.detail = 'alert:' || r.job AND h.ran_at > now() - interval '6 hours');

    PERFORM net.http_post(
      url := 'https://api.telegram.org/bot' || v_token || '/sendMessage',
      body := jsonb_build_object(
        'chat_id', v_chat,
        'text', format('MENA Intel Desk watchdog: %s is late. Last OK run: %s (SLA %s). '
                       'Check Actions: https://github.com/rzjy54n5sh-rgb/OSINT/actions',
                       r.job, coalesce(to_char(r.last_ok_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI "UTC"'), 'never'),
                       r.sla)),
      timeout_milliseconds := 5000);
    INSERT INTO public.job_heartbeats (job, status, detail) VALUES ('watchdog', 'warn', 'alert:' || r.job);
    v_sent := v_sent + 1;
  END LOOP;
  RETURN v_sent;
END;
$$;

REVOKE ALL ON FUNCTION public.job_watchdog_tick() FROM PUBLIC, anon, authenticated, service_role;

-- Upsert by name (cron.schedule replaces an existing job with the same name).
SELECT cron.schedule('job-watchdog', '*/15 * * * *', 'SELECT public.job_watchdog_tick()');

COMMIT;
