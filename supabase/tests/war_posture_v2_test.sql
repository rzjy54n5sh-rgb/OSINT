-- =====================================================================================================
-- supabase/tests/war_posture_v2_test.sql — tests for supabase/migrations/20261012091000_war_posture_v2.sql
--
-- Run as postgres against a SCRATCH database (never production) that has the live-schema replica plus
-- 20261008090000_security_hardening.sql and 20261009090000_trust_ledgers.sql:
--   psql -v ON_ERROR_STOP=1 -X -At -f supabase/tests/war_posture_v2_test.sql
-- ONE transaction, rolled back at the end (posture_evidence is append-only). One line per check; exits
-- non-zero if any check fails, so it FAILS on a database without the migration and PASSES with it.
-- All rows are SYNTHETIC (example.test URLs, "TEST" quotes).
-- =====================================================================================================
\set ON_ERROR_STOP 1
\pset pager off
BEGIN;

CREATE SCHEMA wp_test;
GRANT USAGE ON SCHEMA wp_test TO PUBLIC;
CREATE TABLE wp_test.results (n serial PRIMARY KEY, who text, label text, expect text, got text, pass boolean, detail text);
GRANT INSERT, SELECT ON wp_test.results TO PUBLIC;
GRANT USAGE ON SEQUENCE wp_test.results_n_seq TO PUBLIC;

-- chk: run p_sql as the CURRENT role in a sub-transaction; keep=false rolls the probe back.
-- outcomes: ok | ok=<first column of first row> | denied | rls | rejected (CHECK/UNIQUE/NOT NULL/FK) | error
CREATE FUNCTION wp_test.chk(p_label text, p_expect text, p_sql text, p_keep boolean DEFAULT false) RETURNS text
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
    WHEN OTHERS THEN v_got := 'error'; v_det := SQLSTATE || ' ' || SQLERRM;
  END;
  IF p_expect LIKE 'ok=%' THEN
    v_pass := v_got = 'ok' AND coalesce(v_det, '<null>') = substr(p_expect, 4);
    IF v_got = 'ok' THEN v_got := 'ok=' || coalesce(v_det, '<null>'); END IF;
  ELSE
    v_pass := v_got = p_expect;
  END IF;
  INSERT INTO wp_test.results (who, label, expect, got, pass, detail)
  VALUES (current_user, p_label, p_expect, v_got, v_pass, left(v_det, 300));
  RETURN CASE WHEN v_pass THEN 'PASS ' ELSE 'FAIL ' END || rpad(current_user, 14) || p_label || ' -> ' || v_got
         || CASE WHEN v_pass OR v_det IS NULL THEN '' ELSE '  [' || left(v_det, 180) || ']' END;
END $f$;
GRANT EXECUTE ON FUNCTION wp_test.chk(text, text, text, boolean) TO PUBLIC;

