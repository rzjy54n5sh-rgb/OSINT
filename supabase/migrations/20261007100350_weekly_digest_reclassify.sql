-- Migration 20261007100350: weekly_digest_reclassify — VERIFIER FIX for attack 2(b). NOT APPLIED.
-- Apply after 20261007100300_report_registry.sql and BEFORE the daily General backfill (W1).
--
-- Problem (live, read-only 2026-10-06): 25 weekly "Retrospective Digest - Days a-b" rows occupy
-- report_type='general' on their START day (36, 43, ... 214). The planned one-General-per-day
-- backfill for Days 36-218 collides with UNIQUE (conflict_day, report_type) on those 25 days
-- (and Day 155 already holds a recovered daily General -> backfill must skip/upgrade it, not insert).
-- Without the new index the backfill would silently create two 'general' rows per day and every
-- reader that does .eq(day).eq(type).maybeSingle() (hooks/useBriefing.ts, app/briefings/[day]/[type])
-- would error. Fix: give weekly digests their own report type and the period columns, and store each
-- issue on its LAST day (ADR contract: conflict_day = period_end_day).

SET client_min_messages = warning;
BEGIN;

DO $$ BEGIN PERFORM set_config('app.lifecycle_txn', 'on', true); END $$;
INSERT INTO public.report_types (code, name_en, scope, country_code, cadence, backfill_cadence, status, origin, activation_rule, display_order)
VALUES ('general_weekly', 'Weekly General Digest', 'general', NULL, 'weekly', 'weekly', 'active', 'operator', '{"metric":"always"}', 15)
ON CONFLICT (code) DO NOTHING;
DO $$ BEGIN PERFORM set_config('app.lifecycle_txn', 'off', true); END $$;
INSERT INTO public.report_type_events (report_type, conflict_day, from_status, to_status, actor_kind, actor, reason, evidence)
SELECT 'general_weekly', public.get_current_conflict_day(), NULL, 'active', 'migration', '20261007100350_weekly_digest_reclassify',
       'Weekly retrospective digests split from the daily General brief',
       '[{"kind":"legacy_rows","table":"public.daily_briefings","match":"title ~ ''^Retrospective Digest - Days [0-9]+-[0-9]+$''"}]'::jsonb
 WHERE NOT EXISTS (SELECT 1 FROM public.report_type_events WHERE report_type = 'general_weekly');

DO $$
DECLARE v_expected integer; v_done integer; v_clash text;
BEGIN
  SELECT count(*) INTO v_expected FROM public.daily_briefings
   WHERE report_type = 'general' AND title ~ '^Retrospective Digest - Days [0-9]+-[0-9]+$';
  -- an end day must not already hold a general_weekly issue, and two digests must not end on the same day
  WITH ends AS (
    SELECT substring(d.title FROM '-([0-9]+)$')::int AS e, count(*) AS n FROM public.daily_briefings d
     WHERE d.report_type = 'general' AND d.title ~ '^Retrospective Digest - Days [0-9]+-[0-9]+$'
     GROUP BY 1)
  SELECT string_agg(e::text, ',') INTO v_clash FROM ends
   WHERE n > 1 OR EXISTS (SELECT 1 FROM public.daily_briefings b2 WHERE b2.report_type = 'general_weekly' AND b2.conflict_day = ends.e);
  IF v_clash IS NOT NULL THEN RAISE EXCEPTION 'weekly digest end-day clash on days %', v_clash; END IF;

  UPDATE public.daily_briefings
     SET report_type      = 'general_weekly',
         period_start_day = substring(title FROM 'Days ([0-9]+)-')::int,
         period_end_day   = substring(title FROM '-([0-9]+)$')::int,
         conflict_day     = substring(title FROM '-([0-9]+)$')::int
   WHERE report_type = 'general' AND title ~ '^Retrospective Digest - Days [0-9]+-[0-9]+$';
  GET DIAGNOSTICS v_done = ROW_COUNT;
  IF v_done <> v_expected THEN RAISE EXCEPTION 'reclassified % of % digests', v_done, v_expected; END IF;
  RAISE NOTICE 'reclassified % weekly digests to general_weekly', v_done;   -- production expectation: 25
END $$;

COMMIT;
