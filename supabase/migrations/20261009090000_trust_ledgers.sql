-- =====================================================================================================
-- 20261009090000_trust_ledgers.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- Trust layer (strategy 2026-10-08, approved by the operator): corrections log, no-silent-edit rule on
-- published briefs, and append-only ledgers that hold the desk's track record.
--
--   §1  public.corrections            — public log of corrections (published rows readable by anyone)
--   §2  daily_briefings no-silent-edit — content edits / deletes later than the edit window need a
--                                       corrections row referenced through SET LOCAL app.correction_id
--   §3  append-only ledgers            — forecast_ledger (hash-chained), forecast_resolutions,
--                                       posture_evidence, market_reads, operator_rulings
--   §4  public.verify_forecast_chain() — recomputes the hash chain; returns the first broken row or NULL
--   §5  grants + RLS (explicit: the pending 20261008090000_security_hardening.sql revokes default
--       privileges, and the live default ACL still grants ALL to anon — neither is relied on here)
--   §6  post-condition asserts
--
-- Append-only means: UPDATE, DELETE and TRUNCATE raise for EVERY role, service_role and postgres
-- included. The guard triggers are ENABLE ALWAYS, so session_replication_role = replica does not skip
-- them. The table owner can still ALTER TABLE ... DISABLE TRIGGER or DROP: that is outside what a
-- database can stop its owner doing, and is why .github/workflows/ledger-hash.yml anchors a daily
-- row count + SHA-256 of each ledger to the `ledger-hashes` git branch (tampering becomes visible).
--
-- Hashing uses the built-in pg_catalog.sha256(bytea) (Postgres 11+). It gives the same bytes as
-- pgcrypto's digest(x, 'sha256') but does not depend on where pgcrypto is installed (schema
-- `extensions` on Supabase, `public` elsewhere), so there is no search_path to get wrong.
--
-- Idempotent: re-running is a no-op (IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS + CREATE).
-- Works with or without 20261008090000_security_hardening.sql applied, in either order.
-- ONE TRANSACTION (own BEGIN/COMMIT). Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261009090000_trust_ledgers.sql
-- Tests: supabase/tests/trust_ledgers_test.sql (+ run_trust_ledgers_tests.sh).
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight
DO $pre$
BEGIN
  IF to_regclass('public.daily_briefings') IS NULL THEN
    RAISE EXCEPTION 'trust_ledgers preflight: public.daily_briefings not found';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    RAISE EXCEPTION 'trust_ledgers preflight: Supabase API roles anon / authenticated / service_role not found';
  END IF;
  IF (SELECT count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'daily_briefings'
         AND column_name IN ('id', 'title', 'lead', 'sections', 'cover_stats', 'generated_at',
                             'title_ar', 'lead_ar', 'sections_ar')) <> 9 THEN
    RAISE EXCEPTION 'trust_ledgers preflight: daily_briefings content columns differ from the 2026-10-08 live schema';
  END IF;
END $pre$;

-- =====================================================================================================
-- Shared helpers
-- =====================================================================================================

-- Raises on UPDATE / DELETE / TRUNCATE. Attached to every append-only table.
CREATE OR REPLACE FUNCTION public.trust_append_only_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  RAISE EXCEPTION 'public.% is append-only: % is not allowed (role %). Record a new row instead; a mistake is fixed by a new row plus a public.corrections entry.',
    TG_TABLE_NAME, TG_OP, current_user
    USING ERRCODE = 'restrict_violation';
END $fn$;

-- Server-side insert stamp: created_at is the database clock, never a client value (no backdating).
CREATE OR REPLACE FUNCTION public.trust_stamp_created_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  NEW.created_at := clock_timestamp();
  RETURN NEW;
END $fn$;

-- The no-silent-edit window. One place, one constant.
CREATE OR REPLACE FUNCTION public.briefing_edit_window()
RETURNS interval
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$ SELECT interval '2 hours' $fn$;
COMMENT ON FUNCTION public.briefing_edit_window() IS
  'No-silent-edit window for public.daily_briefings: content may be rewritten freely until generated_at + this interval (the daily build writes and re-writes inside it). After it, every content edit or delete needs a published public.corrections row for that brief, referenced with SET LOCAL app.correction_id in the same transaction. Change only by a new migration, and log the change in operator_rulings.';