-- ---------------------------------------------------------------------------------------------------
-- A. Pure functions (labels, decay schedule)
-- ---------------------------------------------------------------------------------------------------
SELECT wp_test.chk('label 0',   'ok=immediate_ceasefire',      $q$SELECT public.posture_label_for_score(0)$q$);
SELECT wp_test.chk('label 12',  'ok=immediate_ceasefire',      $q$SELECT public.posture_label_for_score(12)$q$);
SELECT wp_test.chk('label 13',  'ok=conditional_deescalation', $q$SELECT public.posture_label_for_score(13)$q$);
SELECT wp_test.chk('label 25',  'ok=conditional_deescalation', $q$SELECT public.posture_label_for_score(25)$q$);
SELECT wp_test.chk('label 38',  'ok=ambivalent',               $q$SELECT public.posture_label_for_score(38)$q$);
SELECT wp_test.chk('label 62',  'ok=ambivalent',               $q$SELECT public.posture_label_for_score(62)$q$);
SELECT wp_test.chk('label 63',  'ok=continued_pressure',       $q$SELECT public.posture_label_for_score(63)$q$);
SELECT wp_test.chk('label 87',  'ok=continued_pressure',       $q$SELECT public.posture_label_for_score(87)$q$);
SELECT wp_test.chk('label 88',  'ok=escalation',               $q$SELECT public.posture_label_for_score(88)$q$);
SELECT wp_test.chk('label 100', 'ok=escalation',               $q$SELECT public.posture_label_for_score(100)$q$);
SELECT wp_test.chk('label NULL / 101', 'ok=true', $q$SELECT public.posture_label_for_score(NULL) IS NULL AND public.posture_label_for_score(101) IS NULL$q$);
SELECT wp_test.chk('decay 0 d',  'ok=1.0000', $q$SELECT public.posture_decay_factor(0, 30)::text$q$);
SELECT wp_test.chk('decay 30 d', 'ok=0.5000', $q$SELECT public.posture_decay_factor(30, 30)::text$q$);
SELECT wp_test.chk('decay 60 d', 'ok=0.2500', $q$SELECT public.posture_decay_factor(60, 30)::text$q$);
SELECT wp_test.chk('confidence high @0',   'ok=high',   $q$SELECT public.posture_confidence_now('high', 0, 30)$q$);
SELECT wp_test.chk('confidence high @30',  'ok=medium', $q$SELECT public.posture_confidence_now('high', 30, 30)$q$);
SELECT wp_test.chk('confidence high @90',  'ok=low',    $q$SELECT public.posture_confidence_now('high', 90, 30)$q$);
SELECT wp_test.chk('confidence medium @0 never exceeds base', 'ok=medium', $q$SELECT public.posture_confidence_now('medium', 0, 30)$q$);
SELECT wp_test.chk('confidence low @0',    'ok=low',    $q$SELECT public.posture_confidence_now('low', 0, 30)$q$);
SELECT wp_test.chk('freshness 14/15/45/46', 'ok=current,decaying,decaying,stale',
  $q$SELECT concat_ws(',', public.posture_freshness(14), public.posture_freshness(15), public.posture_freshness(45), public.posture_freshness(46))$q$);
SELECT wp_test.chk('day 226 = 2026-10-11', 'ok=2026-10-11', $q$SELECT public.posture_day_date(226)::text$q$);

-- ---------------------------------------------------------------------------------------------------
-- B. Registry + policy (as anon)
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT wp_test.chk('anon reads conflicts registry', 'ok=horn-tigray,red-sea-houthi,sudan,us-iran',
  $q$SELECT string_agg(conflict_code, ',' ORDER BY conflict_code) FROM public.conflicts$q$);
SELECT wp_test.chk('anon reads publication policy', 'ok=AE,EG,SA',
  $q$SELECT string_agg(country_code, ',' ORDER BY country_code) FROM public.posture_publication_policy$q$);
SELECT wp_test.chk('anon INSERT conflicts', 'denied',
  $q$INSERT INTO public.conflicts (conflict_code, name, short_name, description, theatre) VALUES ('x', 'x', 'x', 'x', 'x')$q$);
SELECT wp_test.chk('anon DELETE policy row', 'denied', $q$DELETE FROM public.posture_publication_policy WHERE country_code = 'EG'$q$);
SELECT wp_test.chk('anon SELECT posture_scores', 'denied', $q$SELECT count(*) FROM public.posture_scores$q$);
SELECT wp_test.chk('anon INSERT posture_scores', 'denied',
  $q$INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, change_reason) VALUES ('IR', 'us-iran', 220, '2026-10-05', 'nulled', 'nulled')$q$);
RESET ROLE;

-- ---------------------------------------------------------------------------------------------------
-- C. Evidence (as service_role — the writer) and score rules
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT wp_test.chk('evidence kind bogus rejected', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version, evidence_kind)
     VALUES ('IR', 'us-iran', 'TEST', 'https://example.test/x', now(), 'war-posture-v2', 'bogus')$q$);
SELECT wp_test.chk('act without act_type rejected', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version, evidence_kind)
     VALUES ('IR', 'us-iran', 'TEST', 'https://example.test/x', now(), 'war-posture-v2', 'act')$q$);
