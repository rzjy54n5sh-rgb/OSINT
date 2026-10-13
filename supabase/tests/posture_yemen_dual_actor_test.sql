-- =====================================================================================================
-- supabase/tests/posture_yemen_dual_actor_test.sql — tests for
-- supabase/migrations/20261013090000_posture_yemen_dual_actor.sql (Yemen: two authorities, two lines).
--
-- Run as postgres against a SCRATCH database (never production) holding the live-schema replica +
-- security_hardening + trust_ledgers + war_posture_v2 + posture_yemen_dual_actor_fixture.sql:
--   psql -v ON_ERROR_STOP=1 -X -At -f supabase/tests/posture_yemen_dual_actor_test.sql
-- ONE transaction, rolled back at the end. One line per check; exits non-zero if any check fails, so it
-- FAILS on a database without the migration and PASSES with it. All rows are SYNTHETIC.
-- =====================================================================================================
\set ON_ERROR_STOP 1
\pset pager off
BEGIN;

CREATE SCHEMA ya_test;
GRANT USAGE ON SCHEMA ya_test TO PUBLIC;
CREATE TABLE ya_test.results (n serial PRIMARY KEY, who text, label text, expect text, got text, pass boolean, detail text);
GRANT INSERT, SELECT ON ya_test.results TO PUBLIC;
GRANT USAGE ON SEQUENCE ya_test.results_n_seq TO PUBLIC;

-- chk: run p_sql as the CURRENT role in a sub-transaction; keep=false rolls the probe back.
-- outcomes: ok | ok=<first column of first row> | denied | rls | rejected (CHECK/UNIQUE/NOT NULL/FK) | blocked | error
CREATE FUNCTION ya_test.chk(p_label text, p_expect text, p_sql text, p_keep boolean DEFAULT false) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE v_got text := 'error'; v_det text; v_pass boolean;
BEGIN
  BEGIN
    IF p_sql ~* '^\s*(select|with)' THEN EXECUTE p_sql INTO v_det; ELSE EXECUTE p_sql; END IF;
    v_got := 'ok';
    IF NOT p_keep THEN RAISE EXCEPTION USING ERRCODE = 'P0099', MESSAGE = '__rollback__'; END IF;
  EXCEPTION
    WHEN SQLSTATE 'P0099' THEN NULL;
    WHEN insufficient_privilege THEN
      v_got := CASE WHEN SQLERRM LIKE '%row-level security%' THEN 'rls' ELSE 'denied' END; v_det := SQLERRM;
    WHEN check_violation OR unique_violation OR not_null_violation OR foreign_key_violation THEN
      v_got := 'rejected'; v_det := SQLSTATE || ' ' || SQLERRM;
    WHEN restrict_violation THEN v_got := 'blocked'; v_det := SQLSTATE || ' ' || SQLERRM;
    WHEN OTHERS THEN v_got := 'error'; v_det := SQLSTATE || ' ' || SQLERRM;
  END;
  IF p_expect LIKE 'ok=%' THEN
    v_pass := v_got = 'ok' AND coalesce(v_det, '<null>') = substr(p_expect, 4);
    IF v_got = 'ok' THEN v_got := 'ok=' || coalesce(v_det, '<null>'); END IF;
  ELSIF p_expect = 'rejected:actor' THEN
    -- rejected, and for the actor reason (not some unrelated rule that happens to fire first)
    v_pass := v_got = 'rejected' AND v_det ~* 'actor';
  ELSE
    v_pass := v_got = p_expect;
  END IF;
  INSERT INTO ya_test.results (who, label, expect, got, pass, detail)
  VALUES (current_user, p_label, p_expect, v_got, v_pass, left(v_det, 300));
  RETURN CASE WHEN v_pass THEN 'PASS ' ELSE 'FAIL ' END || rpad(current_user, 14) || p_label || ' -> ' || v_got
         || CASE WHEN v_pass OR v_det IS NULL THEN '' ELSE '  [' || left(v_det, 200) || ']' END;