-- =====================================================================================================
-- §1 public.corrections
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.corrections (
  id               uuid        NOT NULL DEFAULT gen_random_uuid(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  target_table     text        NOT NULL,
  target_id        text        NOT NULL,
  conflict_day     integer,
  report_type      text,
  correction_class text        NOT NULL,
  summary          text        NOT NULL,
  before_excerpt   text,
  after_excerpt    text,
  published        boolean     NOT NULL DEFAULT true,
  CONSTRAINT corrections_pkey PRIMARY KEY (id),
  CONSTRAINT corrections_class_chk CHECK (correction_class IN ('material', 'minor', 'clarification', 'reply')),
  CONSTRAINT corrections_target_table_chk CHECK (target_table ~ '^[a-z_][a-z0-9_]{0,62}$'),
  CONSTRAINT corrections_target_id_chk CHECK (length(btrim(target_id)) BETWEEN 1 AND 200),
  CONSTRAINT corrections_summary_chk CHECK (length(btrim(summary)) BETWEEN 1 AND 4000),
  CONSTRAINT corrections_excerpt_len_chk CHECK (COALESCE(length(before_excerpt), 0) <= 8000 AND COALESCE(length(after_excerpt), 0) <= 8000),
  CONSTRAINT corrections_day_chk CHECK (conflict_day IS NULL OR conflict_day >= 1)
);
CREATE INDEX IF NOT EXISTS corrections_created_at_idx ON public.corrections (created_at DESC);
CREATE INDEX IF NOT EXISTS corrections_target_idx ON public.corrections (target_table, target_id);
COMMENT ON TABLE public.corrections IS
  'Public corrections log (trust layer, 2026-10-09). Insert-only: rows are never edited or deleted; the only allowed change is published false -> true. A correction to a correction is a new row.';

-- Corrections are append-only except that an unpublished row may be published (false -> true).
CREATE OR REPLACE FUNCTION public.corrections_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD.published IS FALSE AND NEW.published IS TRUE
     AND (to_jsonb(NEW) - 'published') = (to_jsonb(OLD) - 'published') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'public.corrections is append-only: % is not allowed (role %). The only permitted change is published false -> true; publish a further correction instead.',
    TG_OP, current_user
    USING ERRCODE = 'restrict_violation';
END $fn$;

DROP TRIGGER IF EXISTS corrections_stamp ON public.corrections;
CREATE TRIGGER corrections_stamp BEFORE INSERT ON public.corrections
  FOR EACH ROW EXECUTE FUNCTION public.trust_stamp_created_at();
DROP TRIGGER IF EXISTS corrections_guard ON public.corrections;
CREATE TRIGGER corrections_guard BEFORE UPDATE OR DELETE ON public.corrections
  FOR EACH ROW EXECUTE FUNCTION public.corrections_guard();
DROP TRIGGER IF EXISTS corrections_no_truncate ON public.corrections;
CREATE TRIGGER corrections_no_truncate BEFORE TRUNCATE ON public.corrections
  FOR EACH STATEMENT EXECUTE FUNCTION public.trust_append_only_guard();
ALTER TABLE public.corrections ENABLE ALWAYS TRIGGER corrections_stamp;
ALTER TABLE public.corrections ENABLE ALWAYS TRIGGER corrections_guard;
ALTER TABLE public.corrections ENABLE ALWAYS TRIGGER corrections_no_truncate;

-- =====================================================================================================
-- §2 No-silent-edit rule on public.daily_briefings
-- =====================================================================================================
-- Protected content columns (live schema 2026-10-08): title, lead, sections, cover_stats, title_ar,
-- lead_ar, sections_ar, plus generated_at itself (moving it would reset the window). Filling an
-- Arabic column for the first time (NULL -> text) is a translation, not an edit, and is allowed.
-- DELETE of a brief older than the window is treated the same way as an edit.
CREATE OR REPLACE FUNCTION public.daily_briefings_no_silent_edit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_changed    boolean;
  v_correction text := NULLIF(btrim(current_setting('app.correction_id', true)), '');
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_changed :=
         NEW.title        IS DISTINCT FROM OLD.title
      OR NEW.lead         IS DISTINCT FROM OLD.lead
      OR NEW.sections     IS DISTINCT FROM OLD.sections
      OR NEW.cover_stats  IS DISTINCT FROM OLD.cover_stats
      OR NEW.generated_at IS DISTINCT FROM OLD.generated_at
      OR (OLD.title_ar    IS NOT NULL AND NEW.title_ar    IS DISTINCT FROM OLD.title_ar)
      OR (OLD.lead_ar     IS NOT NULL AND NEW.lead_ar     IS DISTINCT FROM OLD.lead_ar)
      OR (OLD.sections_ar IS NOT NULL AND NEW.sections_ar IS DISTINCT FROM OLD.sections_ar);
    IF NOT v_changed THEN
      RETURN NEW;
    END IF;
  END IF;

  IF now() - OLD.generated_at <= public.briefing_edit_window() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF v_correction IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.corrections c
        WHERE c.id::text = v_correction
          AND c.target_table = 'daily_briefings'
          AND c.target_id = OLD.id::text
          AND c.published
          AND c.created_at >= now() - interval '1 day') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  RAISE EXCEPTION 'No silent edits: daily_briefings % (day %, %) was generated at % — more than % ago — so this % must be logged as a correction.',
    OLD.id, OLD.conflict_day, OLD.report_type, OLD.generated_at, public.briefing_edit_window(), TG_OP
    USING ERRCODE = 'restrict_violation',
          HINT = format('In ONE transaction: INSERT INTO public.corrections (target_table, target_id, conflict_day, report_type, correction_class, summary, before_excerpt, after_excerpt) VALUES (''daily_briefings'', %L, %s, %L, ''material|minor|clarification|reply'', ''what changed and why'', ''...'', ''...'') RETURNING id; then SET LOCAL app.correction_id = ''<that id>''; then repeat the %s. The correction must be published and less than 1 day old.',
                        OLD.id::text, OLD.conflict_day, OLD.report_type, TG_OP);