SELECT wp_test.chk('act_type on a statement rejected', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version, act_type)
     VALUES ('IR', 'us-iran', 'TEST', 'https://example.test/x', now(), 'war-posture-v2', 'deployment')$q$);
SELECT wp_test.chk('unknown conflict_code rejected (registry FK)', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version)
     VALUES ('IR', 'mars', 'TEST', 'https://example.test/x', now(), 'war-posture-v2')$q$);
SELECT wp_test.chk('stated_at after capture rejected', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, stated_at, method_version)
     VALUES ('IR', 'us-iran', 'TEST', 'https://example.test/x', '2026-10-01T00:00Z', '2026-10-05T00:00Z', 'war-posture-v2')$q$);

-- Synthetic evidence rows kept for the rest of the run.
SELECT wp_test.chk('insert evidence EV1 (IR statement, stated 11 Sep)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, speaker_office, source_url, archive_url, page_sha256, captured_at, stated_at, method_version, quote_language, party_source)
  VALUES ('00000000-0000-0000-0000-0000000e0001', 'IR', 'us-iran', 'TEST verbatim quote one', 'TEST speaker', 'Foreign Minister', 'https://example.test/ir1',
          'https://web.archive.org/web/2026/https://example.test/ir1', repeat('a', 64), '2026-10-06T08:00Z', '2026-09-11T10:00Z', 'war-posture-v2', 'en', true)$q$, true);
SELECT wp_test.chk('insert evidence EV2 (IR statement, 9 Oct)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, source_url, archive_url, page_sha256, captured_at, stated_at, method_version)
  VALUES ('00000000-0000-0000-0000-0000000e0002', 'IR', 'us-iran', 'TEST verbatim quote two', 'TEST speaker', 'https://example.test/ir2',
          'https://web.archive.org/web/2026/https://example.test/ir2', repeat('b', 64), '2026-10-09T09:00Z', '2026-10-09T07:00Z', 'war-posture-v2')$q$, true);
SELECT wp_test.chk('insert evidence EV3 (YE red-sea-houthi)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, source_url, captured_at, method_version)
  VALUES ('00000000-0000-0000-0000-0000000e0003', 'YE', 'red-sea-houthi', 'TEST verbatim quote YE', 'https://example.test/ye', '2026-10-01T09:00Z', 'war-posture-v2')$q$, true);
SELECT wp_test.chk('insert evidence EV4 (IL silence trigger, 5 Oct)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, source_url, captured_at, stated_at, method_version, evidence_kind)
  VALUES ('00000000-0000-0000-0000-0000000e0004', 'IL', 'us-iran', 'TEST sentence describing the trigger event', 'https://example.test/il', '2026-10-06T09:00Z', '2026-10-05T00:00Z', 'war-posture-v2', 'silence_trigger')$q$, true);
SELECT wp_test.chk('insert evidence EV5 (EG statement)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, speaker, source_url, captured_at, stated_at, method_version)
  VALUES ('00000000-0000-0000-0000-0000000e0005', 'EG', 'us-iran', 'TEST verbatim quote EG', 'TEST EG speaker', 'https://example.test/eg', '2026-10-07T09:00Z', '2026-10-06T09:00Z', 'war-posture-v2')$q$, true);
SELECT wp_test.chk('insert evidence EV6 (EG act: talks hosted)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, source_url, captured_at, stated_at, method_version, evidence_kind, act_type)
  VALUES ('00000000-0000-0000-0000-0000000e0006', 'EG', 'us-iran', 'TEST sentence: talks were hosted', 'https://example.test/eg2', '2026-10-08T09:00Z', '2026-10-08T08:00Z', 'war-posture-v2', 'act', 'talks_hosted')$q$, true);
SELECT wp_test.chk('insert evidence EV7 (QA, never coded)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, source_url, captured_at, method_version)
  VALUES ('00000000-0000-0000-0000-0000000e0007', 'QA', 'us-iran', 'TEST verbatim quote QA', 'https://example.test/qa', '2026-10-08T09:00Z', 'war-posture-v2')$q$, true);
