-- ================================================================
-- !!!  DO NOT RUN THIS FILE  !!!
-- ================================================================
-- Status: DISABLED 2026-10-06. Kept only as a record of what went wrong.
-- Every active statement below has been commented out.
--
-- WHAT HAPPENED
--   JOB 1 ("cleanup-old-articles") deletes every article older than 90 days.
--   It kept running while article collection was off, so nothing new arrived
--   to replace what it removed. Between June and September 2026 it deleted
--   24,757 articles. The Supabase free tier has no backups, so that history
--   (articles for March-August 2026) is unrecoverable.
--
-- RETENTION POLICY THAT REPLACES IT
--   NEVER delete rows from articles (or any other intelligence table).
--   When the database passes ~350 MB (free limit: 500 MB), strip the
--   `summary` and `tags` columns on OLD rows only, and keep the row itself
--   (title, url, source, timestamps, conflict_day).
--
-- OTHER JOBS IN THIS FILE
--   JOB 2 (market_data dedup) compares UUIDs (a.id < b.id), so the row it
--   keeps is effectively RANDOM, not the newest. It is being fixed to keep
--   the newest row by created_at for closed days. Check the live job with
--   SELECT jobid, jobname, schedule, command FROM cron.job;
--   JOB 3 (social_trends 30-day delete) is also a row delete; it is disabled
--   here pending an explicit decision to keep or change it.
--
-- If a job named 'cleanup-old-articles' exists in cron.job on the live
-- database, unschedule it:   SELECT cron.unschedule('cleanup-old-articles');
-- (That is an operator action; this file does not do it for you.)
-- ================================================================

-- ================================================================
-- SUPABASE pg_cron CLEANUP JOBS
-- HISTORICAL (original instruction was "run in the SQL Editor" — DO NOT; see header)
-- ================================================================

-- Step 1: Enable pg_cron extension (if not already enabled)
-- Go to: Supabase Dashboard → Database → Extensions → enable pg_cron

-- Step 2: (original) Run the SQL below in the SQL Editor — DO NOT
-- ================================================================


-- ----------------------------------------------------------------
-- JOB 1: Delete articles older than 90 days (runs daily at 2am UTC)
-- (Original claim: "keeps the free tier healthy". Reality: destroyed the Mar-Aug history.)
-- ----------------------------------------------------------------
-- [DISABLED] SELECT cron.schedule(
-- [DISABLED]   'cleanup-old-articles',
-- [DISABLED]   '0 2 * * *',
-- [DISABLED]   $$
-- [DISABLED]     DELETE FROM articles
-- [DISABLED]     WHERE published_at < NOW() - INTERVAL '90 days';
-- [DISABLED]   $$
-- [DISABLED] );


-- ----------------------------------------------------------------
-- JOB 2: Delete duplicate market_data rows (runs daily at 2:30am)
-- Intended: keep only the LATEST row per (indicator, conflict_day).
-- Actual: a.id < b.id compares UUIDs, so the survivor is random.
-- Your pipeline currently inserts duplicates on each run
-- ----------------------------------------------------------------
-- [DISABLED] SELECT cron.schedule(
-- [DISABLED]   'deduplicate-market-data',
-- [DISABLED]   '30 2 * * *',
-- [DISABLED]   $$
-- [DISABLED]     DELETE FROM market_data a
-- [DISABLED]     USING market_data b
-- [DISABLED]     WHERE a.id < b.id
-- [DISABLED]       AND a.indicator = b.indicator
-- [DISABLED]       AND a.conflict_day = b.conflict_day;
-- [DISABLED]   $$
-- [DISABLED] );


-- ----------------------------------------------------------------
-- JOB 3: Delete social_trends older than 30 days (runs daily at 3am)
-- Social data is only useful fresh
-- ----------------------------------------------------------------
-- [DISABLED] SELECT cron.schedule(
-- [DISABLED]   'cleanup-old-social',
-- [DISABLED]   '0 3 * * *',
-- [DISABLED]   $$
-- [DISABLED]     DELETE FROM social_trends
-- [DISABLED]     WHERE created_at < NOW() - INTERVAL '30 days';
-- [DISABLED]   $$
-- [DISABLED] );


-- ----------------------------------------------------------------
-- VERIFY JOBS ARE SCHEDULED
-- Run this to confirm all 3 jobs are active
-- ----------------------------------------------------------------
-- [DISABLED] SELECT jobid, jobname, schedule, active
-- [DISABLED] FROM cron.job
-- [DISABLED] ORDER BY jobid;


-- ----------------------------------------------------------------
-- OPTIONAL: Check current table sizes
-- ----------------------------------------------------------------
-- [DISABLED] SELECT
-- [DISABLED]   schemaname,
-- [DISABLED]   tablename,
-- [DISABLED]   pg_size_pretty(pg_total_relation_size(schemaname || '.' || tablename)) AS size,
-- [DISABLED]   (SELECT COUNT(*) FROM articles) AS article_count,
-- [DISABLED]   (SELECT COUNT(*) FROM market_data) AS market_count,
-- [DISABLED]   (SELECT COUNT(*) FROM social_trends) AS social_count
-- [DISABLED] FROM pg_tables
-- [DISABLED] WHERE schemaname = 'public'
-- [DISABLED]   AND tablename IN ('articles', 'market_data', 'social_trends')
-- [DISABLED] LIMIT 10;
