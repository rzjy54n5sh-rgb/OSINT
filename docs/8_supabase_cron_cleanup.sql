-- ================================================================
-- SUPABASE pg_cron CLEANUP JOBS
-- Run these in Supabase SQL Editor (one time setup)
-- ================================================================

-- Step 1: Enable pg_cron extension (if not already enabled)
-- Go to: Supabase Dashboard → Database → Extensions → enable pg_cron

-- Step 2: Run the SQL below in the SQL Editor
-- ================================================================


-- ----------------------------------------------------------------
-- JOB 1: Delete articles older than 90 days (runs daily at 2am UTC)
-- Keeps your 500MB free tier healthy indefinitely
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'cleanup-old-articles',
  '0 2 * * *',
  $$
    DELETE FROM articles
    WHERE published_at < NOW() - INTERVAL '90 days';
  $$
);


-- ----------------------------------------------------------------
-- JOB 2: Delete duplicate market_data rows (runs daily at 2:30am)
-- Keeps only the LATEST row per (indicator, conflict_day)
-- Your pipeline currently inserts duplicates on each run
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'deduplicate-market-data',
  '30 2 * * *',
  $$
    DELETE FROM market_data a
    USING market_data b
    WHERE a.id < b.id
      AND a.indicator = b.indicator
      AND a.conflict_day = b.conflict_day;
  $$
);


-- ----------------------------------------------------------------
-- JOB 3: Delete social_trends older than 30 days (runs daily at 3am)
-- Social data is only useful fresh
-- ----------------------------------------------------------------
SELECT cron.schedule(
  'cleanup-old-social',
  '0 3 * * *',
  $$
    DELETE FROM social_trends
    WHERE created_at < NOW() - INTERVAL '30 days';
  $$
);


-- ----------------------------------------------------------------
-- VERIFY JOBS ARE SCHEDULED
-- Run this to confirm all 3 jobs are active
-- ----------------------------------------------------------------
SELECT jobid, jobname, schedule, active
FROM cron.job
ORDER BY jobid;


-- ----------------------------------------------------------------
-- OPTIONAL: Check current table sizes
-- ----------------------------------------------------------------
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size,
  (SELECT COUNT(*) FROM articles) AS article_count,
  (SELECT COUNT(*) FROM market_data) AS market_count,
  (SELECT COUNT(*) FROM social_trends) AS social_count
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('articles', 'market_data', 'social_trends')
LIMIT 10;
