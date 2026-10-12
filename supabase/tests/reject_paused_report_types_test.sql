-- Assertions for 20261012120000_reject_paused_report_types.sql (scratch only; run by run_reject_paused_report_types_tests.sh).
-- Each probe runs its statements (as the current role, or SET LOCAL ROLE inside the probe) in a sub-transaction
-- that is ALWAYS rolled back, so probes never change the database, then records the SQLSTATE it ended with.
--   expect: 'ok' | a SQLSTATE ('23514' check_violation = this guard, '23001' restrict_violation = no-silent-edit,
--           '23505' unique_violation, '23503' foreign_key_violation)
--   p_check (optional): a boolean SELECT evaluated after the statements, inside the same sub-transaction.
-- Prints one PASS/FAIL line per probe and a final "total|pass|fail" line; exits non-zero if any fail.
\set ON_ERROR_STOP 1
CREATE TEMP TABLE r (n serial, ok boolean, label text, got text, detail text);

CREATE OR REPLACE FUNCTION pg_temp.probe(p_label text, p_expect text, p_sql text[], p_check text DEFAULT NULL,
                                         p_msg_like text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $f$
DECLARE v_got text; v_det text := ''; v_hint text := ''; s text; v_ok boolean;
BEGIN
  BEGIN
    FOREACH s IN ARRAY p_sql LOOP EXECUTE s; END LOOP;
    v_got := 'ok';
    IF p_check IS NOT NULL THEN
      EXECUTE p_check INTO v_ok;
      IF v_ok IS NOT TRUE THEN v_got := 'ok_but_check_failed'; END IF;
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = '__rollback__';
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN OTHERS THEN
      GET STACKED DIAGNOSTICS v_got = RETURNED_SQLSTATE, v_det = MESSAGE_TEXT, v_hint = PG_EXCEPTION_HINT;
  END;
  INSERT INTO r (ok, label, got, detail)
  VALUES (v_got = p_expect AND (p_msg_like IS NULL OR v_det LIKE p_msg_like), p_label, v_got,
          left(v_det, 160) || CASE WHEN coalesce(v_hint, '') <> '' THEN ' | HINT: ' || left(v_hint, 60) || '...' ELSE '' END);
END $f$;

-- helper statements
\set corr_egypt100 '$$WITH c AS (INSERT INTO public.corrections (target_table, target_id, conflict_day, report_type, correction_class, summary, before_excerpt, after_excerpt) VALUES (''daily_briefings'', ''00000000-0000-0000-0000-0000000cc100'', 100, ''egypt'', ''minor'', ''TEST title typo'', ''old'', ''new'') RETURNING id) SELECT set_config(''app.correction_id'', id::text, true) FROM c$$'

-- ---- 1. new briefs of inactive types are refused ------------------------------------------------------
SELECT pg_temp.probe('INSERT egypt (paused) new Day 228 -> refused (check_violation)', '23514',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'egypt', 'x', '[]', 'contemporaneous')$$],
  NULL, '%report type "egypt" is paused%');
SELECT pg_temp.probe('INSERT uae (paused) new Day 228 -> refused', '23514',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'uae', 'x', '[]', 'contemporaneous')$$]);
SELECT pg_temp.probe('INSERT business (paused) new Day 228 -> refused', '23514',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'business', 'x', '[]', 'contemporaneous')$$]);
SELECT pg_temp.probe('INSERT egypt for a past day with no egypt brief (Day 50) -> refused (backfill of a paused type)', '23514',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (50, 'egypt', 'x', '[]', 'reconstructed')$$]);
SELECT pg_temp.probe('as service_role (pipeline key): INSERT egypt new Day 228 -> refused', '23514',
  ARRAY['SET LOCAL ROLE service_role',
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'egypt', 'x', '[]', 'contemporaneous')$$]);
SELECT pg_temp.probe('PostgREST-style upsert of egypt on a NEW day (ON CONFLICT DO UPDATE) -> refused', '23514',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'egypt', 'x', '[]', 'contemporaneous')
          ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, report_type = EXCLUDED.report_type$$]);
SELECT pg_temp.probe('multi-row INSERT [general Day 228, egypt Day 228] -> whole statement refused, general not written', '23514',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES
          (228, 'general', 'x', '[]', 'contemporaneous'), (228, 'egypt', 'x', '[]', 'contemporaneous')$$]);
SELECT pg_temp.probe('INSERT candidate type (not yet activated) -> refused', '23514',
  ARRAY[$$INSERT INTO public.report_types (code, name_en, scope, cadence, backfill_cadence, status, origin, activation_rule) VALUES ('tst_candidate', 'TEST candidate', 'thematic', 'daily', 'none', 'candidate', 'operator', '{"metric":"always"}')$$,
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'tst_candidate', 'x', '[]', 'contemporaneous')$$],
  NULL, '%is candidate%');
