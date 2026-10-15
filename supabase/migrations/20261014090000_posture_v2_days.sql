-- =====================================================================================================
-- 20261014090000_posture_v2_days.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- public.posture_v2_days() RETURNS SETOF integer: the War Posture v2 coding days the public board can
-- show, ascending. The /nai day stepper (operator ruling R2) needs the full list; posture_scores has no
-- public read, and probing viewer_posture_v2 day by day stopped early and cost many sequential calls.
--
-- Publication rules: the same row filter viewer_posture_v2 applies to posture_scores (read from production
-- with pg_get_functiondef, 2026-10-14), minus the per-day "latest row" pick, since every coding day counts:
--   * method_version = 'war-posture-v2';
--   * conflict_day <= public.posture_current_day()  (viewer_posture_v2 never shows a later day);
--   * NOT public.posture_is_withheld(country_code)  (EG / AE / SA: positions ledger only — the viewer
--     nulls their score_day, so their rows never reveal a day; the table also rejects such rows).
-- Every published stance counts (position, deliberate_silence, nulled), as each is a coded row the board
-- shows with its own day. Returns days only: no country, score, actor or evidence.
--
-- STABLE, SECURITY DEFINER (posture_scores is not readable by anon / authenticated), search_path pinned.
-- EXECUTE: anon, authenticated, service_role; never PUBLIC (same pattern as viewer_posture_v2).
-- Requires 20261012091000_war_posture_v2.sql (preflight asserts it). Idempotent (CREATE OR REPLACE, grants
-- re-stated). Data written: none. ONE TRANSACTION. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261014090000_posture_v2_days.sql
-- Tests: supabase/tests/posture_v2_days_test.sql (+ run_posture_v2_days_tests.sh).
-- Rollback: DROP FUNCTION IF EXISTS public.posture_v2_days(); (the app falls back to the board's own rows).
-- =====================================================================================================
BEGIN;

DO $pre$
BEGIN
  IF to_regclass('public.posture_scores') IS NULL THEN
    RAISE EXCEPTION 'posture_v2_days preflight: public.posture_scores missing (apply 20261012091000_war_posture_v2 first)';
  END IF;
  IF to_regprocedure('public.posture_current_day()') IS NULL OR to_regprocedure('public.posture_is_withheld(text)') IS NULL
     OR to_regprocedure('public.viewer_posture_v2(text,text,integer)') IS NULL THEN
    RAISE EXCEPTION 'posture_v2_days preflight: posture_current_day / posture_is_withheld / viewer_posture_v2 missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.posture_scores'::regclass AND attname = 'conflict_day' AND NOT attisdropped)
     OR NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = 'public.posture_scores'::regclass AND attname = 'method_version' AND NOT attisdropped) THEN
    RAISE EXCEPTION 'posture_v2_days preflight: posture_scores.conflict_day / method_version missing';
  END IF;
END $pre$;

CREATE OR REPLACE FUNCTION public.posture_v2_days()
RETURNS SETOF integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
  SELECT DISTINCT ps.conflict_day
    FROM public.posture_scores ps
   WHERE ps.method_version = 'war-posture-v2'
     AND ps.conflict_day <= public.posture_current_day()
     AND NOT public.posture_is_withheld(ps.country_code)
   ORDER BY ps.conflict_day
$fn$;

COMMENT ON FUNCTION public.posture_v2_days() IS
  'War Posture v2 coding days the public board can show (viewer_posture_v2 publication rules: method v2, not after today, never EG/AE/SA), ascending. Days only.';

REVOKE ALL ON FUNCTION public.posture_v2_days() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.posture_v2_days() TO anon, authenticated, service_role;

DO $post$
BEGIN
  IF NOT (SELECT prosecdef AND provolatile = 's' FROM pg_proc WHERE oid = 'public.posture_v2_days()'::regprocedure)
     OR NOT has_function_privilege('anon', 'public.posture_v2_days()', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.posture_v2_days()', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.posture_v2_days()'::regprocedure AND a.grantee = 0) THEN
    RAISE EXCEPTION 'posture_v2_days post-check: definer / volatility / grants not as intended';
  END IF;
END $post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