END $fn$;
COMMENT ON FUNCTION public.daily_briefings_no_silent_edit() IS
  'BEFORE UPDATE OR DELETE on daily_briefings. After generated_at + briefing_edit_window(), a change to title/lead/sections/cover_stats/generated_at (or to an Arabic column that already has text), or a DELETE, raises unless current_setting(''app.correction_id'') names a published corrections row (< 1 day old) whose target_table = ''daily_briefings'' and target_id = the brief id.';

DROP TRIGGER IF EXISTS daily_briefings_no_silent_edit ON public.daily_briefings;
CREATE TRIGGER daily_briefings_no_silent_edit BEFORE UPDATE OR DELETE ON public.daily_briefings
  FOR EACH ROW EXECUTE FUNCTION public.daily_briefings_no_silent_edit();
ALTER TABLE public.daily_briefings ENABLE ALWAYS TRIGGER daily_briefings_no_silent_edit;

-- =====================================================================================================
-- §3 Append-only ledgers
-- =====================================================================================================

-- 3a forecast_ledger — pre-registered probability forecasts, SHA-256 hash-chained.
CREATE TABLE IF NOT EXISTS public.forecast_ledger (
  id                  uuid        NOT NULL DEFAULT gen_random_uuid(),
  chain_seq           bigint      NOT NULL,
  question_id         text        NOT NULL,
  question_text       text        NOT NULL,
  resolution_criteria text        NOT NULL,
  reference_class     text,
  horizon_date        date        NOT NULL,
  forecaster          text        NOT NULL,
  probability         numeric     NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  prev_hash           text        NOT NULL,
  row_hash            text        NOT NULL,
  CONSTRAINT forecast_ledger_pkey PRIMARY KEY (id),
  CONSTRAINT forecast_ledger_chain_seq_key UNIQUE (chain_seq),
  CONSTRAINT forecast_ledger_row_hash_key UNIQUE (row_hash),
  CONSTRAINT forecast_ledger_probability_chk CHECK (probability >= 0 AND probability <= 1),
  CONSTRAINT forecast_ledger_question_id_chk CHECK (question_id ~ '^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$'),
  CONSTRAINT forecast_ledger_forecaster_chk CHECK (forecaster ~ '^[a-z0-9][a-z0-9._:-]{0,63}$'),
  CONSTRAINT forecast_ledger_text_chk CHECK (length(btrim(question_text)) BETWEEN 1 AND 2000
                                             AND length(btrim(resolution_criteria)) BETWEEN 1 AND 4000
                                             AND COALESCE(length(reference_class), 0) <= 2000),
  CONSTRAINT forecast_ledger_hash_shape_chk CHECK (prev_hash ~ '^[0-9a-f]{64}$' AND row_hash ~ '^[0-9a-f]{64}$')
);
CREATE INDEX IF NOT EXISTS forecast_ledger_question_idx ON public.forecast_ledger (question_id, created_at);
COMMENT ON TABLE public.forecast_ledger IS
  'Append-only, hash-chained forecast ledger. Rows are chained in chain_seq order (assigned under an advisory lock at insert): row_hash = sha256_hex(prev_hash || forecast_ledger_canonical(row)); the first row''s prev_hash is 64 zeros. id, chain_seq, created_at, prev_hash and row_hash are set by the database; client values are ignored. Check with SELECT public.verify_forecast_chain().';