SELECT pg_temp.probe('INSERT retired type -> refused', '23514',
  ARRAY[$$SELECT set_config('app.lifecycle_txn', 'on', true)$$,
        $$UPDATE public.report_types SET status = 'retired' WHERE code = 'business'$$,
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'business', 'x', '[]', 'contemporaneous')$$],
  NULL, '%is retired%');

-- ---- 2. active types unaffected ---------------------------------------------------------------------------
SELECT pg_temp.probe('INSERT general (active) new Day 228 -> ok', 'ok',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'general', 'x', '[]', 'contemporaneous')$$],
  $$SELECT count(*) = 1 FROM public.daily_briefings WHERE conflict_day = 228 AND report_type = 'general'$$);
SELECT pg_temp.probe('as service_role: INSERT egypt_gulf_economy (active, the replacement) new Day 228 -> ok', 'ok',
  ARRAY['SET LOCAL ROLE service_role',
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'egypt_gulf_economy', 'x', '[]', 'contemporaneous')$$],
  $$SELECT count(*) = 1 FROM public.daily_briefings WHERE conflict_day = 228 AND report_type = 'egypt_gulf_economy'$$);
SELECT pg_temp.probe('re-activated type (paused -> active) accepts new briefs again', 'ok',
  ARRAY[$$SELECT set_config('app.lifecycle_txn', 'on', true)$$,
        $$UPDATE public.report_types SET status = 'active' WHERE code = 'uae'$$,
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'uae', 'x', '[]', 'contemporaneous')$$]);
SELECT pg_temp.probe('unknown report_type -> foreign_key_violation exactly as before', '23503',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (228, 'no_such_type', 'x', '[]', 'contemporaneous')$$]);

-- ---- 3. historical paused-type briefs stay correctable ------------------------------------------------------
SELECT pg_temp.probe('correction upsert of OLD egypt Day 100 (INSERT .. ON CONFLICT DO UPDATE + app.correction_id) -> ok', 'ok',
  ARRAY[:corr_egypt100,
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (100, 'egypt', 'SYNTHETIC corrected egypt brief', '[]', 'contemporaneous')
          ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, sections = EXCLUDED.sections, report_type = EXCLUDED.report_type$$],
  $$SELECT title = 'SYNTHETIC corrected egypt brief' AND (SELECT count(*) FROM public.daily_briefings WHERE report_type = 'egypt' AND conflict_day = 100) = 1
      FROM public.daily_briefings WHERE id = '00000000-0000-0000-0000-0000000cc100'$$);
SELECT pg_temp.probe('as service_role: correction upsert of OLD egypt Day 100 -> ok', 'ok',
  ARRAY['SET LOCAL ROLE service_role', :corr_egypt100,
        $$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (100, 'egypt', 'SYNTHETIC corrected egypt brief', '[]', 'contemporaneous')
          ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, report_type = EXCLUDED.report_type$$],
  $$SELECT title = 'SYNTHETIC corrected egypt brief' FROM public.daily_briefings WHERE id = '00000000-0000-0000-0000-0000000cc100'$$);
SELECT pg_temp.probe('same upsert WITHOUT a correction -> still blocked by no-silent-edit (restrict_violation), not by this guard', '23001',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (100, 'egypt', 'silent', '[]', 'contemporaneous')
          ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, report_type = EXCLUDED.report_type$$],
  NULL, 'No silent edits%');
SELECT pg_temp.probe('correction via plain UPDATE of OLD uae Day 100 title -> ok', 'ok',
  ARRAY[$$WITH c AS (INSERT INTO public.corrections (target_table, target_id, correction_class, summary) VALUES ('daily_briefings', '00000000-0000-0000-0000-0000000cc101', 'minor', 'TEST') RETURNING id) SELECT set_config('app.correction_id', id::text, true) FROM c$$,
        $$UPDATE public.daily_briefings SET title = 'SYNTHETIC corrected uae' WHERE id = '00000000-0000-0000-0000-0000000cc101'$$],
  $$SELECT title = 'SYNTHETIC corrected uae' FROM public.daily_briefings WHERE id = '00000000-0000-0000-0000-0000000cc101'$$);
