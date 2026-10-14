-- =====================================================================================================
-- supabase/tests/posture_v2_days_test.sql — SCRATCH ONLY (never production). Run by run_posture_v2_days_tests.sh
-- after the migration chain + the production-shaped fixture (posture_yemen_dual_actor_fixture.sql).
-- Prints one PASS/FAIL line per check.
--   1. production-shaped data (Day 228 GB/US/IR + Day 229 IR, YE de facto): posture_v2_days() = the days the
--      app's probe through viewer_posture_v2 finds = {228, 229};
--   2. 30 coded days with a gap (synthetic): equals an exhaustive probe of viewer_posture_v2 over every day;
--   3. a stray EG row (withheld) and a future-day row never contribute a day;
--   4. anon and authenticated can call it (posture_scores itself stays unreadable to anon); PUBLIC cannot.
-- Synthetic rows are written with the tables' user triggers DISABLED (scratch DB only, dropped afterwards):
-- the write guards would reject a stray EG row or a future day on purpose, and the read function must hold
-- even for rows the guards would never let in.
-- =====================================================================================================
\set ON_ERROR_STOP 1
SET client_min_messages = warning;

ALTER TABLE public.posture_scores DISABLE TRIGGER USER;
ALTER TABLE public.posture_evidence DISABLE TRIGGER USER;
-- Production-shaped Day 229 (as on 2026-10-14): IR re-coded 88, YE de facto authority first coding 75.
INSERT INTO public.posture_evidence (id, country_code, conflict_code, actor, position_quote, speaker, speaker_office, source_url, page_sha256, captured_at, stated_at, method_version, quote_language, party_source)
VALUES ('00000000-0000-0000-0000-0000000f0007', 'YE', 'red-sea-houthi', 'de_facto_authority', 'TEST YE quote', 'TEST', 'Spokesman', 'https://example.test/ye', repeat('7', 64), '2026-10-14T02:00:00Z', '2026-10-13T00:00:00Z', 'war-posture-v2', 'en', false);
INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason) VALUES
  ('IR', 'us-iran', 'government', 229, '2026-10-14', 'position', 'escalation', 88, '00000000-0000-0000-0000-0000000f0005', 'medium', 'new_evidence'),
  ('YE', 'red-sea-houthi', 'de_facto_authority', 229, '2026-10-14', 'position', 'continued_pressure', 75, '00000000-0000-0000-0000-0000000f0007', 'medium', 'new_evidence');