COMMENT ON COLUMN public.forecast_ledger.forecaster IS 'Who made the forecast, e.g. desk, omar, market:polymarket.';
COMMENT ON COLUMN public.forecast_ledger.probability IS 'Probability that the question resolves YES, 0..1.';

-- Canonical text of a ledger row: a JSON array with a fixed field order. Timestamps in UTC with
-- microseconds, dates as YYYY-MM-DD, probability with trailing zeros trimmed (0.350 -> 0.35).
CREATE OR REPLACE FUNCTION public.forecast_ledger_canonical(
  p_chain_seq bigint, p_id uuid, p_question_id text, p_question_text text, p_resolution_criteria text,
  p_reference_class text, p_horizon_date date, p_forecaster text, p_probability numeric, p_created_at timestamptz)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT jsonb_build_array(
           p_chain_seq, p_id::text, p_question_id, p_question_text, p_resolution_criteria,
           p_reference_class, to_char(p_horizon_date, 'YYYY-MM-DD'), p_forecaster,
           trim_scale(p_probability)::text,
           to_char(p_created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'))::text
$fn$;

CREATE OR REPLACE FUNCTION public.forecast_ledger_row_hash(p_prev_hash text, p_canonical text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT encode(pg_catalog.sha256(convert_to(p_prev_hash || p_canonical, 'UTF8')), 'hex')
$fn$;

CREATE OR REPLACE FUNCTION public.forecast_ledger_chain()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  v_prev_seq  bigint;
  v_prev_hash text;
BEGIN
  -- Serialise chain appends: held until this transaction commits, so the next writer sees our row.
  PERFORM pg_advisory_xact_lock(hashtextextended('public.forecast_ledger chain', 0));

  IF NEW.horizon_date < (now() AT TIME ZONE 'UTC')::date THEN
    RAISE EXCEPTION 'forecast_ledger: horizon_date % is in the past — forecasts are pre-registered, not back-filled', NEW.horizon_date
      USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.forecast_resolutions r WHERE r.question_id = NEW.question_id) THEN
    RAISE EXCEPTION 'forecast_ledger: question % already has a resolution — no forecasts after the fact', NEW.question_id
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT l.chain_seq, l.row_hash INTO v_prev_seq, v_prev_hash
    FROM public.forecast_ledger l ORDER BY l.chain_seq DESC LIMIT 1;

  NEW.id         := gen_random_uuid();
  NEW.chain_seq  := COALESCE(v_prev_seq, 0) + 1;
  NEW.created_at := clock_timestamp();
  NEW.prev_hash  := COALESCE(v_prev_hash, repeat('0', 64));
  NEW.row_hash   := public.forecast_ledger_row_hash(NEW.prev_hash, public.forecast_ledger_canonical(
                      NEW.chain_seq, NEW.id, NEW.question_id, NEW.question_text, NEW.resolution_criteria,
                      NEW.reference_class, NEW.horizon_date, NEW.forecaster, NEW.probability, NEW.created_at));
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS forecast_ledger_chain ON public.forecast_ledger;
CREATE TRIGGER forecast_ledger_chain BEFORE INSERT ON public.forecast_ledger
  FOR EACH ROW EXECUTE FUNCTION public.forecast_ledger_chain();
ALTER TABLE public.forecast_ledger ENABLE ALWAYS TRIGGER forecast_ledger_chain;

-- 3b forecast_resolutions — how each question resolved (or was annulled). A wrong resolution is not
-- edited: a new row supersedes it (supersedes = the old id) and a corrections row explains why.
CREATE TABLE IF NOT EXISTS public.forecast_resolutions (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  question_id           text        NOT NULL,
  status                text        NOT NULL DEFAULT 'resolved',
  outcome               boolean,
  resolved_at           timestamptz NOT NULL,
  resolution_source_url text        NOT NULL,
  notes                 text,
  supersedes            uuid,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT forecast_resolutions_pkey PRIMARY KEY (id),
  CONSTRAINT forecast_resolutions_supersedes_fkey FOREIGN KEY (supersedes) REFERENCES public.forecast_resolutions (id),
  CONSTRAINT forecast_resolutions_supersedes_key UNIQUE (supersedes),
  CONSTRAINT forecast_resolutions_status_chk CHECK (status IN ('resolved', 'annulled')),
  CONSTRAINT forecast_resolutions_outcome_chk CHECK ((status = 'resolved') = (outcome IS NOT NULL)),
  CONSTRAINT forecast_resolutions_url_chk CHECK (resolution_source_url ~* '^https?://[^[:space:]]+$' AND length(resolution_source_url) <= 2048),
  CONSTRAINT forecast_resolutions_notes_chk CHECK (COALESCE(length(notes), 0) <= 4000)
);
CREATE INDEX IF NOT EXISTS forecast_resolutions_question_idx ON public.forecast_resolutions (question_id);
COMMENT ON TABLE public.forecast_resolutions IS
  'Append-only resolutions for forecast_ledger questions. outcome = true when the question resolved YES. status annulled = question voided (no outcome, excluded from scoring). The effective resolution of a question is the row no other row supersedes.';

CREATE OR REPLACE FUNCTION public.forecast_resolutions_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  NEW.created_at := clock_timestamp();
  IF NOT EXISTS (SELECT 1 FROM public.forecast_ledger l WHERE l.question_id = NEW.question_id) THEN
    RAISE EXCEPTION 'forecast_resolutions: question % has no forecast in forecast_ledger', NEW.question_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  IF NEW.resolved_at > clock_timestamp() + interval '5 minutes' THEN
    RAISE EXCEPTION 'forecast_resolutions: resolved_at % is in the future', NEW.resolved_at USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.supersedes IS NULL AND EXISTS (SELECT 1 FROM public.forecast_resolutions r WHERE r.question_id = NEW.question_id) THEN
    RAISE EXCEPTION 'forecast_resolutions: question % is already resolved — insert a superseding row (supersedes = old id) and log a correction', NEW.question_id
      USING ERRCODE = 'unique_violation';
  END IF;
  IF NEW.supersedes IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM public.forecast_resolutions r WHERE r.id = NEW.supersedes AND r.question_id = NEW.question_id) THEN
    RAISE EXCEPTION 'forecast_resolutions: superseded row % is not a resolution of question %', NEW.supersedes, NEW.question_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS forecast_resolutions_check ON public.forecast_resolutions;
CREATE TRIGGER forecast_resolutions_check BEFORE INSERT ON public.forecast_resolutions
  FOR EACH ROW EXECUTE FUNCTION public.forecast_resolutions_check();
ALTER TABLE public.forecast_resolutions ENABLE ALWAYS TRIGGER forecast_resolutions_check;

-- 3c posture_evidence — verbatim statements behind War Posture scores, with archive + page hash.
CREATE TABLE IF NOT EXISTS public.posture_evidence (
  id             uuid        NOT NULL DEFAULT gen_random_uuid(),
  country_code   text        NOT NULL,
  conflict_code  text        NOT NULL,
  position_quote text        NOT NULL,
  speaker        text,
  source_url     text        NOT NULL,
  archive_url    text,
  page_sha256    text,
  captured_at    timestamptz NOT NULL,
  method_version text        NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posture_evidence_pkey PRIMARY KEY (id),
  CONSTRAINT posture_evidence_country_chk CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT posture_evidence_conflict_chk CHECK (conflict_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT posture_evidence_quote_chk CHECK (length(btrim(position_quote)) BETWEEN 1 AND 8000),
  CONSTRAINT posture_evidence_speaker_chk CHECK (COALESCE(length(speaker), 0) <= 300),
  CONSTRAINT posture_evidence_url_chk CHECK (source_url ~* '^https?://[^[:space:]]+$' AND length(source_url) <= 2048
                                             AND (archive_url IS NULL OR (archive_url ~* '^https?://[^[:space:]]+$' AND length(archive_url) <= 2048))),
  CONSTRAINT posture_evidence_sha_chk CHECK (page_sha256 IS NULL OR page_sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT posture_evidence_method_chk CHECK (length(btrim(method_version)) BETWEEN 1 AND 64)
);
CREATE INDEX IF NOT EXISTS posture_evidence_country_idx ON public.posture_evidence (country_code, captured_at DESC);
COMMENT ON TABLE public.posture_evidence IS
  'Append-only evidence ledger for War Posture: verbatim position quotes with source URL, archive URL and the SHA-256 of the page as captured.';

-- 3d market_reads — raw prediction-market reads (prices normalised to 0..1).
CREATE TABLE IF NOT EXISTS public.market_reads (
  id                 uuid        NOT NULL DEFAULT gen_random_uuid(),
  venue              text        NOT NULL,
  market_slug        text        NOT NULL,
  market_question    text,
  resolution_wording text,
  bid                numeric,
  ask                numeric,
  last               numeric,
  liquidity          numeric,
  read_at            timestamptz NOT NULL,
  raw                jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_reads_pkey PRIMARY KEY (id),
  CONSTRAINT market_reads_venue_chk CHECK (venue ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT market_reads_slug_chk CHECK (length(btrim(market_slug)) BETWEEN 1 AND 300),
  CONSTRAINT market_reads_price_chk CHECK ((bid  IS NULL OR (bid  >= 0 AND bid  <= 1))
                                       AND (ask  IS NULL OR (ask  >= 0 AND ask  <= 1))
                                       AND (last IS NULL OR (last >= 0 AND last <= 1))),
  CONSTRAINT market_reads_liquidity_chk CHECK (liquidity IS NULL OR liquidity >= 0)
);
CREATE INDEX IF NOT EXISTS market_reads_market_idx ON public.market_reads (venue, market_slug, read_at DESC);
COMMENT ON TABLE public.market_reads IS
  'Append-only prediction-market reads. bid/ask/last are probabilities 0..1 (venue prices normalised). raw = the venue response as read; not exposed to anon/authenticated.';

-- 3e operator_rulings — the operator's rulings, service-only.
CREATE TABLE IF NOT EXISTS public.operator_rulings (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  ruled_at    timestamptz NOT NULL,
  topic       text        NOT NULL,
  ruling_text text        NOT NULL,
  reference   text,
  supersedes  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT operator_rulings_pkey PRIMARY KEY (id),
  CONSTRAINT operator_rulings_supersedes_fkey FOREIGN KEY (supersedes) REFERENCES public.operator_rulings (id),
  CONSTRAINT operator_rulings_text_chk CHECK (length(btrim(topic)) BETWEEN 1 AND 300 AND length(btrim(ruling_text)) BETWEEN 1 AND 20000
                                              AND COALESCE(length(reference), 0) <= 2000)
);
COMMENT ON TABLE public.operator_rulings IS
  'Append-only record of operator rulings (service-only). A changed ruling is a new row with supersedes = the old id.';

-- created_at stamp + append-only guards on the ledgers (forecast_ledger / forecast_resolutions stamp
-- created_at in their own BEFORE INSERT triggers above).
DO $guards$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['forecast_ledger', 'forecast_resolutions', 'posture_evidence', 'market_reads', 'operator_rulings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_append_only', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trust_append_only_guard()', t || '_append_only', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER %I', t, t || '_append_only');
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.trust_append_only_guard()', t || '_no_truncate', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER %I', t, t || '_no_truncate');
  END LOOP;
  FOREACH t IN ARRAY ARRAY['posture_evidence', 'market_reads', 'operator_rulings'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_stamp', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE INSERT ON public.%I FOR EACH ROW EXECUTE FUNCTION public.trust_stamp_created_at()', t || '_stamp', t);
    EXECUTE format('ALTER TABLE public.%I ENABLE ALWAYS TRIGGER %I', t, t || '_stamp');
  END LOOP;
END $guards$;

-- =====================================================================================================
-- §4 verify_forecast_chain()
-- =====================================================================================================
-- Walks forecast_ledger in chain_seq order and recomputes every hash. Returns NULL when the chain is
-- intact, otherwise a JSON object describing the FIRST broken row.
CREATE OR REPLACE FUNCTION public.verify_forecast_chain()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SET search_path = ''
AS $fn$
DECLARE
  r          public.forecast_ledger%ROWTYPE;
  v_expected_seq  bigint := 1;
  v_expected_prev text := repeat('0', 64);
  v_hash     text;
BEGIN
  FOR r IN SELECT * FROM public.forecast_ledger ORDER BY chain_seq LOOP
    IF r.chain_seq <> v_expected_seq THEN
      RETURN jsonb_build_object('chain_seq', r.chain_seq, 'id', r.id, 'problem', 'gap_in_chain_seq',
                                'expected_chain_seq', v_expected_seq);
    END IF;
    IF r.prev_hash <> v_expected_prev THEN
      RETURN jsonb_build_object('chain_seq', r.chain_seq, 'id', r.id, 'problem', 'prev_hash_mismatch',
                                'expected', v_expected_prev, 'stored', r.prev_hash);
    END IF;
    v_hash := public.forecast_ledger_row_hash(r.prev_hash, public.forecast_ledger_canonical(
                r.chain_seq, r.id, r.question_id, r.question_text, r.resolution_criteria,
                r.reference_class, r.horizon_date, r.forecaster, r.probability, r.created_at));
    IF v_hash <> r.row_hash THEN
      RETURN jsonb_build_object('chain_seq', r.chain_seq, 'id', r.id, 'problem', 'row_hash_mismatch',
                                'expected', v_hash, 'stored', r.row_hash);
    END IF;
    v_expected_prev := r.row_hash;
    v_expected_seq  := v_expected_seq + 1;
  END LOOP;
  RETURN NULL;
END $fn$;
COMMENT ON FUNCTION public.verify_forecast_chain() IS
  'Recomputes the forecast_ledger SHA-256 chain. NULL = intact; otherwise {chain_seq, id, problem, expected, stored} for the first broken row. Public (SECURITY INVOKER; anon can read the ledger).';

-- =====================================================================================================
-- §5 Grants + RLS. Nothing is inherited from default privileges: revoke everything, grant exactly.
-- =====================================================================================================
REVOKE ALL ON public.corrections, public.forecast_ledger, public.forecast_resolutions,
              public.posture_evidence, public.market_reads, public.operator_rulings
  FROM PUBLIC, anon, authenticated, service_role;

-- reads
GRANT SELECT ON public.corrections, public.forecast_ledger, public.forecast_resolutions, public.posture_evidence
  TO anon, authenticated, service_role;
GRANT SELECT (id, venue, market_slug, market_question, resolution_wording, bid, ask, last, liquidity, read_at, created_at)
  ON public.market_reads TO anon, authenticated;
GRANT SELECT ON public.market_reads, public.operator_rulings TO service_role;

-- writes: INSERT only (append-only), service_role only; corrections may flip published false -> true.
GRANT INSERT ON public.corrections, public.forecast_ledger, public.forecast_resolutions,
                public.posture_evidence, public.market_reads, public.operator_rulings TO service_role;
GRANT UPDATE (published) ON public.corrections TO service_role;

ALTER TABLE public.corrections          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_ledger      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.forecast_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posture_evidence     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.market_reads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operator_rulings     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS corrections_public_read ON public.corrections;
CREATE POLICY corrections_public_read ON public.corrections AS PERMISSIVE FOR SELECT TO anon, authenticated USING (published);
DROP POLICY IF EXISTS forecast_ledger_public_read ON public.forecast_ledger;
CREATE POLICY forecast_ledger_public_read ON public.forecast_ledger AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS forecast_resolutions_public_read ON public.forecast_resolutions;
CREATE POLICY forecast_resolutions_public_read ON public.forecast_resolutions AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS posture_evidence_public_read ON public.posture_evidence;
CREATE POLICY posture_evidence_public_read ON public.posture_evidence AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS market_reads_public_read ON public.market_reads;
CREATE POLICY market_reads_public_read ON public.market_reads AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
-- operator_rulings: no policy for anon/authenticated (and no grant) — service_role bypasses RLS.
-- Explicit service policies (documents intent; service_role has BYPASSRLS on Supabase anyway).
DROP POLICY IF EXISTS operator_rulings_service ON public.operator_rulings;
CREATE POLICY operator_rulings_service ON public.operator_rulings AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- functions: trigger functions and internal helpers are not callable through the API.
REVOKE ALL ON FUNCTION public.trust_append_only_guard(), public.trust_stamp_created_at(), public.corrections_guard(),
                       public.daily_briefings_no_silent_edit(), public.forecast_ledger_chain(),
                       public.forecast_resolutions_check()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.briefing_edit_window(),
                       public.forecast_ledger_canonical(bigint, uuid, text, text, text, text, date, text, numeric, timestamptz),
                       public.forecast_ledger_row_hash(text, text),
                       public.verify_forecast_chain()
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.briefing_edit_window(),
                          public.forecast_ledger_canonical(bigint, uuid, text, text, text, text, date, text, numeric, timestamptz),
                          public.forecast_ledger_row_hash(text, text),
                          public.verify_forecast_chain()
  TO anon, authenticated, service_role;

-- =====================================================================================================
-- §6 Post-condition asserts
-- =====================================================================================================
DO $post$
DECLARE
  bad text;
BEGIN
  SELECT string_agg(DISTINCT c.relname || ':' || r.rolname || ':' || p.priv, ', ') INTO bad
    FROM pg_class c
    CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(priv)
   WHERE c.oid IN ('public.corrections'::regclass, 'public.forecast_ledger'::regclass, 'public.forecast_resolutions'::regclass,
                   'public.posture_evidence'::regclass, 'public.market_reads'::regclass, 'public.operator_rulings'::regclass)
     AND has_table_privilege(r.rolname, c.oid, p.priv);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'trust_ledgers post-check: API roles hold write privileges: %', bad; END IF;

  IF has_table_privilege('anon', 'public.operator_rulings', 'SELECT')
     OR has_table_privilege('authenticated', 'public.operator_rulings', 'SELECT')
     OR has_column_privilege('anon', 'public.market_reads', 'raw', 'SELECT')
     OR has_column_privilege('authenticated', 'public.market_reads', 'raw', 'SELECT')
     OR NOT has_column_privilege('anon', 'public.market_reads', 'last', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.forecast_ledger', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.corrections', 'SELECT')
     OR has_table_privilege('service_role', 'public.forecast_ledger', 'UPDATE')
     OR has_table_privilege('service_role', 'public.forecast_ledger', 'DELETE')
     OR NOT has_table_privilege('service_role', 'public.forecast_ledger', 'INSERT')
     OR NOT has_function_privilege('anon', 'public.verify_forecast_chain()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.daily_briefings_no_silent_edit()', 'EXECUTE')
  THEN
    RAISE EXCEPTION 'trust_ledgers post-check: privilege matrix not as intended';
  END IF;

  SELECT string_agg(c.relname, ', ') INTO bad
    FROM pg_class c
   WHERE c.oid IN ('public.corrections'::regclass, 'public.forecast_ledger'::regclass, 'public.forecast_resolutions'::regclass,
                   'public.posture_evidence'::regclass, 'public.market_reads'::regclass, 'public.operator_rulings'::regclass)
     AND NOT c.relrowsecurity;
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'trust_ledgers post-check: RLS off on %', bad; END IF;

  SELECT string_agg(tgrelid::regclass || '.' || tgname, ', ') INTO bad
    FROM pg_trigger
   WHERE tgname IN ('daily_briefings_no_silent_edit', 'corrections_guard', 'corrections_no_truncate', 'forecast_ledger_chain',
                    'forecast_ledger_append_only', 'forecast_resolutions_append_only', 'posture_evidence_append_only',
                    'market_reads_append_only', 'operator_rulings_append_only')
     AND tgenabled <> 'A';
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'trust_ledgers post-check: guard triggers not ENABLE ALWAYS: %', bad; END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%\_append\_only' AND tgenabled = 'A'
        AND tgrelid IN ('public.forecast_ledger'::regclass, 'public.forecast_resolutions'::regclass, 'public.posture_evidence'::regclass,
                        'public.market_reads'::regclass, 'public.operator_rulings'::regclass)) <> 5 THEN
    RAISE EXCEPTION 'trust_ledgers post-check: expected 5 append-only triggers';
  END IF;
END $post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
