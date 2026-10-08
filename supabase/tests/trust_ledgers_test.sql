-- =====================================================================================================
-- supabase/tests/trust_ledgers_test.sql — tests for supabase/migrations/20261009090000_trust_ledgers.sql
--
-- Run as postgres against a SCRATCH database (never production):
--   psql -v ON_ERROR_STOP=1 -X -f supabase/tests/trust_ledgers_test.sql
-- The whole file runs in ONE transaction that is rolled back at the end (append-only rows could not be
-- removed otherwise). It prints one line per check and exits non-zero if any check fails, so it FAILS
-- on a database without the migration and PASSES with it. Needs: Supabase roles anon / authenticated /
-- service_role, public.daily_briefings with at least one public.report_types row.
--
-- Probe outcomes:  ok | ok=<first column of first row> | denied (grant) | rls | blocked (append-only /
-- no-silent-edit trigger, SQLSTATE 23001) | rejected (CHECK / UNIQUE / NOT NULL / FK) | error (other).
-- =====================================================================================================
\set ON_ERROR_STOP 1
\pset pager off
BEGIN;

CREATE SCHEMA tl_test;
GRANT USAGE ON SCHEMA tl_test TO PUBLIC;
CREATE TABLE tl_test.results (n serial PRIMARY KEY, who text, label text, expect text, got text, pass boolean, detail text);
GRANT INSERT, SELECT ON tl_test.results TO PUBLIC;
GRANT USAGE ON SEQUENCE tl_test.results_n_seq TO PUBLIC;
CREATE TABLE tl_test.ids (k text PRIMARY KEY, v text);
GRANT ALL ON tl_test.ids TO PUBLIC;

-- chk: run p_sql as the CURRENT role in a sub-transaction. keep=false rolls the probe back.
CREATE FUNCTION tl_test.chk(p_label text, p_expect text, p_sql text, p_keep boolean DEFAULT false) RETURNS text
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
    WHEN restrict_violation THEN v_got := 'blocked'; v_det := SQLERRM;
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
  INSERT INTO tl_test.results (who, label, expect, got, pass, detail)
  VALUES (current_user, p_label, p_expect, v_got, v_pass, left(v_det, 300));
  RETURN CASE WHEN v_pass THEN 'PASS ' ELSE 'FAIL ' END || rpad(current_user, 14) || p_label || ' -> ' || v_got
         || CASE WHEN v_pass OR v_det IS NULL THEN '' ELSE '  [' || left(v_det, 160) || ']' END;
END $f$;
GRANT EXECUTE ON FUNCTION tl_test.chk(text, text, text, boolean) TO PUBLIC;