CREATE TEMP TABLE probe_app AS
  -- The app's former probe (lib/posture.ts postureV2Days, here without its 6-probe cap): days proven by the
  -- latest board, then by the board on the day before the earliest day so far, until nothing earlier appears.
  WITH RECURSIVE walk(first_day, n) AS (
    SELECT min(x), 0 FROM public.viewer_posture_v2(NULL, NULL, NULL) v, unnest(ARRAY[v.score_day, v.previous_day]) x
     WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld')
    UNION ALL
    SELECT q.m, w.n + 1
      FROM walk w, LATERAL (SELECT min(x) AS m FROM public.viewer_posture_v2(NULL, NULL, w.first_day - 1) v, unnest(ARRAY[v.score_day, v.previous_day]) x
                             WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld')) q
     WHERE q.m IS NOT NULL AND q.m < w.first_day AND w.n < 400
  )
  SELECT DISTINCT x AS d
    FROM (SELECT NULL::integer AS pd UNION ALL SELECT first_day - 1 FROM walk WHERE first_day IS NOT NULL) p,
         public.viewer_posture_v2(NULL, NULL, p.pd) v, unnest(ARRAY[v.score_day, v.previous_day]) x
   WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld') AND x IS NOT NULL;

SELECT CASE WHEN (SELECT array_agg(d ORDER BY d) FROM public.posture_v2_days() d) = ARRAY[228, 229]
             AND (SELECT array_agg(d ORDER BY d) FROM probe_app) = ARRAY[228, 229]
       THEN 'PASS' ELSE 'FAIL' END || ' 1 production-shaped: posture_v2_days = probe = {228,229}: '
       || coalesce((SELECT string_agg(d::text, ',') FROM public.posture_v2_days() d), '-');

-- 30 coded days (200–229) with a gap at 210 on every line; plus a stray withheld EG row on a day nobody else
-- has (195) and a GB row two days in the future.
INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
SELECT 'IR', 'us-iran', 'government', d, public.posture_day_date(d), 'position', public.posture_label_for_score(60 + (d % 20)), 60 + (d % 20), '00000000-0000-0000-0000-0000000f0005', 'medium', 'new_evidence'
  FROM generate_series(200, 227) d WHERE d <> 210;
INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason) VALUES
  ('EG', 'us-iran', 'government', 195, public.posture_day_date(195), 'position', 'escalation', 99, '00000000-0000-0000-0000-0000000f0004', 'high', 'new_evidence'),
  ('GB', 'us-iran', 'government', public.posture_current_day() + 2, public.posture_day_date(public.posture_current_day() + 2), 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000f0001', 'high', 'new_evidence');

CREATE TEMP TABLE probe_all AS
  SELECT DISTINCT x AS d FROM generate_series(1, public.posture_current_day()) day, public.viewer_posture_v2(NULL, NULL, day) v,
         unnest(ARRAY[v.score_day, v.previous_day]) x
   WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld') AND x IS NOT NULL;

DROP TABLE probe_app;
CREATE TEMP TABLE probe_app AS
  WITH RECURSIVE walk(first_day, n) AS (
    SELECT min(x), 0 FROM public.viewer_posture_v2(NULL, NULL, NULL) v, unnest(ARRAY[v.score_day, v.previous_day]) x
     WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld')
    UNION ALL
    SELECT q.m, w.n + 1
      FROM walk w, LATERAL (SELECT min(x) AS m FROM public.viewer_posture_v2(NULL, NULL, w.first_day - 1) v, unnest(ARRAY[v.score_day, v.previous_day]) x
                             WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld')) q
     WHERE q.m IS NOT NULL AND q.m < w.first_day AND w.n < 400
  )
  SELECT DISTINCT x AS d
    FROM (SELECT NULL::integer AS pd UNION ALL SELECT first_day - 1 FROM walk WHERE first_day IS NOT NULL) p,
         public.viewer_posture_v2(NULL, NULL, p.pd) v, unnest(ARRAY[v.score_day, v.previous_day]) x
   WHERE NOT v.withheld AND v.stance NOT IN ('uncoded', 'withheld') AND x IS NOT NULL;
SELECT CASE WHEN (SELECT array_agg(d ORDER BY d) FROM public.posture_v2_days() d) = (SELECT array_agg(d ORDER BY d) FROM probe_all)
             AND (SELECT array_agg(d ORDER BY d) FROM public.posture_v2_days() d) = (SELECT array_agg(d ORDER BY d) FROM probe_app)
             AND (SELECT count(*) FROM public.posture_v2_days()) = 29
             AND NOT EXISTS (SELECT 1 FROM public.posture_v2_days() d WHERE d = 210)
       THEN 'PASS' ELSE 'FAIL' END || ' 2 thirty days with a gap: equals an exhaustive viewer_posture_v2 probe and the uncapped probe walk ('
       || (SELECT count(*) FROM public.posture_v2_days()) || ' days, ' || (SELECT min(d) FROM public.posture_v2_days() d) || '..'
       || (SELECT max(d) FROM public.posture_v2_days() d) || ', 210 absent)';
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM public.posture_v2_days() d WHERE d = 195 OR d > public.posture_current_day())
             AND EXISTS (SELECT 1 FROM public.posture_scores WHERE country_code = 'EG' AND conflict_day = 195)
       THEN 'PASS' ELSE 'FAIL' END || ' 3 withheld (EG) and future-day rows contribute no day';
SELECT CASE WHEN (SELECT array_agg(d) FROM public.posture_v2_days() d) = (SELECT array_agg(d ORDER BY d) FROM public.posture_v2_days() d)
       THEN 'PASS' ELSE 'FAIL' END || ' 3b day order';

SET ROLE anon;
SELECT CASE WHEN (SELECT count(*) FROM public.posture_v2_days()) = 29 AND NOT has_table_privilege('public.posture_scores', 'SELECT')
       THEN 'PASS' ELSE 'FAIL' END || ' 4 anon can call it; posture_scores stays unreadable to anon';
RESET ROLE;
SET ROLE authenticated;
SELECT CASE WHEN (SELECT count(*) FROM public.posture_v2_days()) = 29 THEN 'PASS' ELSE 'FAIL' END || ' 4b authenticated can call it';
RESET ROLE;
SELECT CASE WHEN NOT EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.posture_v2_days()'::regprocedure AND a.grantee = 0)
             AND (SELECT prosecdef FROM pg_proc WHERE oid = 'public.posture_v2_days()'::regprocedure)
       THEN 'PASS' ELSE 'FAIL' END || ' 4c no PUBLIC execute; SECURITY DEFINER';