SELECT wp_test.chk('insert evidence EV8 (SA silence trigger)', 'ok', $q$
  INSERT INTO public.posture_evidence (id, country_code, conflict_code, position_quote, source_url, captured_at, stated_at, method_version, evidence_kind)
  VALUES ('00000000-0000-0000-0000-0000000e0008', 'SA', 'us-iran', 'TEST trigger SA', 'https://example.test/sa', '2026-10-06T09:00Z', '2026-10-01T00:00Z', 'war-posture-v2', 'silence_trigger')$q$, true);

-- scores
SELECT wp_test.chk('label must match score (60 + escalation) rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('IR', 'us-iran', 221, '2026-10-06', 'position', 'escalation', 60, '00000000-0000-0000-0000-0000000e0001', 'medium', 'new_evidence')$q$);
SELECT wp_test.chk('position without evidence rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, confidence_base, change_reason)
  VALUES ('IR', 'us-iran', 221, '2026-10-06', 'position', 'ambivalent', 60, 'medium', 'new_evidence')$q$);
SELECT wp_test.chk('first row as reverification rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, note)
  VALUES ('IR', 'us-iran', 221, '2026-10-06', 'position', 'ambivalent', 60, '00000000-0000-0000-0000-0000000e0001', 'medium', 'reverification', 'TEST')$q$);
SELECT wp_test.chk('S1 IR day 221 ambivalent 60 (new_evidence)', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('IR', 'us-iran', 221, '2026-10-06', 'position', 'ambivalent', 60, '00000000-0000-0000-0000-0000000e0001', 'medium', 'new_evidence')$q$, true);
SELECT wp_test.chk('S2 IR day 224 continued_pressure 75 defensive + band (new_evidence)', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, defensive, evidence_id, confidence_base, change_reason,
                                     latent_low, latent_high, latent_basis, latent_sources)
  VALUES ('IR', 'us-iran', 224, '2026-10-09', 'position', 'continued_pressure', 75, true, '00000000-0000-0000-0000-0000000e0002', 'high', 'new_evidence',
          60, 80, 'TEST latent basis',
          '[{"claim":"TEST L claim","name":"Example","url":"https://example.test/l","published_at":"2026-10-09","party_source":false,"feeds":"L"}]')$q$, true);
SELECT wp_test.chk('re-using EV1 as new_evidence rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('IR', 'us-iran', 225, '2026-10-10', 'position', 'ambivalent', 50, '00000000-0000-0000-0000-0000000e0001', 'medium', 'new_evidence')$q$);
SELECT wp_test.chk('no-change row rejected (carry forward instead)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, defensive, evidence_id, confidence_base, change_reason, note,
                                     latent_low, latent_high, latent_basis, latent_sources)
  VALUES ('IR', 'us-iran', 225, '2026-10-10', 'position', 'continued_pressure', 75, true, '00000000-0000-0000-0000-0000000e0002', 'high', 'reverification', 'TEST re-opened',
          60, 80, 'TEST latent basis',
          '[{"claim":"TEST L claim","name":"Example","url":"https://example.test/l","published_at":"2026-10-09","party_source":false,"feeds":"L"}]')$q$);
SELECT wp_test.chk('latent band without L sources rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, latent_low, latent_high)
  VALUES ('YE', 'red-sea-houthi', 216, '2026-10-01', 'position', 'escalation', 90, '00000000-0000-0000-0000-0000000e0003', 'medium', 'new_evidence', 10, 20)$q$);