-- Edit a brief inside a correction: insert the corrections row, SET LOCAL app.correction_id, update.
CREATE FUNCTION tl_test.edit_with_correction(p_brief uuid, p_target uuid, p_published boolean, p_title text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.corrections (target_table, target_id, correction_class, summary, before_excerpt, after_excerpt, published)
  VALUES ('daily_briefings', p_target::text, 'minor', 'TEST correction', 'old', p_title, p_published) RETURNING id INTO v_id;
  PERFORM set_config('app.correction_id', v_id::text, true);
  UPDATE public.daily_briefings SET title = p_title WHERE id = p_brief;
  RETURN 'edited';
END $f$;
CREATE FUNCTION tl_test.edit_with_setting(p_brief uuid, p_setting text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('app.correction_id', p_setting, true);
  UPDATE public.daily_briefings SET title = 'TEST edit with bogus setting' WHERE id = p_brief;
  RETURN 'edited';
END $f$;
-- Replica mode (how bulk loaders skip triggers): ENABLE ALWAYS triggers must still fire.
CREATE FUNCTION tl_test.in_replica_mode(p_sql text) RETURNS text
LANGUAGE plpgsql AS $f$
BEGIN
  PERFORM set_config('session_replication_role', 'replica', true);
  EXECUTE p_sql;
  RETURN 'done';
END $f$;
-- Tampering as the owner who disables the guard first; returns what verify_forecast_chain() reports.
CREATE FUNCTION tl_test.tamper(p_kind text) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE v jsonb; r record;
BEGIN
  ALTER TABLE public.forecast_ledger DISABLE TRIGGER forecast_ledger_append_only;
  IF p_kind = 'edit' THEN
    UPDATE public.forecast_ledger SET probability = 0.99 WHERE chain_seq = 2;
  ELSIF p_kind = 'delete' THEN
    DELETE FROM public.forecast_ledger WHERE chain_seq = 2;
  ELSIF p_kind = 'rehash' THEN
    -- attacker edits row 2 AND recomputes its own row_hash: the NEXT row's prev_hash no longer matches
    SELECT * INTO r FROM public.forecast_ledger WHERE chain_seq = 2;
    UPDATE public.forecast_ledger SET probability = 0.01,
      row_hash = public.forecast_ledger_row_hash(r.prev_hash, public.forecast_ledger_canonical(
        r.chain_seq, r.id, r.question_id, r.question_text, r.resolution_criteria, r.reference_class,
        r.horizon_date, r.forecaster, 0.01, r.created_at))
    WHERE chain_seq = 2;
  END IF;
  v := public.verify_forecast_chain();
  RETURN (v ->> 'chain_seq') || ':' || (v ->> 'problem');
END $f$;
-- A correction that is 2 days old (aged by the owner with the guard disabled) must not unlock edits.
CREATE FUNCTION tl_test.edit_with_aged_correction(p_brief uuid) RETURNS text
LANGUAGE plpgsql AS $f$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.corrections (target_table, target_id, correction_class, summary)
  VALUES ('daily_briefings', p_brief::text, 'minor', 'TEST aged correction') RETURNING id INTO v_id;
  ALTER TABLE public.corrections DISABLE TRIGGER corrections_guard;
  UPDATE public.corrections SET created_at = now() - interval '2 days' WHERE id = v_id;
  ALTER TABLE public.corrections ENABLE ALWAYS TRIGGER corrections_guard;
  PERFORM set_config('app.correction_id', v_id::text, true);
  UPDATE public.daily_briefings SET title = 'TEST aged' WHERE id = p_brief;
  RETURN 'edited';
END $f$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tl_test TO PUBLIC;

-- ---------- fixtures (as postgres; kept until the final ROLLBACK) ----------
INSERT INTO tl_test.ids VALUES
  ('old',   '00000000-0000-0000-0000-00000000a001'),
  ('fresh', '00000000-0000-0000-0000-00000000a002'),
  ('other', '00000000-0000-0000-0000-00000000a003');
SELECT tl_test.chk('fixture: brief generated 3h ago', 'ok',
  $q$INSERT INTO public.daily_briefings (id, conflict_day, report_type, title, lead, sections, provenance, generated_at)
     SELECT '00000000-0000-0000-0000-00000000a001', 9001, (SELECT code FROM public.report_types ORDER BY code LIMIT 1),
            'TEST old brief', 'lead', '[]', 'reconstructed', now() - interval '3 hours'$q$, true);
SELECT tl_test.chk('fixture: brief generated 30 min ago', 'ok',
  $q$INSERT INTO public.daily_briefings (id, conflict_day, report_type, title, lead, sections, provenance, generated_at)
     SELECT '00000000-0000-0000-0000-00000000a002', 9002, (SELECT code FROM public.report_types ORDER BY code LIMIT 1),
            'TEST fresh brief', 'lead', '[]', 'reconstructed', now() - interval '30 minutes'$q$, true);
SELECT tl_test.chk('fixture: second old brief', 'ok',
  $q$INSERT INTO public.daily_briefings (id, conflict_day, report_type, title, lead, sections, provenance, generated_at)
     SELECT '00000000-0000-0000-0000-00000000a003', 9003, (SELECT code FROM public.report_types ORDER BY code LIMIT 1),
            'TEST other brief', 'lead', '[]', 'reconstructed', now() - interval '3 hours'$q$, true);
SELECT tl_test.chk('edit window constant is 2 hours', 'ok=02:00:00', $q$SELECT public.briefing_edit_window()::text$q$);

-- ---------- service_role writes the ledgers (kept) ----------
SET LOCAL ROLE service_role;
SELECT tl_test.chk('insert forecast q1 (desk)', 'ok',
  $q$INSERT INTO public.forecast_ledger (question_id, question_text, resolution_criteria, reference_class, horizon_date, forecaster, probability)
     VALUES ('TEST-q1', 'TEST question 1?', 'Resolves YES if TEST.', 'TEST class', current_date + 30, 'desk', 0.35)$q$, true);
SELECT tl_test.chk('insert forecast q1 (market)', 'ok',
  $q$INSERT INTO public.forecast_ledger (question_id, question_text, resolution_criteria, horizon_date, forecaster, probability)
     VALUES ('TEST-q1', 'TEST question 1?', 'Resolves YES if TEST.', current_date + 30, 'market:polymarket', 0.410)$q$, true);
SELECT tl_test.chk('insert forecast q2 with forged chain fields (ignored)', 'ok',
  $q$INSERT INTO public.forecast_ledger (id, chain_seq, question_id, question_text, resolution_criteria, horizon_date, forecaster, probability, created_at, prev_hash, row_hash)
     VALUES ('00000000-0000-0000-0000-0000000000ff', 999, 'TEST-q2', 'TEST question 2?', 'Resolves YES if TEST 2.', current_date + 60, 'omar', 0.8,
             '2020-01-01', repeat('a', 64), repeat('f', 64))$q$, true);
SELECT tl_test.chk('forged chain fields replaced by the database', 'ok=3|false|false|true',
  $q$SELECT chain_seq || '|' || (id = '00000000-0000-0000-0000-0000000000ff') || '|' || (row_hash = repeat('f', 64)) || '|' || (created_at > now() - interval '1 minute')
       FROM public.forecast_ledger WHERE question_id = 'TEST-q2'$q$);
SELECT tl_test.chk('chain links: row 1 prev = 64 zeros, row n prev = row n-1 hash', 'ok=true',
  $q$SELECT bool_and(CASE WHEN chain_seq = 1 THEN prev_hash = repeat('0', 64)
                          ELSE prev_hash = (SELECT p.row_hash FROM public.forecast_ledger p WHERE p.chain_seq = l.chain_seq - 1) END)::text
       FROM public.forecast_ledger l$q$);
SELECT tl_test.chk('verify_forecast_chain() = NULL on an intact chain', 'ok=<null>', $q$SELECT public.verify_forecast_chain()::text$q$);
SELECT tl_test.chk('forecast with past horizon rejected (no back-filling)', 'rejected',
  $q$INSERT INTO public.forecast_ledger (question_id, question_text, resolution_criteria, horizon_date, forecaster, probability)
     VALUES ('TEST-q3', 'q', 'c', current_date - 1, 'desk', 0.5)$q$);
SELECT tl_test.chk('probability outside 0..1 rejected', 'rejected',
  $q$INSERT INTO public.forecast_ledger (question_id, question_text, resolution_criteria, horizon_date, forecaster, probability)
     VALUES ('TEST-q3', 'q', 'c', current_date + 1, 'desk', 1.5)$q$);
SELECT tl_test.chk('resolve q1', 'ok',
  $q$INSERT INTO public.forecast_resolutions (question_id, outcome, resolved_at, resolution_source_url, notes)
     VALUES ('TEST-q1', false, now(), 'https://example.test/resolution', 'TEST')$q$, true);
SELECT tl_test.chk('second resolution without supersedes rejected', 'rejected',
  $q$INSERT INTO public.forecast_resolutions (question_id, outcome, resolved_at, resolution_source_url)
     VALUES ('TEST-q1', true, now(), 'https://example.test/r2')$q$);
SELECT tl_test.chk('superseding resolution WITHOUT a correction blocked', 'blocked',
  $q$INSERT INTO public.forecast_resolutions (question_id, outcome, resolved_at, resolution_source_url, supersedes)
     SELECT 'TEST-q1', true, now(), 'https://example.test/r2', id FROM public.forecast_resolutions WHERE question_id = 'TEST-q1'$q$);
SELECT tl_test.chk('correction for the re-resolution', 'ok',
  $q$INSERT INTO public.corrections (target_table, target_id, correction_class, summary)
     SELECT 'forecast_resolutions', id::text, 'material', 'TEST re-resolution' FROM public.forecast_resolutions WHERE question_id = 'TEST-q1'$q$, true);
SELECT tl_test.chk('superseding resolution with a published correction accepted', 'ok',
  $q$INSERT INTO public.forecast_resolutions (question_id, outcome, resolved_at, resolution_source_url, supersedes)
     SELECT 'TEST-q1', true, now(), 'https://example.test/r2', id FROM public.forecast_resolutions WHERE question_id = 'TEST-q1'$q$);
SELECT tl_test.chk('resolution of an unknown question rejected', 'rejected',
  $q$INSERT INTO public.forecast_resolutions (question_id, outcome, resolved_at, resolution_source_url)
     VALUES ('TEST-nope', true, now(), 'https://example.test/r')$q$);
SELECT tl_test.chk('forecast on an already-resolved question rejected', 'rejected',
  $q$INSERT INTO public.forecast_ledger (question_id, question_text, resolution_criteria, horizon_date, forecaster, probability)
     VALUES ('TEST-q1', 'TEST question 1?', 'Resolves YES if TEST.', current_date + 30, 'desk', 0.2)$q$);
SELECT tl_test.chk('insert posture_evidence', 'ok',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, speaker, source_url, archive_url, page_sha256, captured_at, method_version)
     VALUES ('EG', 'us-iran-2026', 'TEST verbatim quote', 'TEST speaker', 'https://example.test/p', 'https://web.archive.org/web/2026/https://example.test/p',
             repeat('b', 64), now(), 'war-posture-v1')$q$, true);
SELECT tl_test.chk('posture_evidence without source_url rejected', 'rejected',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, captured_at, method_version)
     VALUES ('EG', 'us-iran-2026', 'q', now(), 'v1')$q$);
