-- =====================================================================================================
-- 20261104090000_job_heartbeat_gdelt_sla.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- Watchdog SLA for the daily GDELT collector (collect-gdelt.yml, PR #61): adds one row
-- ('collect-gdelt', interval '26 hours') to the SLA list of public.job_heartbeat_overdue(timestamptz).
-- Everything else in the function is byte-for-byte the definition in 20261010090000_job_heartbeats.sql
-- (the only definition so far); the REVOKE/GRANT lines for this function are re-stated unchanged.
-- The collector beats 'ok' / 'fail' via heartbeat.py at the end of every live --write run (01:30 UTC,
-- dispatched by the scheduler Worker). Like every other job, it only alerts once it has reported at
-- least once, so applying this before the first collect-gdelt run is silent.
--
-- NOT APPLIED by this PR. Apply after 20261010090000_job_heartbeats.sql with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261104090000_job_heartbeat_gdelt_sla.sql
-- Idempotent (CREATE OR REPLACE, grants re-stated). Data written: none. ONE TRANSACTION.
-- Rollback: re-run the public.job_heartbeat_overdue(timestamptz) definition (and its REVOKE/GRANT
--           lines) from 20261010090000_job_heartbeats.sql.
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

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
           ('collect-gdelt',    interval '26 hours'),   -- 01:30 UTC daily
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

REVOKE ALL ON FUNCTION public.job_heartbeat_overdue(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.job_heartbeat_overdue(timestamptz) TO service_role;

COMMIT;