SELECT pg_temp.probe('UPDATE non-content column of OLD business Day 100 (updated_at, no correction needed) -> ok', 'ok',
  ARRAY[$$UPDATE public.daily_briefings SET updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000cc102'$$]);
SELECT pg_temp.probe('UPDATE OLD egypt row SET report_type = ''egypt'' (unchanged, in SET list) -> ok', 'ok',
  ARRAY[$$UPDATE public.daily_briefings SET report_type = 'egypt', updated_at = now() WHERE id = '00000000-0000-0000-0000-0000000cc100'$$]);
SELECT pg_temp.probe('upsert of in-window egypt Day 222 (daily build re-write, no correction) -> ok', 'ok',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (222, 'egypt', 'SYNTHETIC rewritten', '[]', 'contemporaneous')
          ON CONFLICT (conflict_day, report_type) DO UPDATE SET title = EXCLUDED.title, report_type = EXCLUDED.report_type$$],
  $$SELECT title = 'SYNTHETIC rewritten' FROM public.daily_briefings WHERE conflict_day = 222 AND report_type = 'egypt'$$);
SELECT pg_temp.probe('INSERT .. ON CONFLICT DO NOTHING for existing egypt Day 100 -> ok, no row added', 'ok',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (100, 'egypt', 'dup', '[]', 'contemporaneous') ON CONFLICT DO NOTHING$$],
  $$SELECT count(*) = 1 AND bool_and(title = 'SYNTHETIC old egypt brief') FROM public.daily_briefings WHERE conflict_day = 100 AND report_type = 'egypt'$$);
SELECT pg_temp.probe('plain duplicate INSERT egypt Day 100 -> unique_violation (no new row)', '23505',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, title, sections, provenance) VALUES (100, 'egypt', 'dup', '[]', 'contemporaneous')$$]);
SELECT pg_temp.probe('INSERT egypt Day 100 country_code EG ON CONFLICT on the 3-col key -> unique_violation on day_type_uniq (no new row)', '23505',
  ARRAY[$$INSERT INTO public.daily_briefings (conflict_day, report_type, country_code, title, sections, provenance) VALUES (100, 'egypt', 'EG', 'dup', '[]', 'contemporaneous')
          ON CONFLICT (conflict_day, report_type, country_code) DO NOTHING$$]);

-- ---- 4. re-pointing a brief to an inactive type ---------------------------------------------------------
SELECT pg_temp.probe('UPDATE in-window general Day 222 SET report_type = ''uae'' (paused) -> refused', '23514',
  ARRAY[$$UPDATE public.daily_briefings SET report_type = 'uae' WHERE conflict_day = 222 AND report_type = 'general'$$],
  NULL, '%report type "uae" is paused%');
SELECT pg_temp.probe('UPDATE OLD general Day 101 SET report_type = ''business'' even WITH a correction -> refused', '23514',
  ARRAY[$$WITH c AS (INSERT INTO public.corrections (target_table, target_id, correction_class, summary) VALUES ('daily_briefings', '00000000-0000-0000-0000-0000000cc104', 'minor', 'TEST') RETURNING id) SELECT set_config('app.correction_id', id::text, true) FROM c$$,
        $$UPDATE public.daily_briefings SET report_type = 'business' WHERE id = '00000000-0000-0000-0000-0000000cc104'$$],
  NULL, '%report type "business" is paused — a brief cannot be re-pointed to it%');
SELECT pg_temp.probe('UPDATE in-window general Day 222 SET report_type = ''egypt_gulf_economy'' (active) -> ok', 'ok',
  ARRAY[$$UPDATE public.daily_briefings SET report_type = 'egypt_gulf_economy' WHERE conflict_day = 222 AND report_type = 'general'$$]);

-- ---- 5. installation -------------------------------------------------------------------------------------
SELECT pg_temp.probe('trigger installed, enabled, BEFORE INSERT OR UPDATE OF report_type', 'ok', ARRAY['SELECT 1'],
  $$SELECT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.daily_briefings'::regclass AND tgname = 'daily_briefings_reject_inactive_type'
                    AND tgenabled = 'O' AND pg_get_triggerdef(oid) LIKE '%BEFORE INSERT OR UPDATE OF report_type ON public.daily_briefings FOR EACH ROW%')$$);
SELECT pg_temp.probe('function: search_path pinned, not SECURITY DEFINER, not executable by anon/authenticated', 'ok', ARRAY['SELECT 1'],
  $$SELECT p.proconfig = ARRAY['search_path=""'] AND NOT p.prosecdef
            AND NOT has_function_privilege('anon', p.oid, 'EXECUTE') AND NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')
       FROM pg_proc p WHERE p.oid = 'public.daily_briefings_reject_inactive_type()'::regprocedure$$);

SELECT (CASE WHEN ok THEN 'PASS ' ELSE 'FAIL ' END) || label || CASE WHEN ok THEN '' ELSE '  [got ' || got || '] ' || coalesce(detail, '') END
  FROM r ORDER BY n;
SELECT count(*) || '|' || count(*) FILTER (WHERE ok) || '|' || count(*) FILTER (WHERE NOT ok) FROM r;
DO $$ BEGIN IF EXISTS (SELECT 1 FROM r WHERE NOT ok) THEN RAISE EXCEPTION 'reject_paused_report_types_test: % failing check(s)', (SELECT count(*) FROM r WHERE NOT ok); END IF; END $$;