SELECT tl_test.chk('insert market_reads', 'ok',
  $q$INSERT INTO public.market_reads (venue, market_slug, market_question, resolution_wording, bid, ask, last, liquidity, read_at, raw)
     VALUES ('polymarket', 'test-market', 'TEST?', 'TEST wording', 0.40, 0.42, 0.41, 1000, now(), '{"secret":"raw"}')$q$, true);
SELECT tl_test.chk('insert operator_rulings', 'ok',
  $q$INSERT INTO public.operator_rulings (ruled_at, topic, ruling_text, reference) VALUES (now(), 'TEST topic', 'TEST ruling', 'TEST ref')$q$, true);
SELECT tl_test.chk('insert published correction', 'ok',
  $q$INSERT INTO public.corrections (target_table, target_id, conflict_day, report_type, correction_class, summary, created_at)
     VALUES ('daily_briefings', '00000000-0000-0000-0000-00000000a003', 9003, 'general', 'clarification', 'TEST published correction', '2020-01-01')$q$, true);
SELECT tl_test.chk('insert unpublished correction', 'ok',
  $q$INSERT INTO public.corrections (target_table, target_id, correction_class, summary, published)
     VALUES ('daily_briefings', 'x', 'minor', 'TEST unpublished correction', false)$q$, true);