SELECT wp_test.chk('evidence of another country rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('TR', 'us-iran', 221, '2026-10-06', 'position', 'ambivalent', 50, '00000000-0000-0000-0000-0000000e0001', 'low', 'new_evidence')$q$);
SELECT wp_test.chk('future conflict_day rejected (DAY LOCK)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  SELECT 'QA', 'us-iran', public.posture_current_day() + 5, DATE '2026-10-08', 'position', 'ambivalent', 50, '00000000-0000-0000-0000-0000000e0007'::uuid, 'low', 'new_evidence'$q$);
SELECT wp_test.chk('position on a silence_trigger rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('IL', 'us-iran', 223, '2026-10-08', 'position', 'ambivalent', 50, '00000000-0000-0000-0000-0000000e0004', 'low', 'new_evidence')$q$);
SELECT wp_test.chk('silence checked < 72 h after trigger rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, evidence_id, confidence_base, change_reason, silence_checked_through)
  VALUES ('IL', 'us-iran', 223, '2026-10-08', 'deliberate_silence', '00000000-0000-0000-0000-0000000e0004', 'low', 'new_evidence', '2026-10-06T12:00Z')$q$);
SELECT wp_test.chk('S6 IL deliberate_silence (>= 72 h)', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, evidence_id, confidence_base, change_reason, silence_checked_through)
  VALUES ('IL', 'us-iran', 223, '2026-10-08', 'deliberate_silence', '00000000-0000-0000-0000-0000000e0004', 'low', 'new_evidence', '2026-10-08T01:00Z')$q$, true);
SELECT wp_test.chk('EG score row rejected (positions-ledger-only policy)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('EG', 'us-iran', 222, '2026-10-07', 'position', 'conditional_deescalation', 25, '00000000-0000-0000-0000-0000000e0005', 'low', 'new_evidence')$q$);
SELECT wp_test.chk('SA silence row rejected (policy covers every stance)', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, evidence_id, confidence_base, change_reason, silence_checked_through)
  VALUES ('SA', 'us-iran', 221, '2026-10-06', 'deliberate_silence', '00000000-0000-0000-0000-0000000e0008', 'low', 'new_evidence', '2026-10-06T08:00Z')$q$);
SELECT wp_test.chk('S3 YE day 216 escalation 90', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 216, '2026-10-01', 'position', 'escalation', 90, '00000000-0000-0000-0000-0000000e0003', 'medium', 'new_evidence')$q$, true);
SELECT wp_test.chk('reverification without note rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason)
  VALUES ('YE', 'red-sea-houthi', 220, '2026-10-05', 'position', 'continued_pressure', 75, '00000000-0000-0000-0000-0000000e0003', 'medium', 'reverification')$q$);
SELECT wp_test.chk('S4 YE day 220 reverification of EV3 -> 75', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, label, expressed_score, evidence_id, confidence_base, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 220, '2026-10-05', 'position', 'continued_pressure', 75, '00000000-0000-0000-0000-0000000e0003', 'medium', 'reverification', 'TEST: archived page re-read; quote is conditional')$q$, true);
SELECT wp_test.chk('nulled without note rejected', 'rejected', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, evidence_id, change_reason)
  VALUES ('YE', 'red-sea-houthi', 222, '2026-10-07', 'nulled', '00000000-0000-0000-0000-0000000e0003', 'nulled')$q$);
SELECT wp_test.chk('S5 YE day 222 nulled (evidence ruled inadmissible)', 'ok', $q$
  INSERT INTO public.posture_scores (country_code, conflict_code, conflict_day, as_of, stance, evidence_id, change_reason, note)
  VALUES ('YE', 'red-sea-houthi', 222, '2026-10-07', 'nulled', '00000000-0000-0000-0000-0000000e0003', 'nulled', 'TEST: speaker is not a government voice')$q$, true);
RESET ROLE;

-- ---------------------------------------------------------------------------------------------------
-- D. viewer_posture_v2 as anon (free tier)
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT wp_test.chk('IR @224: label/score/defensive/reason', 'ok=continued_pressure|75|t|new_evidence',
  $q$SELECT concat_ws('|', label, expressed_score, defensive, change_reason) FROM public.viewer_posture_v2('us-iran', 'IR', 224)$q$);
SELECT wp_test.chk('IR @224: previous row (for moves)', 'ok=221|ambivalent|60',
  $q$SELECT concat_ws('|', previous_day, previous_label, previous_score) FROM public.viewer_posture_v2('us-iran', 'IR', 224)$q$);
SELECT wp_test.chk('IR @226: day-224 row carried forward, age 2, current, high', 'ok=224|2|current|high|0.9548',
  $q$SELECT concat_ws('|', score_day, evidence_age_days, freshness, confidence_now, decay_factor) FROM public.viewer_posture_v2('us-iran', 'IR', 226)$q$);