END $f$;
GRANT EXECUTE ON FUNCTION ya_test.chk(text, text, text, boolean) TO PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- A. Existing rows (the 6 + 3 production-shaped fixture rows) and the new catalog objects
-- ---------------------------------------------------------------------------------------------------
SELECT ya_test.chk('existing evidence rows all read actor = government (6 of 6)', 'ok=6|6',
  $q$SELECT count(*) FILTER (WHERE actor = 'government') || '|' || count(*) FROM public.posture_evidence$q$);
SELECT ya_test.chk('existing score rows all read actor = government (3 of 3)', 'ok=3|3',
  $q$SELECT count(*) FILTER (WHERE actor = 'government') || '|' || count(*) FROM public.posture_scores$q$);
SELECT ya_test.chk('actor column default is government on both tables', 'ok=2',
  $q$SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('posture_evidence', 'posture_scores')
       AND column_name = 'actor' AND is_nullable = 'NO' AND column_default = '''government''::text'$q$);
SELECT ya_test.chk('viewer_posture_v2 keeps its signature (text, text, integer)', 'ok=true',
  $q$SELECT to_regprocedure('public.viewer_posture_v2(text,text,integer)') IS NOT NULL$q$);
SELECT ya_test.chk('viewer_posture_v2 returns actor + display names', 'ok=true',
  $q$SELECT proargnames @> ARRAY['actor', 'actor_display_name', 'actor_display_name_ar'] FROM pg_proc WHERE oid = 'public.viewer_posture_v2(text,text,integer)'::regprocedure$q$);
SELECT ya_test.chk('viewer_posture_v2 ACL: anon / authenticated / service_role, never PUBLIC', 'ok=t|t|t|f',
  $q$SELECT concat_ws('|', has_function_privilege('anon', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE'),
                           has_function_privilege('authenticated', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE'),
                           has_function_privilege('service_role', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE'),
                           EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.viewer_posture_v2(text,text,integer)'::regprocedure AND a.grantee = 0))$q$);

-- ---------------------------------------------------------------------------------------------------
-- B. posture_actors registry (as anon / service_role / postgres)
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT ya_test.chk('anon reads the actor registry: YE government + YE de facto authority', 'ok=YE:de_facto_authority,YE:government',
  $q$SELECT string_agg(country_code || ':' || actor, ',' ORDER BY actor) FROM public.posture_actors$q$);
SELECT ya_test.chk('YE government display name', 'ok=Government of Yemen (Presidential Leadership Council)',
  $q$SELECT display_name FROM public.posture_actors WHERE country_code = 'YE' AND actor = 'government'$q$);
SELECT ya_test.chk('YE de facto display name', 'ok=Ansar Allah (Houthi) authorities, Sanaa',
  $q$SELECT display_name FROM public.posture_actors WHERE country_code = 'YE' AND actor = 'de_facto_authority'$q$);
SELECT ya_test.chk('Arabic display names present on both rows', 'ok=2',
  $q$SELECT count(*) FROM public.posture_actors WHERE display_name_ar ~ '[؀-ۿ]'$q$);
SELECT ya_test.chk('anon INSERT posture_actors denied', 'denied',
  $q$INSERT INTO public.posture_actors (country_code, actor, display_name, display_name_ar) VALUES ('IQ', 'de_facto_authority', 'x', 'x')$q$);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT ya_test.chk('service_role reads posture_actors', 'ok=2', $q$SELECT count(*) FROM public.posture_actors$q$);
SELECT ya_test.chk('service_role INSERT posture_actors denied (registry changes by migration only)', 'denied',
  $q$INSERT INTO public.posture_actors (country_code, actor, display_name, display_name_ar) VALUES ('IQ', 'de_facto_authority', 'x', 'x')$q$);
SELECT ya_test.chk('service_role DELETE posture_actors denied', 'denied', $q$DELETE FROM public.posture_actors WHERE country_code = 'YE'$q$);
RESET ROLE;
SELECT ya_test.chk('postgres DELETE posture_actors blocked (locked)', 'blocked', $q$DELETE FROM public.posture_actors WHERE actor = 'de_facto_authority'$q$);
SELECT ya_test.chk('postgres UPDATE posture_actors blocked (locked)', 'blocked', $q$UPDATE public.posture_actors SET country_code = 'IQ' WHERE actor = 'de_facto_authority'$q$);
SELECT ya_test.chk('postgres TRUNCATE posture_actors blocked', 'blocked', $q$TRUNCATE public.posture_actors$q$);

-- ---------------------------------------------------------------------------------------------------
-- C. Evidence + score rules per actor (as service_role, the writer)
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT ya_test.chk('evidence actor outside the enum rejected', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version, actor)
     VALUES ('YE', 'red-sea-houthi', 'TEST', 'https://example.test/x', '2026-10-11T09:00Z', 'war-posture-v2', 'rebels')$q$);
SELECT ya_test.chk('de_facto_authority evidence for a non-registered country (IR) rejected', 'rejected:actor',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version, actor)
     VALUES ('IR', 'us-iran', 'TEST', 'https://example.test/x', '2026-10-11T09:00Z', 'war-posture-v2', 'de_facto_authority')$q$);
SELECT ya_test.chk('de_facto_authority evidence for EG rejected', 'rejected:actor',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version, actor)
     VALUES ('EG', 'red-sea-houthi', 'TEST', 'https://example.test/x', '2026-10-11T09:00Z', 'war-posture-v2', 'de_facto_authority')$q$);

SELECT ya_test.chk('insert EVG1 (YE government, red-sea-houthi, 11 Oct; actor defaulted)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, speaker_office, source_url, captured_at, stated_at, method_version, party_source)
  VALUES ('00000000-0000-0000-0000-0000000a0001', 'YE', 'red-sea-houthi', 'TEST YE government quote', 'TEST', 'Prime Minister', 'https://example.test/ye-gov',
          '2026-10-11T09:00Z', '2026-10-11T07:00Z', 'war-posture-v2', false)$q$, true);
SELECT ya_test.chk('EVG1 reads actor = government', 'ok=government',
  $q$SELECT actor FROM public.posture_evidence WHERE id = '00000000-0000-0000-0000-0000000a0001'$q$);
SELECT ya_test.chk('insert EVH1 (YE de facto authority, red-sea-houthi, 11 Oct)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, speaker_office, source_url, captured_at, stated_at, method_version, party_source, actor)
  VALUES ('00000000-0000-0000-0000-0000000a0002', 'YE', 'red-sea-houthi', 'TEST YE de facto quote one', 'TEST', 'Military spokesman', 'https://example.test/ye-sanaa-1',
          '2026-10-11T10:00Z', '2026-10-11T08:00Z', 'war-posture-v2', true, 'de_facto_authority')$q$, true);
SELECT ya_test.chk('insert EVH2 (YE de facto authority, red-sea-houthi, 13 Oct)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, speaker_office, source_url, captured_at, stated_at, method_version, party_source, actor)
  VALUES ('00000000-0000-0000-0000-0000000a0003', 'YE', 'red-sea-houthi', 'TEST YE de facto quote two', 'TEST', 'Leader', 'https://example.test/ye-sanaa-2',
          '2026-10-13T01:00Z', '2026-10-12T20:00Z', 'war-posture-v2', true, 'de_facto_authority')$q$, true);

-- evidence / actor mismatch
SELECT ya_test.chk('YE de facto score resting on government evidence rejected', 'rejected:actor', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 226, '2026-10-11', 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000a0001', 'medium', 'new_evidence')$q$);
SELECT ya_test.chk('YE government score resting on de facto evidence rejected', 'rejected:actor', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 226, '2026-10-11', 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000a0002', 'medium', 'new_evidence')$q$);
SELECT ya_test.chk('de_facto_authority score for a non-registered country (IR) rejected', 'rejected:actor', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, change_reason, note)
  VALUES ('IR', 'us-iran', 'de_facto_authority', 228, '2026-10-13', 'nulled', 'nulled', 'TEST')$q$);
SELECT ya_test.chk('score actor outside the enum rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 'rebels', 228, '2026-10-13', 'nulled', 'nulled', 'TEST')$q$);

-- per-actor sequences on the same country x conflict
SELECT ya_test.chk('Y1 YE government Day 228: continued_pressure 75 (new_evidence)', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 228, '2026-10-13', 'position', 'continued_pressure', 75, '00000000-0000-0000-0000-0000000a0001', 'high', 'new_evidence')$q$, true);
SELECT ya_test.chk('YE de facto first row as reverification rejected (first-row rule is per actor)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 226, '2026-10-11', 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000a0002', 'medium', 'reverification', 'TEST')$q$);
SELECT ya_test.chk('Y2 YE de facto Day 226 accepted although the government line already has Day 228 (day order per actor)', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 226, '2026-10-11', 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000a0002', 'medium', 'new_evidence')$q$, true);
SELECT ya_test.chk('YE de facto identical row on Day 227 rejected (no change vs its own Day 226)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 227, '2026-10-12', 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000a0002', 'medium', 'reverification', 'TEST')$q$);
SELECT ya_test.chk('YE de facto re-using EVH1 as new_evidence rejected (per actor)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 227, '2026-10-12', 'position', 'escalation', 100, '00000000-0000-0000-0000-0000000a0002', 'medium', 'new_evidence')$q$);
SELECT ya_test.chk('Y3 YE de facto Day 228: escalation 90 — same day as the government row, both accepted', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 228, '2026-10-13', 'position', 'escalation', 90, '00000000-0000-0000-0000-0000000a0003', 'high', 'new_evidence')$q$, true);
SELECT ya_test.chk('second YE de facto row on Day 228 rejected (one row per actor per day)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, actor, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 'de_facto_authority', 228, '2026-10-13', 'position', 'escalation', 100, '00000000-0000-0000-0000-0000000a0003', 'high', 'reverification', 'TEST')$q$);
SELECT ya_test.chk('government line still append-in-order: YE government Day 227 under its Day 228 rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 227, '2026-10-12', 'position', 'escalation', 95, '00000000-0000-0000-0000-0000000a0001', 'high', 'reverification', 'TEST')$q$);
SELECT ya_test.chk('EG score still rejected (positions-ledger-only policy unchanged)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, change_reason, note)
  VALUES ('EG', 'us-iran', 228, '2026-10-13', 'nulled', 'nulled', 'TEST')$q$);
SELECT ya_test.chk('the two YE lines are stored separately (never merged)', 'ok=de_facto_authority:226:95,de_facto_authority:228:90,government:228:75',
  $q$SELECT string_agg(actor || ':' || conflict_day || ':' || expressed_score, ',' ORDER BY actor, conflict_day) FROM public.posture_scores WHERE country_code = 'YE'$q$);
RESET ROLE;

-- ---------------------------------------------------------------------------------------------------
-- D. viewer_posture_v2 as anon: two YE rows, each with its own line
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT ya_test.chk('viewer: YE red-sea-houthi @228 returns two rows, government first', 'ok=government:75,de_facto_authority:90',
  $q$SELECT string_agg(actor || ':' || coalesce(expressed_score::text, '-'), ',') FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 228)$q$);
SELECT ya_test.chk('viewer: actor display names served', 'ok=Government of Yemen (Presidential Leadership Council)|Ansar Allah (Houthi) authorities, Sanaa',
  $q$SELECT string_agg(actor_display_name, '|') FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 228)$q$);
SELECT ya_test.chk('viewer: de facto line previous row is its own Day 226 (not the government row)', 'ok=226|escalation|95|new_evidence',
  $q$SELECT concat_ws('|', previous_day, previous_label, previous_score, change_reason) FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 228) WHERE actor = 'de_facto_authority'$q$);
SELECT ya_test.chk('viewer: government line has no previous row', 'ok=<null>',
  $q$SELECT coalesce(previous_day::text, '<null>') FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 228) WHERE actor = 'government'$q$);
SELECT ya_test.chk('viewer: each line shows its own evidence', 'ok=TEST YE government quote|TEST YE de facto quote two',
  $q$SELECT string_agg(position_quote, '|') FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 228)$q$);
SELECT ya_test.chk('viewer @227: government evidence captured but not coded (uncoded), de facto Day 226 carried forward', 'ok=government:uncoded:-,de_facto_authority:position:226',
  $q$SELECT string_agg(actor || ':' || stance || ':' || coalesce(score_day::text, '-'), ',') FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 227)$q$);
SELECT ya_test.chk('viewer: an ordinary country row is actor government with no actor display name', 'ok=government|<null>',
  $q$SELECT concat_ws('|', actor, coalesce(actor_display_name, '<null>')) FROM public.viewer_posture_v2('us-iran', 'GB', 228)$q$);
SELECT ya_test.chk('viewer: SA withheld unchanged (red-sea-houthi)', 'ok=withheld|t|<null>',
  $q$SELECT concat_ws('|', stance, withheld, coalesce(expressed_score::text, '<null>')) FROM public.viewer_posture_v2('red-sea-houthi', 'SA', 228)$q$);
SELECT ya_test.chk('viewer: AE withheld unchanged', 'ok=withheld|<null>|<null>',
  $q$SELECT concat_ws('|', stance, coalesce(label, '<null>'), coalesce(score_day::text, '<null>')) FROM public.viewer_posture_v2('us-iran', 'AE', 228)$q$);
SELECT ya_test.chk('viewer: all pairs @228 = 6 existing + 2 YE lines', 'ok=8', $q$SELECT count(*) FROM public.viewer_posture_v2(NULL, NULL, 228)$q$);
SELECT ya_test.chk('viewer: red-sea-houthi board @228', 'ok=SA:government:withheld,US:government:position,YE:government:position,YE:de_facto_authority:position',
  $q$SELECT string_agg(country_code || ':' || actor || ':' || stance, ',') FROM public.viewer_posture_v2('red-sea-houthi', NULL, 228)$q$);
SELECT ya_test.chk('anon reads evidence ledger incl. actor', 'ok=de_facto_authority',
  $q$SELECT actor FROM public.posture_evidence WHERE id = '00000000-0000-0000-0000-0000000a0002'$q$);
RESET ROLE;

-- EG evidence (government) still shown with stance withheld
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT ya_test.chk('insert EG government evidence (allowed: evidence only)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, source_url, captured_at, method_version)
  VALUES ('00000000-0000-0000-0000-0000000a0009', 'EG', 'us-iran', 'TEST EG quote', 'https://example.test/eg', '2026-10-12T09:00Z', 'war-posture-v2')$q$, true);
RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT ya_test.chk('viewer: EG still withheld, quote visible, no grade', 'ok=withheld|t|<null>|TEST EG quote|government',
  $q$SELECT concat_ws('|', stance, withheld, coalesce(expressed_score::text, '<null>'), position_quote, actor) FROM public.viewer_posture_v2('us-iran', 'EG', 228)$q$);
RESET ROLE;

-- ---------------------------------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------------------------------
SELECT count(*) || '|' || count(*) FILTER (WHERE pass) || '|' || count(*) FILTER (WHERE NOT pass) FROM ya_test.results;
DO $s$
DECLARE f int;
BEGIN
  SELECT count(*) INTO f FROM ya_test.results WHERE NOT pass;
  IF f > 0 THEN RAISE EXCEPTION 'posture_yemen_dual_actor_test: % check(s) failed', f; END IF;
END $s$;
ROLLBACK;