SELECT tl_test.chk('corrections.created_at is server time (no backdating)', 'ok=true',
  $q$SELECT (created_at > now() - interval '1 minute')::text FROM public.corrections WHERE summary = 'TEST published correction'$q$);
SELECT tl_test.chk('correction_class outside the list rejected', 'rejected',
  $q$INSERT INTO public.corrections (target_table, target_id, correction_class, summary) VALUES ('daily_briefings', 'x', 'bogus', 's')$q$);
SELECT tl_test.chk('correction without summary rejected', 'rejected',
  $q$INSERT INTO public.corrections (target_table, target_id, correction_class) VALUES ('daily_briefings', 'x', 'minor')$q$);

-- ---------- layer 1: service_role holds no UPDATE / DELETE grant on any ledger ----------
SELECT tl_test.chk('service_role UPDATE forecast_ledger', 'denied', $q$UPDATE public.forecast_ledger SET probability = 0.5$q$);
SELECT tl_test.chk('service_role DELETE forecast_ledger', 'denied', $q$DELETE FROM public.forecast_ledger$q$);
SELECT tl_test.chk('service_role UPDATE forecast_resolutions', 'denied', $q$UPDATE public.forecast_resolutions SET notes = 'x'$q$);
SELECT tl_test.chk('service_role DELETE forecast_resolutions', 'denied', $q$DELETE FROM public.forecast_resolutions$q$);
SELECT tl_test.chk('service_role UPDATE posture_evidence', 'denied', $q$UPDATE public.posture_evidence SET speaker = 'x'$q$);
SELECT tl_test.chk('service_role DELETE posture_evidence', 'denied', $q$DELETE FROM public.posture_evidence$q$);
SELECT tl_test.chk('service_role UPDATE market_reads', 'denied', $q$UPDATE public.market_reads SET last = 0.9$q$);
SELECT tl_test.chk('service_role DELETE market_reads', 'denied', $q$DELETE FROM public.market_reads$q$);
SELECT tl_test.chk('service_role UPDATE operator_rulings', 'denied', $q$UPDATE public.operator_rulings SET topic = 'x'$q$);
SELECT tl_test.chk('service_role DELETE operator_rulings', 'denied', $q$DELETE FROM public.operator_rulings$q$);
SELECT tl_test.chk('service_role UPDATE corrections.summary', 'denied', $q$UPDATE public.corrections SET summary = 'x'$q$);
SELECT tl_test.chk('service_role DELETE corrections', 'denied', $q$DELETE FROM public.corrections$q$);
SELECT tl_test.chk('service_role publishes an unpublished correction', 'ok',
  $q$UPDATE public.corrections SET published = true WHERE summary = 'TEST unpublished correction'$q$);