SELECT wp_test.chk('IR @223: day-221 row, evidence stated 11 Sep -> age 27, decaying, medium', 'ok=221|60|27|decaying|medium',
  $q$SELECT concat_ws('|', score_day, expressed_score, evidence_age_days, freshness, confidence_now) FROM public.viewer_posture_v2('us-iran', 'IR', 223)$q$);
SELECT wp_test.chk('IR @300: age never blanks the score (stale, low)', 'ok=75|stale|low',
  $q$SELECT concat_ws('|', expressed_score, freshness, confidence_now) FROM public.viewer_posture_v2('us-iran', 'IR', 300)$q$);
SELECT wp_test.chk('IR @220: before any row -> no position captured (0 rows)', 'ok=0',
  $q$SELECT count(*) FROM public.viewer_posture_v2('us-iran', 'IR', 220)$q$);
SELECT wp_test.chk('IR evidence: verbatim quote + archive + hash served', 'ok=TEST verbatim quote two|https://web.archive.org/web/2026/https://example.test/ir2|t',
  $q$SELECT concat_ws('|', position_quote, archive_url, page_sha256 = repeat('b', 64)) FROM public.viewer_posture_v2('us-iran', 'IR', 226)$q$);
SELECT wp_test.chk('anon: latent band hidden, UNSCORABLE disclosed', 'ok=<null>|f|UNSCORABLE',
  $q$SELECT concat_ws('|', coalesce(latent_low::text, '<null>'), latent_access, category) FROM public.viewer_posture_v2('us-iran', 'IR', 226)$q$);
SELECT wp_test.chk('EG: withheld, no grade, quote visible', 'ok=withheld|t|<null>|<null>|<null>|TEST sentence: talks were hosted|act|talks_hosted',
  $q$SELECT concat_ws('|', stance, withheld, coalesce(expressed_score::text, '<null>'), coalesce(label, '<null>'), coalesce(confidence_now, '<null>'), position_quote, evidence_kind, act_type)
       FROM public.viewer_posture_v2('us-iran', 'EG', 226)$q$);
SELECT wp_test.chk('SA: withheld', 'ok=withheld|<null>',
  $q$SELECT concat_ws('|', stance, coalesce(label, '<null>')) FROM public.viewer_posture_v2('us-iran', 'SA', 226)$q$);
SELECT wp_test.chk('IL: deliberate silence is its own stance', 'ok=deliberate_silence|<null>|silence_trigger',
  $q$SELECT concat_ws('|', stance, coalesce(expressed_score::text, '<null>'), evidence_kind) FROM public.viewer_posture_v2('us-iran', 'IL', 226)$q$);
SELECT wp_test.chk('QA: evidence captured but not coded -> uncoded', 'ok=uncoded|<null>',
  $q$SELECT concat_ws('|', stance, coalesce(expressed_score::text, '<null>')) FROM public.viewer_posture_v2('us-iran', 'QA', 226)$q$);
SELECT wp_test.chk('TR: nothing ever captured -> no row', 'ok=0',
  $q$SELECT count(*) FROM public.viewer_posture_v2('us-iran', 'TR', 226)$q$);
SELECT wp_test.chk('YE: nulled after reverification', 'ok=nulled|nulled|position|75',
  $q$SELECT concat_ws('|', stance, change_reason, previous_stance, previous_score) FROM public.viewer_posture_v2('red-sea-houthi', 'YE', 226)$q$);
SELECT wp_test.chk('per-conflict board us-iran @226', 'ok=EG:withheld,IL:deliberate_silence,IR:position,QA:uncoded,SA:withheld',
  $q$SELECT string_agg(country_code || ':' || stance, ',' ORDER BY country_code) FROM public.viewer_posture_v2('us-iran', NULL, 226)$q$);
