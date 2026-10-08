-- =====================================================================================================
-- 20261010090000_job_heartbeats.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- WS4 reliability: one append-only row per scheduled-job run, so lateness is detectable.
--   - Writers: the collectors (.github/workflows/scripts/heartbeat.py, one non-fatal POST at the end
--     of collect_feeds / collect_markets / scenario_daily) and db-backup.yml (backup + restore drill),
--     all with the service_role key they already hold. No other role can read or write the table.
--   - Reader: public.job_heartbeat_overdue() (watchdog, migration 20261010090100) and
--     public.job_heartbeat_latest() (future /status page). Both service_role/postgres only.
--   - Append-only: no UPDATE/DELETE grant or policy for anyone. Volume ~120 rows/day (~45k/yr,
--     a few MB): no retention job (house rule: never auto-delete).
--
-- NOT APPLIED by this PR. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261010090000_job_heartbeats.sql
-- Idempotent (safe to re-run). Tested on a scratch Postgres 17: supabase/tests/job_heartbeats_test.sql.
-- Rollback: DROP FUNCTION public.job_heartbeat_overdue(timestamptz), public.job_heartbeat_latest();
--           DROP TABLE public.job_heartbeats;
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

CREATE TABLE IF NOT EXISTS public.job_heartbeats (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job     text        NOT NULL CHECK (job ~ '^[a-z0-9][a-z0-9_-]{1,62}$'),
  ran_at  timestamptz NOT NULL DEFAULT now(),
  status  text        NOT NULL CHECK (status IN ('ok', 'warn', 'fail', 'skipped')),
  detail  text        CHECK (detail IS NULL OR length(detail) <= 2000)
);

COMMENT ON TABLE public.job_heartbeats IS
  'Append-only run log of scheduled jobs (WS4). Written by collectors/backups with service_role; read by the watchdog.';

CREATE INDEX IF NOT EXISTS job_heartbeats_job_ran_at_idx ON public.job_heartbeats (job, ran_at DESC);

-- RLS on; explicit grants are the second gate (default privileges no longer auto-grant, 20261008090000 §8).
ALTER TABLE public.job_heartbeats ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.job_heartbeats FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.job_heartbeats_id_seq FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON TABLE public.job_heartbeats TO service_role;
GRANT USAGE ON SEQUENCE public.job_heartbeats_id_seq TO service_role;

-- service_role has BYPASSRLS on Supabase; the policies state the intent and keep working without it.
DROP POLICY IF EXISTS job_heartbeats_service_insert ON public.job_heartbeats;
CREATE POLICY job_heartbeats_service_insert ON public.job_heartbeats
  FOR INSERT TO service_role WITH CHECK (true);
DROP POLICY IF EXISTS job_heartbeats_service_select ON public.job_heartbeats;
CREATE POLICY job_heartbeats_service_select ON public.job_heartbeats
  FOR SELECT TO service_role USING (true);

-- Latest run and latest successful run per job.
CREATE OR REPLACE FUNCTION public.job_heartbeat_latest()
RETURNS TABLE (job text, last_ran_at timestamptz, last_status text, last_ok_at timestamptz)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  SELECT h.job,
         max(h.ran_at)                                AS last_ran_at,
         (array_agg(h.status ORDER BY h.ran_at DESC))[1] AS last_status,
         max(h.ran_at) FILTER (WHERE h.status = 'ok') AS last_ok_at
  FROM public.job_heartbeats h
  WHERE h.job <> 'watchdog'
  GROUP BY h.job
$$;

-- Jobs whose last SUCCESSFUL run is older than their SLA (or that only ever failed) at time p_now.
-- SLA = schedule interval + slack for GitHub queueing; change here, not in the watchdog.
CREATE OR REPLACE FUNCTION public.job_heartbeat_overdue(p_now timestamptz DEFAULT now())
RETURNS TABLE (job text, sla interval, last_ok_at timestamptz, late_by interval)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH sla(job, max_age) AS (
    VALUES ('collect-articles', interval '2 hours'),    -- hourly
           ('collect-markets',  interval '90 minutes'), -- every 30 min
           ('scenario-daily',   interval '26 hours'),   -- 05:20 UTC daily
           ('db-backup',        interval '26 hours'),   -- nightly
           ('db-restore-test',  interval '8 days')      -- weekly
  ), last_ok AS (
    SELECT h.job, max(h.ran_at) AS last_ok_at
    FROM public.job_heartbeats h
    WHERE h.status = 'ok'
    GROUP BY h.job
  )
  SELECT s.job, s.max_age, l.last_ok_at,
         CASE WHEN l.last_ok_at IS NULL THEN NULL ELSE p_now - l.last_ok_at - s.max_age END
  FROM sla s
  LEFT JOIN last_ok l USING (job)
  -- Only jobs that have reported at least once (any status): a job that was never set up
  -- (e.g. backups before their secrets exist) does not alert.
  WHERE EXISTS (SELECT 1 FROM public.job_heartbeats e WHERE e.job = s.job)
    AND (l.last_ok_at IS NULL OR p_now - l.last_ok_at > s.max_age)
  ORDER BY s.job
$$;

REVOKE ALL ON FUNCTION public.job_heartbeat_latest() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.job_heartbeat_overdue(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_heartbeat_latest() TO service_role;
GRANT EXECUTE ON FUNCTION public.job_heartbeat_overdue(timestamptz) TO service_role;

COMMIT;