SELECT tl_test.chk('service_role unpublishes a published correction', 'blocked',
  $q$UPDATE public.corrections SET published = false WHERE summary = 'TEST published correction'$q$);
RESET ROLE;

-- ---------- layer 2: even WITH grants, the triggers refuse (service_role, then postgres) ----------
SELECT tl_test.chk('grant service_role UPDATE/DELETE/TRUNCATE on all ledgers (test only)', 'ok',
  $q$GRANT UPDATE, DELETE, TRUNCATE ON public.corrections, public.forecast_ledger, public.forecast_resolutions,
       public.posture_evidence, public.market_reads, public.operator_rulings TO service_role$q$, true);
SET LOCAL ROLE service_role;
SELECT tl_test.chk('service_role(+grant) UPDATE forecast_ledger', 'blocked', $q$UPDATE public.forecast_ledger SET probability = 0.5$q$);
SELECT tl_test.chk('service_role(+grant) DELETE forecast_ledger', 'blocked', $q$DELETE FROM public.forecast_ledger$q$);
SELECT tl_test.chk('service_role(+grant) TRUNCATE forecast_ledger', 'blocked', $q$TRUNCATE public.forecast_ledger$q$);
SELECT tl_test.chk('service_role(+grant) UPDATE forecast_resolutions', 'blocked', $q$UPDATE public.forecast_resolutions SET notes = 'x'$q$);
SELECT tl_test.chk('service_role(+grant) DELETE forecast_resolutions', 'blocked', $q$DELETE FROM public.forecast_resolutions$q$);
SELECT tl_test.chk('service_role(+grant) UPDATE posture_evidence', 'blocked', $q$UPDATE public.posture_evidence SET speaker = 'x'$q$);
SELECT tl_test.chk('service_role(+grant) DELETE posture_evidence', 'blocked', $q$DELETE FROM public.posture_evidence$q$);
SELECT tl_test.chk('service_role(+grant) UPDATE market_reads', 'blocked', $q$UPDATE public.market_reads SET last = 0.9$q$);
SELECT tl_test.chk('service_role(+grant) DELETE market_reads', 'blocked', $q$DELETE FROM public.market_reads$q$);
SELECT tl_test.chk('service_role(+grant) UPDATE operator_rulings', 'blocked', $q$UPDATE public.operator_rulings SET topic = 'x'$q$);
SELECT tl_test.chk('service_role(+grant) DELETE operator_rulings', 'blocked', $q$DELETE FROM public.operator_rulings$q$);
SELECT tl_test.chk('service_role(+grant) UPDATE corrections.summary', 'blocked', $q$UPDATE public.corrections SET summary = 'x'$q$);
SELECT tl_test.chk('service_role(+grant) DELETE corrections', 'blocked', $q$DELETE FROM public.corrections$q$);
RESET ROLE;
SELECT tl_test.chk('postgres UPDATE forecast_ledger', 'blocked', $q$UPDATE public.forecast_ledger SET probability = 0.5$q$);
SELECT tl_test.chk('postgres DELETE forecast_ledger', 'blocked', $q$DELETE FROM public.forecast_ledger$q$);
SELECT tl_test.chk('postgres TRUNCATE forecast_ledger', 'blocked', $q$TRUNCATE public.forecast_ledger$q$);
SELECT tl_test.chk('postgres UPDATE forecast_resolutions', 'blocked', $q$UPDATE public.forecast_resolutions SET notes = 'x'$q$);
SELECT tl_test.chk('postgres DELETE forecast_resolutions', 'blocked', $q$DELETE FROM public.forecast_resolutions$q$);
SELECT tl_test.chk('postgres TRUNCATE forecast_resolutions', 'blocked', $q$TRUNCATE public.forecast_resolutions$q$);
SELECT tl_test.chk('postgres UPDATE posture_evidence', 'blocked', $q$UPDATE public.posture_evidence SET speaker = 'x'$q$);
SELECT tl_test.chk('postgres DELETE posture_evidence', 'blocked', $q$DELETE FROM public.posture_evidence$q$);
SELECT tl_test.chk('postgres TRUNCATE posture_evidence', 'blocked', $q$TRUNCATE public.posture_evidence$q$);
SELECT tl_test.chk('postgres UPDATE market_reads', 'blocked', $q$UPDATE public.market_reads SET last = 0.9$q$);
SELECT tl_test.chk('postgres DELETE market_reads', 'blocked', $q$DELETE FROM public.market_reads$q$);
SELECT tl_test.chk('postgres TRUNCATE market_reads', 'blocked', $q$TRUNCATE public.market_reads$q$);
SELECT tl_test.chk('postgres UPDATE operator_rulings', 'blocked', $q$UPDATE public.operator_rulings SET topic = 'x'$q$);
SELECT tl_test.chk('postgres DELETE operator_rulings', 'blocked', $q$DELETE FROM public.operator_rulings$q$);
SELECT tl_test.chk('postgres TRUNCATE operator_rulings', 'blocked', $q$TRUNCATE public.operator_rulings$q$);
SELECT tl_test.chk('postgres UPDATE corrections.summary', 'blocked', $q$UPDATE public.corrections SET summary = 'x'$q$);
SELECT tl_test.chk('postgres DELETE corrections', 'blocked', $q$DELETE FROM public.corrections$q$);
SELECT tl_test.chk('postgres TRUNCATE corrections', 'blocked', $q$TRUNCATE public.corrections$q$);
SELECT tl_test.chk('postgres UPDATE forecast_ledger in replica mode', 'blocked',
  $q$SELECT tl_test.in_replica_mode('UPDATE public.forecast_ledger SET probability = 0.5')$q$);