SELECT wp_test.chk('all conflicts @226: 6 pairs', 'ok=6', $q$SELECT count(*) FROM public.viewer_posture_v2(NULL, NULL, 226)$q$);
SELECT wp_test.chk('anon reads evidence ledger incl. new columns', 'ok=act|talks_hosted',
  $q$SELECT concat_ws('|', evidence_kind, act_type) FROM public.posture_evidence WHERE id = '00000000-0000-0000-0000-0000000e0006'$q$);
-- legacy War Posture v1
SELECT wp_test.chk('legacy: anon direct read hides EG rows', 'ok=0', $q$SELECT count(*) FROM public.nai_scores_v2 WHERE country_code = 'EG'$q$);
SELECT wp_test.chk('legacy: anon direct read keeps IR rows', 'ok=2', $q$SELECT count(*) FROM public.nai_scores_v2 WHERE country_code = 'IR'$q$);
SELECT wp_test.chk('legacy: viewer_nai_v2 EG graded fields NULL', 'ok=<null>|<null>|<null>|<null>|0',
  $q$SELECT concat_ws('|', coalesce(expressed_score::text, '<null>'), coalesce(expressed_basis, '<null>'), coalesce(category, '<null>'), coalesce(latent_low::text, '<null>'), hidden_latent_source_count)
       FROM public.viewer_nai_v2(222, 'EG')$q$);
SELECT wp_test.chk('legacy: viewer_nai_v2 EG still lists E sources only', 'ok=1', $q$SELECT jsonb_array_length(sources) FROM public.viewer_nai_v2(222, 'EG')$q$);
SELECT wp_test.chk('legacy: viewer_nai_v2 IR expressed visible', 'ok=60', $q$SELECT expressed_score FROM public.viewer_nai_v2(222, 'IR')$q$);
SELECT wp_test.chk('legacy: viewer_nai_v2 IR latent still gated for anon', 'ok=<null>|1', $q$SELECT concat_ws('|', coalesce(latent_low::text, '<null>'), hidden_latent_source_count) FROM public.viewer_nai_v2(222, 'IR')$q$);
RESET ROLE;

-- ---------------------------------------------------------------------------------------------------
-- E. Informed tier (signed-in) and service_role
-- ---------------------------------------------------------------------------------------------------
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000f002"}', true);
SELECT wp_test.chk('informed: v2 latent band visible', 'ok=60|80|t',
  $q$SELECT concat_ws('|', latent_low, latent_high, latent_access) FROM public.viewer_posture_v2('us-iran', 'IR', 226)$q$);
SELECT wp_test.chk('informed: EG still withheld', 'ok=withheld|<null>',
  $q$SELECT concat_ws('|', stance, coalesce(expressed_score::text, '<null>')) FROM public.viewer_posture_v2('us-iran', 'EG', 226)$q$);
SELECT wp_test.chk('informed: legacy EG latent still NULL', 'ok=<null>', $q$SELECT latent_low FROM public.viewer_nai_v2(222, 'EG')$q$);
SELECT wp_test.chk('informed: legacy IR latent visible', 'ok=10', $q$SELECT latent_low FROM public.viewer_nai_v2(222, 'IR')$q$);
SELECT wp_test.chk('informed: posture_scores still not directly readable', 'denied', $q$SELECT count(*) FROM public.posture_scores$q$);
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT wp_test.chk('service_role: legacy EG row kept (archive not deleted)', 'ok=1', $q$SELECT count(*) FROM public.nai_scores_v2 WHERE country_code = 'EG'$q$);
SELECT wp_test.chk('service_role: posture_scores readable', 'ok=6', $q$SELECT count(*) FROM public.posture_scores$q$);
RESET ROLE;

-- ---------------------------------------------------------------------------------------------------
-- Summary
-- ---------------------------------------------------------------------------------------------------
SELECT count(*) || '|' || count(*) FILTER (WHERE pass) || '|' || count(*) FILTER (WHERE NOT pass) FROM wp_test.results;
DO $s$
DECLARE f int;
BEGIN
  SELECT count(*) INTO f FROM wp_test.results WHERE NOT pass;
  IF f > 0 THEN RAISE EXCEPTION 'war_posture_v2_test: % check(s) failed', f; END IF;
END $s$;
ROLLBACK;