SELECT tl_test.chk('postgres DELETE market_reads in replica mode', 'blocked',
  $q$SELECT tl_test.in_replica_mode('DELETE FROM public.market_reads')$q$);

-- ---------- tamper detection (owner disables the guard; the chain still exposes it) ----------
SELECT tl_test.chk('tamper: edit row 2 probability -> detected at row 2', 'ok=2:row_hash_mismatch', $q$SELECT tl_test.tamper('edit')$q$);
SELECT tl_test.chk('tamper: delete row 2 -> detected at row 3', 'ok=3:gap_in_chain_seq', $q$SELECT tl_test.tamper('delete')$q$);
SELECT tl_test.chk('tamper: edit row 2 + recompute its hash -> detected at row 3', 'ok=3:prev_hash_mismatch', $q$SELECT tl_test.tamper('rehash')$q$);
SELECT tl_test.chk('chain intact again after the rolled-back tampering', 'ok=<null>', $q$SELECT public.verify_forecast_chain()::text$q$);

-- ---------- no-silent-edit rule on daily_briefings ----------
SET LOCAL ROLE service_role;
SELECT tl_test.chk('silent title edit after 2h (service_role)', 'blocked',
  $q$UPDATE public.daily_briefings SET title = 'TEST silent' WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('silent sections edit after 2h', 'blocked',
  $q$UPDATE public.daily_briefings SET sections = '[{"x":1}]' WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('silent cover_stats edit after 2h', 'blocked',
  $q$UPDATE public.daily_briefings SET cover_stats = '{"x":1}' WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('moving generated_at after 2h (would reset the window)', 'blocked',
  $q$UPDATE public.daily_briefings SET generated_at = now() WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('silent DELETE after 2h', 'blocked',
  $q$DELETE FROM public.daily_briefings WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('non-content column (updated_at) after 2h allowed', 'ok',
  $q$UPDATE public.daily_briefings SET updated_at = now() WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('first Arabic translation (NULL -> text) after 2h allowed', 'ok',
  $q$UPDATE public.daily_briefings SET title_ar = 'عنوان' WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('edit within 2h allowed', 'ok',
  $q$UPDATE public.daily_briefings SET title = 'TEST rewrite in window', sections = '[{"y":2}]' WHERE id = '00000000-0000-0000-0000-00000000a002'$q$);
SELECT tl_test.chk('edit after 2h WITH a published correction allowed', 'ok=edited',
  $q$SELECT tl_test.edit_with_correction('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001', true, 'TEST corrected title')$q$);
SELECT tl_test.chk('correction for ANOTHER brief does not unlock this one', 'blocked',
  $q$SELECT tl_test.edit_with_correction('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a003', true, 'TEST wrong target')$q$);
SELECT tl_test.chk('UNPUBLISHED correction does not unlock', 'blocked',
  $q$SELECT tl_test.edit_with_correction('00000000-0000-0000-0000-00000000a001', '00000000-0000-0000-0000-00000000a001', false, 'TEST hidden')$q$);
SELECT tl_test.chk('app.correction_id = garbage -> blocked (no cast error)', 'blocked',
  $q$SELECT tl_test.edit_with_setting('00000000-0000-0000-0000-00000000a001', 'not-a-uuid')$q$);
SELECT tl_test.chk('app.correction_id = random uuid -> blocked', 'blocked',
  $q$SELECT tl_test.edit_with_setting('00000000-0000-0000-0000-00000000a001', gen_random_uuid()::text)$q$);
SELECT tl_test.chk('moving an old brief to another day after 2h (re-points its URL)', 'blocked',
  $q$UPDATE public.daily_briefings SET conflict_day = 9999 WHERE id = '00000000-0000-0000-0000-00000000a003'$q$);
SELECT tl_test.chk('changing source_ids of an old brief after 2h', 'blocked',
  $q$UPDATE public.daily_briefings SET source_ids = ARRAY['forged'] WHERE id = '00000000-0000-0000-0000-00000000a003'$q$);
SELECT tl_test.chk('INSERT with generated_at in the future rejected', 'rejected',
  $q$INSERT INTO public.daily_briefings (conflict_day, report_type, title, lead, sections, provenance, generated_at)
     SELECT 9004, (SELECT code FROM public.report_types ORDER BY code LIMIT 1), 'TEST future', 'l', '[]', 'reconstructed', now() + interval '10 years'$q$);
SELECT tl_test.chk('pushing generated_at into the future inside the window rejected', 'rejected',
  $q$UPDATE public.daily_briefings SET generated_at = now() + interval '50 years' WHERE id = '00000000-0000-0000-0000-00000000a002'$q$);
RESET ROLE;
SELECT tl_test.chk('silent title edit after 2h (postgres)', 'blocked',
  $q$UPDATE public.daily_briefings SET title = 'TEST silent pg' WHERE id = '00000000-0000-0000-0000-00000000a001'$q$);
SELECT tl_test.chk('silent edit after 2h in replica mode (postgres)', 'blocked',
  $q$SELECT tl_test.in_replica_mode($$UPDATE public.daily_briefings SET title = 'TEST replica' WHERE id = '00000000-0000-0000-0000-00000000a001'$$)$q$);
SELECT tl_test.chk('correction older than 1 day cannot be reused', 'blocked',
  $q$SELECT tl_test.edit_with_aged_correction('00000000-0000-0000-0000-00000000a001')$q$);

-- ---------- reads by the API roles ----------
SET LOCAL ROLE anon;
SELECT tl_test.chk('anon reads forecast_ledger', 'ok=3', $q$SELECT count(*)::text FROM public.forecast_ledger$q$);
SELECT tl_test.chk('anon reads forecast_resolutions', 'ok=1', $q$SELECT count(*)::text FROM public.forecast_resolutions$q$);
SELECT tl_test.chk('anon reads posture_evidence', 'ok=1', $q$SELECT count(*)::text FROM public.posture_evidence$q$);
SELECT tl_test.chk('anon reads market_reads public columns', 'ok=polymarket', $q$SELECT venue FROM public.market_reads$q$);
SELECT tl_test.chk('anon cannot read market_reads.raw', 'denied', $q$SELECT raw::text FROM public.market_reads$q$);
SELECT tl_test.chk('anon cannot SELECT * market_reads (raw included)', 'denied', $q$SELECT count(*) FROM (SELECT * FROM public.market_reads) s$q$);
SELECT tl_test.chk('anon cannot read operator_rulings', 'denied', $q$SELECT count(*) FROM public.operator_rulings$q$);
SELECT tl_test.chk('anon sees published corrections only', 'ok=0', $q$SELECT count(*)::text FROM public.corrections WHERE NOT published$q$);
SELECT tl_test.chk('anon sees the published corrections', 'ok=2', $q$SELECT count(*)::text FROM public.corrections$q$);
SELECT tl_test.chk('anon runs verify_forecast_chain()', 'ok=<null>', $q$SELECT public.verify_forecast_chain()::text$q$);
SELECT tl_test.chk('anon INSERT corrections', 'denied',
  $q$INSERT INTO public.corrections (target_table, target_id, correction_class, summary) VALUES ('daily_briefings', 'x', 'minor', 's')$q$);
SELECT tl_test.chk('anon INSERT forecast_ledger', 'denied',
  $q$INSERT INTO public.forecast_ledger (question_id, question_text, resolution_criteria, horizon_date, forecaster, probability)
     VALUES ('TEST-anon', 'q', 'c', current_date + 1, 'desk', 0.5)$q$);
SELECT tl_test.chk('anon UPDATE forecast_ledger', 'denied', $q$UPDATE public.forecast_ledger SET probability = 0.5$q$);
SELECT tl_test.chk('anon cannot call the no-silent-edit trigger function', 'denied', $q$SELECT public.daily_briefings_no_silent_edit()::text$q$);
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT tl_test.chk('authenticated cannot read operator_rulings', 'denied', $q$SELECT count(*) FROM public.operator_rulings$q$);
SELECT tl_test.chk('authenticated cannot read market_reads.raw', 'denied', $q$SELECT raw::text FROM public.market_reads$q$);
SELECT tl_test.chk('authenticated reads forecast_ledger', 'ok=3', $q$SELECT count(*)::text FROM public.forecast_ledger$q$);
SELECT tl_test.chk('authenticated INSERT posture_evidence', 'denied',
  $q$INSERT INTO public.posture_evidence (country_code, conflict_code, position_quote, source_url, captured_at, method_version)
     VALUES ('EG', 'x', 'q', 'https://example.test', now(), 'v')$q$);
RESET ROLE;

-- ---------- report ----------
\echo
\echo '== trust_ledgers_test summary'
SELECT count(*) AS total, count(*) FILTER (WHERE pass) AS pass, count(*) FILTER (WHERE NOT pass) AS fail FROM tl_test.results;
\echo '== failures'
SELECT n, who, label, expect, got, left(detail, 120) AS detail FROM tl_test.results WHERE NOT pass ORDER BY n;
DO $$
DECLARE f int;
BEGIN
  SELECT count(*) INTO f FROM tl_test.results WHERE NOT pass;
  IF f > 0 THEN RAISE EXCEPTION 'trust_ledgers_test: % check(s) FAILED', f; END IF;
  RAISE NOTICE 'trust_ledgers_test: all checks passed';
END $$;
ROLLBACK;
