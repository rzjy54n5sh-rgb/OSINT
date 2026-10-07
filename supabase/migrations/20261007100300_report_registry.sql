-- Migration 20261007100300: report_registry — dynamic report types, provenance, EN/AR documents
--
-- NOT APPLIED by the author. Architect deliverable (Wave 1, W3). Depends on 20261007100000
-- (reject_mutation(), jsonb_nonempty(), url_host()) and production daily_briefings, admin_users.
--
-- OPERATOR RULINGS ENCODED HERE (2026-10-06, binding)
--   * Report TYPES are dynamic: a new theatre (e.g. Yemen/Red Sea, Horn of Africa) is proposed
--     as a candidate type when its activation rule crosses a threshold; the operator activates
--     it; dormant types pause automatically (pause_rule) and resume when the rule is met again;
--     retirement is operator-only. Types are never deleted.
--   * Backfill depth (D1): daily General brief + WEEKLY country/eschatology/business
--     (report_types.backfill_cadence). A weekly issue is one daily_briefings row on its last
--     day with period_start_day..period_end_day.
--   * Every report carries provenance contemporaneous|reconstructed; quality accepts those two
--     values in addition to the existing 'full' / 'auto' / 'retrospective'.
--   * EN/AR documents downloadable from Supabase Storage (private bucket 'reports', free 1 GB),
--     one row per stored file with checksum; never deleted, superseded by new versions.
--
-- NEVER BREAK EXISTING READS: daily_briefings only GAINS columns (provenance, period_*), CHECKs
-- that every existing row satisfies (verified on production 2026-10-06: 0 duplicate (day,type),
-- quality values {full, retrospective}), and an FK to report_types seeded with the 5 existing types.
-- Existing writers keep working: provenance is filled by trigger when a writer omits it.

SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Rule validator (activation / pause rules are data, evaluated by the deterministic job)
-- ---------------------------------------------------------------------------
--  {"metric":"always"}                                             (activation only)
--  {"metric":"stories"|"articles"|"independent_outlets",
--   "scope":{"topic_slugs":[..]} | {"country_codes":[..]},
--   "window_days":1..60, "consecutive_windows":>=1,
--   "min_value": >0   (activation)   |   "max_value": >=0   (pause)}
CREATE OR REPLACE FUNCTION public.report_rule_valid(rule jsonb, kind text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT coalesce(
    jsonb_typeof(rule) = 'object' AND (
      (kind = 'activation' AND rule ->> 'metric' = 'always' AND rule = '{"metric":"always"}'::jsonb)
      OR (
            rule ->> 'metric' IN ('stories', 'articles', 'independent_outlets')
        AND jsonb_typeof(rule -> 'scope') = 'object'
        AND (   (jsonb_typeof(rule #> '{scope,topic_slugs}') = 'array' AND jsonb_array_length(rule #> '{scope,topic_slugs}') >= 1)
             OR (jsonb_typeof(rule #> '{scope,country_codes}') = 'array' AND jsonb_array_length(rule #> '{scope,country_codes}') >= 1))
        AND jsonb_typeof(rule -> 'window_days') = 'number' AND (rule ->> 'window_days')::numeric BETWEEN 1 AND 60
        AND jsonb_typeof(rule -> 'consecutive_windows') = 'number' AND (rule ->> 'consecutive_windows')::numeric >= 1
        AND CASE kind
              WHEN 'activation' THEN jsonb_typeof(rule -> 'min_value') = 'number' AND (rule ->> 'min_value')::numeric > 0
              WHEN 'pause'      THEN jsonb_typeof(rule -> 'max_value') = 'number' AND (rule ->> 'max_value')::numeric >= 0
              ELSE false END)
    ), false)
$$;

-- ---------------------------------------------------------------------------
-- 2. report_types — the registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_types (
  code               text PRIMARY KEY,
  name_en            text NOT NULL,
  name_ar            text,
  scope              text NOT NULL,
  country_code       text,
  topic_slug         text,
  cadence            text NOT NULL,
  backfill_cadence   text NOT NULL,
  status             text NOT NULL,
  origin             text NOT NULL,
  activation_rule    jsonb NOT NULL,
  pause_rule         jsonb,
  proposal_evidence  jsonb,
  display_order      integer NOT NULL DEFAULT 100,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_types_code_chk      CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT report_types_scope_chk     CHECK (scope IN ('general', 'country', 'theatre', 'thematic')),
  CONSTRAINT report_types_country_chk   CHECK ((scope = 'country') = (country_code IS NOT NULL)
                                           AND (country_code IS NULL OR country_code ~ '^[A-Z]{2}$')),
  CONSTRAINT report_types_theatre_chk   CHECK (scope <> 'theatre' OR topic_slug IS NOT NULL),
  CONSTRAINT report_types_cadence_chk   CHECK (cadence IN ('daily', 'weekly')),
  CONSTRAINT report_types_backfill_chk  CHECK (backfill_cadence IN ('daily', 'weekly', 'none')),
  CONSTRAINT report_types_status_chk    CHECK (status IN ('candidate', 'active', 'paused', 'retired', 'rejected')),
  CONSTRAINT report_types_origin_chk    CHECK (origin IN ('legacy_fixed', 'threshold', 'operator')),
  CONSTRAINT report_types_activation    CHECK (public.report_rule_valid(activation_rule, 'activation')),
  CONSTRAINT report_types_pause         CHECK (pause_rule IS NULL OR public.report_rule_valid(pause_rule, 'pause')),
  -- a threshold-proposed type must carry the metrics that crossed the threshold
  CONSTRAINT report_types_evidence      CHECK (origin <> 'threshold' OR public.jsonb_nonempty(proposal_evidence))
);
COMMENT ON TABLE public.report_types IS
  'Report-type registry. daily_briefings.report_type references code. Status changes only via report_type_transition(). Dormant types pause (pause_rule), never deleted.';
COMMENT ON COLUMN public.report_types.topic_slug IS 'Theatre types: the topics.slug whose activity drives activation (FK added by 20261007100400_stories).';

DROP TRIGGER IF EXISTS report_types_updated_at ON public.report_types;
CREATE TRIGGER report_types_updated_at BEFORE UPDATE ON public.report_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE OR REPLACE FUNCTION public.report_types_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'report_types rows are never deleted (retire instead)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'candidate' AND current_setting('app.lifecycle_txn', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'new report types start as candidate (operator activates)' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.status, NEW.code, NEW.origin) IS DISTINCT FROM (OLD.status, OLD.code, OLD.origin)
     AND current_setting('app.lifecycle_txn', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'report type status changes only via report_type_transition()' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_types_guard ON public.report_types;
CREATE TRIGGER report_types_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_types
  FOR EACH ROW EXECUTE FUNCTION public.report_types_guard();

-- ---------------------------------------------------------------------------
-- 3. report_type_events — append-only status history
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.report_type_events (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  report_type   text NOT NULL REFERENCES public.report_types(code),
  conflict_day  integer NOT NULL,
  from_status   text,
  to_status     text NOT NULL,
  actor_kind    text NOT NULL,
  actor         text NOT NULL,
  admin_id      uuid REFERENCES public.admin_users(id),
  reason        text NOT NULL,
  evidence      jsonb NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rte_status_chk     CHECK (to_status IN ('candidate', 'active', 'paused', 'retired', 'rejected')),
  CONSTRAINT rte_actor_chk      CHECK (actor_kind IN ('migration', 'job', 'operator')),
  CONSTRAINT rte_operator_admin CHECK (actor_kind <> 'operator' OR admin_id IS NOT NULL),
  CONSTRAINT rte_op_only        CHECK (to_status NOT IN ('retired', 'rejected') OR actor_kind = 'operator'),
  -- coalesce(..., false) / IS NOT DISTINCT FROM: a CHECK that evaluates to NULL passes.
  CONSTRAINT rte_activation_op  CHECK (NOT (from_status IS NOT DISTINCT FROM 'candidate' AND to_status = 'active') OR actor_kind = 'operator'),
  CONSTRAINT rte_reason_len     CHECK (length(btrim(reason)) >= 5),
  CONSTRAINT rte_evidence       CHECK (public.jsonb_nonempty(evidence))
);
CREATE INDEX IF NOT EXISTS idx_rte_type ON public.report_type_events (report_type, id);
DROP TRIGGER IF EXISTS rte_immutable ON public.report_type_events;
CREATE TRIGGER rte_immutable BEFORE UPDATE OR DELETE ON public.report_type_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

-- ---------------------------------------------------------------------------
-- 4. Lifecycle functions
-- ---------------------------------------------------------------------------
-- Allowed: candidate->active (operator) | candidate->rejected (operator) | active->paused (job/operator)
--          paused->active (job/operator; job only for a type the operator activated before)
--          active|paused->retired (operator). retired/rejected are terminal.
CREATE OR REPLACE FUNCTION public.report_type_transition(
  p_code text, p_to_status text, p_actor_kind text, p_actor text, p_admin_id uuid,
  p_reason text, p_evidence jsonb, p_as_of_day integer)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_from text;
BEGIN
  SELECT status INTO v_from FROM public.report_types WHERE code = p_code FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'report type % not found', p_code; END IF;
  IF p_actor_kind NOT IN ('job', 'operator') THEN RAISE EXCEPTION 'actor_kind must be job or operator'; END IF;
  IF p_actor_kind = 'operator' AND (p_admin_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.admin_users a WHERE a.id = p_admin_id AND a.is_active)) THEN
    RAISE EXCEPTION 'operator transitions need an active admin_users id';
  END IF;
  IF NOT ((v_from = 'candidate' AND p_to_status IN ('active', 'rejected') AND p_actor_kind = 'operator')
       OR (v_from = 'active'    AND p_to_status = 'paused')
       OR (v_from = 'paused'    AND p_to_status = 'active')
       OR (v_from IN ('active', 'paused') AND p_to_status = 'retired' AND p_actor_kind = 'operator')) THEN
    RAISE EXCEPTION 'report type %: transition % -> % by % is not allowed', p_code, v_from, p_to_status, p_actor_kind;
  END IF;
  PERFORM set_config('app.lifecycle_txn', 'on', true);
  UPDATE public.report_types SET status = p_to_status WHERE code = p_code;
  PERFORM set_config('app.lifecycle_txn', 'off', true);
  INSERT INTO public.report_type_events (report_type, conflict_day, from_status, to_status, actor_kind, actor, admin_id, reason, evidence)
  VALUES (p_code, p_as_of_day, v_from, p_to_status, p_actor_kind, p_actor, p_admin_id, p_reason, p_evidence);
END $$;

-- The job proposes a new theatre/thematic type when its activation rule crossed (status candidate).
CREATE OR REPLACE FUNCTION public.report_type_propose(
  p_code text, p_name_en text, p_scope text, p_country_code text, p_topic_slug text,
  p_cadence text, p_activation_rule jsonb, p_pause_rule jsonb, p_evidence jsonb, p_actor text, p_as_of_day integer)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  INSERT INTO public.report_types (code, name_en, scope, country_code, topic_slug, cadence, backfill_cadence, status,
                                   origin, activation_rule, pause_rule, proposal_evidence)
  VALUES (p_code, p_name_en, p_scope, p_country_code, p_topic_slug, p_cadence, 'none', 'candidate',
          'threshold', p_activation_rule, p_pause_rule, p_evidence);
  INSERT INTO public.report_type_events (report_type, conflict_day, from_status, to_status, actor_kind, actor, reason, evidence)
  VALUES (p_code, p_as_of_day, NULL, 'candidate', 'job', p_actor, 'Activation rule crossed; proposed for operator review', p_evidence);
END $$;

-- ---------------------------------------------------------------------------
-- 5. Seed the five existing types (values already used by daily_briefings.report_type)
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM set_config('app.lifecycle_txn', 'on', true); END $$;
INSERT INTO public.report_types (code, name_en, scope, country_code, cadence, backfill_cadence, status, origin, activation_rule, display_order) VALUES
  ('general',     'General Intelligence Brief',         'general',  NULL, 'daily', 'daily',  'active', 'legacy_fixed', '{"metric":"always"}', 10),
  ('egypt',       'Egypt Country Brief',                'country',  'EG', 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', 20),
  ('uae',         'UAE Country Brief',                  'country',  'AE', 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', 30),
  ('eschatology', 'Eschatology and Geopolitics Brief',  'thematic', NULL, 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', 40),
  ('business',    'Business Opportunities Brief',       'thematic', NULL, 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', 50)
ON CONFLICT (code) DO NOTHING;
DO $$ BEGIN PERFORM set_config('app.lifecycle_txn', 'off', true); END $$;

INSERT INTO public.report_type_events (report_type, conflict_day, from_status, to_status, actor_kind, actor, reason, evidence)
SELECT rt.code, coalesce((SELECT min(conflict_day) FROM public.daily_briefings b WHERE b.report_type = rt.code), 1),
       NULL, 'active', 'migration', '20261007100300_report_registry', 'Existing report type carried over',
       jsonb_build_array(jsonb_build_object('kind', 'legacy_table', 'table', 'public.daily_briefings', 'report_type', rt.code))
  FROM public.report_types rt
 WHERE rt.origin = 'legacy_fixed'
   AND NOT EXISTS (SELECT 1 FROM public.report_type_events e WHERE e.report_type = rt.code);

-- Abort if production holds a report_type the seed does not cover (FK below would fail anyway).
DO $$
DECLARE v text;
BEGIN
  SELECT string_agg(DISTINCT b.report_type, ',') INTO v FROM public.daily_briefings b
   WHERE NOT EXISTS (SELECT 1 FROM public.report_types t WHERE t.code = b.report_type);
  IF v IS NOT NULL THEN RAISE EXCEPTION 'daily_briefings has unregistered report_type(s): %', v; END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6. daily_briefings: additive columns + constraints (existing reads unaffected)
-- ---------------------------------------------------------------------------
ALTER TABLE public.daily_briefings ADD COLUMN IF NOT EXISTS provenance text;
ALTER TABLE public.daily_briefings ADD COLUMN IF NOT EXISTS period_start_day integer;
ALTER TABLE public.daily_briefings ADD COLUMN IF NOT EXISTS period_end_day integer;
-- Arabic edition (written by the Claude scheduled task; no metered translation API). NULL = no AR edition yet.
ALTER TABLE public.daily_briefings ADD COLUMN IF NOT EXISTS title_ar text;
ALTER TABLE public.daily_briefings ADD COLUMN IF NOT EXISTS lead_ar text;
ALTER TABLE public.daily_briefings ADD COLUMN IF NOT EXISTS sections_ar jsonb;
COMMENT ON COLUMN public.daily_briefings.sections_ar IS 'Arabic edition, same structure as sections. The AR document is rendered only from this (never machine-translated at render time).';
COMMENT ON COLUMN public.daily_briefings.provenance IS
  'contemporaneous = first written by 06:00 UTC on the day after conflict_day; reconstructed = later. Existing rows: from generated_at. New rows: from the insert time (trigger), never from a writer-supplied timestamp.';
COMMENT ON COLUMN public.daily_briefings.period_start_day IS 'Weekly issues: first conflict day covered (conflict_day = period_end_day). NULL for a single-day brief.';

-- Existing rows: evidence-based rule on generated_at (prod 2026-10-06: 75 contemporaneous, 126 reconstructed).
UPDATE public.daily_briefings
   SET provenance = public.provenance_for(conflict_day, generated_at)
 WHERE provenance IS NULL;

CREATE OR REPLACE FUNCTION public.daily_briefings_provenance()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_by_clock text;
BEGIN
  v_by_clock := public.provenance_for(NEW.conflict_day, now());
  -- a writer using the new quality vocabulary states provenance through it
  IF NEW.provenance IS NULL AND NEW.quality IN ('contemporaneous', 'reconstructed') THEN
    NEW.provenance := NEW.quality;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.provenance IS NULL THEN
      NEW.provenance := v_by_clock;
    ELSIF NEW.provenance = 'contemporaneous' AND v_by_clock = 'reconstructed' THEN
      RAISE EXCEPTION 'Day % brief written after its day cannot be labelled contemporaneous', NEW.conflict_day;
    END IF;
  ELSE
    IF NEW.provenance IS NULL THEN NEW.provenance := OLD.provenance; END IF;
    IF OLD.provenance = 'reconstructed' AND NEW.provenance = 'contemporaneous' THEN
      RAISE EXCEPTION 'a reconstructed brief cannot be relabelled contemporaneous';
    END IF;
    IF NEW.conflict_day <> OLD.conflict_day AND NEW.provenance = 'contemporaneous' AND v_by_clock = 'reconstructed' THEN
      RAISE EXCEPTION 'moving a brief to another day makes it reconstructed';
    END IF;
  END IF;
  -- keep the new quality vocabulary consistent with provenance
  IF NEW.quality IN ('contemporaneous', 'reconstructed') AND NEW.quality <> NEW.provenance THEN
    RAISE EXCEPTION 'quality % contradicts provenance %', NEW.quality, NEW.provenance;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS daily_briefings_provenance ON public.daily_briefings;
CREATE TRIGGER daily_briefings_provenance BEFORE INSERT OR UPDATE ON public.daily_briefings
  FOR EACH ROW EXECUTE FUNCTION public.daily_briefings_provenance();

ALTER TABLE public.daily_briefings ALTER COLUMN provenance SET NOT NULL;

ALTER TABLE public.daily_briefings DROP CONSTRAINT IF EXISTS daily_briefings_provenance_chk;
ALTER TABLE public.daily_briefings ADD CONSTRAINT daily_briefings_provenance_chk
  CHECK (provenance IN ('contemporaneous', 'reconstructed'));
ALTER TABLE public.daily_briefings DROP CONSTRAINT IF EXISTS daily_briefings_quality_chk;
ALTER TABLE public.daily_briefings ADD CONSTRAINT daily_briefings_quality_chk
  CHECK (quality IN ('full', 'auto', 'retrospective', 'contemporaneous', 'reconstructed')) NOT VALID;
ALTER TABLE public.daily_briefings VALIDATE CONSTRAINT daily_briefings_quality_chk;
ALTER TABLE public.daily_briefings DROP CONSTRAINT IF EXISTS daily_briefings_quality_provenance_chk;
ALTER TABLE public.daily_briefings ADD CONSTRAINT daily_briefings_quality_provenance_chk
  CHECK ((quality NOT IN ('contemporaneous', 'reconstructed') OR quality = provenance)
     AND (quality <> 'retrospective' OR provenance = 'reconstructed')) NOT VALID;
ALTER TABLE public.daily_briefings VALIDATE CONSTRAINT daily_briefings_quality_provenance_chk;
ALTER TABLE public.daily_briefings DROP CONSTRAINT IF EXISTS daily_briefings_period_chk;
ALTER TABLE public.daily_briefings ADD CONSTRAINT daily_briefings_period_chk
  CHECK (coalesce((period_start_day IS NULL AND period_end_day IS NULL)
      OR (period_end_day = conflict_day AND period_start_day >= 1 AND period_start_day <= period_end_day
          AND period_end_day - period_start_day <= 30), false));
ALTER TABLE public.daily_briefings DROP CONSTRAINT IF EXISTS daily_briefings_report_type_fkey;
ALTER TABLE public.daily_briefings ADD CONSTRAINT daily_briefings_report_type_fkey
  FOREIGN KEY (report_type) REFERENCES public.report_types(code) NOT VALID;
ALTER TABLE public.daily_briefings VALIDATE CONSTRAINT daily_briefings_report_type_fkey;

-- One issue per type per day regardless of country_code (the existing UNIQUE treats NULLs as
-- distinct, so (day,'egypt','EG') and (day,'egypt',NULL) could both exist). 0 violations on prod.
CREATE UNIQUE INDEX IF NOT EXISTS daily_briefings_day_type_uniq ON public.daily_briefings (conflict_day, report_type);
CREATE INDEX IF NOT EXISTS idx_briefings_type_day ON public.daily_briefings (report_type, conflict_day DESC);

-- ---------------------------------------------------------------------------
-- 7. report_documents — stored EN/AR files (Supabase Storage, private bucket 'reports')
-- ---------------------------------------------------------------------------
-- Path contract (deterministic, one folder per brief):
--   briefings/d{conflict_day:03d}/{report_type}/{briefing_id}/{lang}/v{version}.{format}
CREATE TABLE IF NOT EXISTS public.report_documents (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  briefing_id        uuid NOT NULL REFERENCES public.daily_briefings(id) ON DELETE RESTRICT,
  lang               text NOT NULL,
  format             text NOT NULL,
  version            integer NOT NULL,
  storage_bucket     text NOT NULL DEFAULT 'reports',
  storage_path       text NOT NULL UNIQUE,
  mime_type          text NOT NULL,
  bytes              bigint NOT NULL,
  sha256             text NOT NULL,
  source_updated_at  timestamptz NOT NULL,
  generator          text NOT NULL,
  validation         jsonb NOT NULL,
  is_current         boolean NOT NULL DEFAULT true,
  superseded_by      uuid REFERENCES public.report_documents(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT report_documents_lang_chk    CHECK (lang IN ('en', 'ar')),
  CONSTRAINT report_documents_format_chk  CHECK (format IN ('docx', 'pdf')),
  CONSTRAINT report_documents_mime_chk    CHECK ((format = 'docx' AND mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
                                            OR (format = 'pdf'  AND mime_type = 'application/pdf')),
  CONSTRAINT report_documents_bucket_chk  CHECK (storage_bucket = 'reports'),
  CONSTRAINT report_documents_path_chk    CHECK (storage_path ~ '^briefings/d[0-9]{3}/[a-z][a-z0-9_]{1,31}/[0-9a-f-]{36}/(en|ar)/v[0-9]+\.(docx|pdf)$'
                                            AND storage_path LIKE '%/' || lang || '/v' || version || '.' || format
                                            AND storage_path LIKE '%/' || briefing_id::text || '/%'),
  CONSTRAINT report_documents_version_chk CHECK (version >= 1),
  CONSTRAINT report_documents_bytes_chk   CHECK (bytes > 0 AND bytes <= 20971520),
  CONSTRAINT report_documents_sha_chk     CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT report_documents_gen_chk     CHECK (length(btrim(generator)) > 0),
  -- only validated files are registered; Arabic must have passed the RTL check
  CONSTRAINT report_documents_valid_chk   CHECK (jsonb_typeof(validation) = 'object' AND coalesce(validation ->> 'ok', '') = 'true'
                                            AND length(btrim(coalesce(validation ->> 'validator', ''))) > 0),
  CONSTRAINT report_documents_rtl_chk     CHECK (lang <> 'ar' OR coalesce(validation ->> 'rtl', '') = 'true'),
  CONSTRAINT report_documents_superseded  CHECK (is_current OR superseded_by IS NOT NULL),
  CONSTRAINT report_documents_key UNIQUE (briefing_id, lang, format, version)
);
COMMENT ON TABLE public.report_documents IS
  'Downloadable EN/AR renderings of daily_briefings rows. Rows never deleted; a re-render inserts version+1 and supersedes the previous one. Stale = source_updated_at < daily_briefings.updated_at.';
CREATE UNIQUE INDEX IF NOT EXISTS report_documents_one_current ON public.report_documents (briefing_id, lang, format) WHERE is_current;

-- Path must match the brief's own day and type; rows immutable except supersession.
CREATE OR REPLACE FUNCTION public.report_documents_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE b record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'report_documents rows are never deleted (supersede instead)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'is_current' - 'superseded_by') IS DISTINCT FROM (to_jsonb(OLD) - 'is_current' - 'superseded_by')
       OR (OLD.is_current = false AND NEW.is_current = true) THEN
      RAISE EXCEPTION 'report_documents is immutable except supersession' USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  SELECT conflict_day, report_type, sections_ar INTO b FROM public.daily_briefings WHERE id = NEW.briefing_id;
  IF NEW.lang = 'ar' AND b.sections_ar IS NULL THEN
    RAISE EXCEPTION 'brief % has no Arabic edition (sections_ar); an AR document cannot be registered', NEW.briefing_id;
  END IF;
  IF NEW.storage_path NOT LIKE format('briefings/d%s/%s/%s/', lpad(b.conflict_day::text, 3, '0'), b.report_type, NEW.briefing_id) || '%' THEN
    RAISE EXCEPTION 'storage_path % does not match brief day % / type %', NEW.storage_path, b.conflict_day, b.report_type;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS report_documents_guard ON public.report_documents;
CREATE TRIGGER report_documents_guard BEFORE INSERT OR UPDATE OR DELETE ON public.report_documents
  FOR EACH ROW EXECUTE FUNCTION public.report_documents_guard();

-- Catalog for the admin Reports page and public archive (<= 3 clicks to any brief).
CREATE OR REPLACE VIEW public.v_briefing_catalog
WITH (security_invoker = true) AS
SELECT b.id AS briefing_id, b.conflict_day, (date '2026-02-28' + b.conflict_day - 1) AS calendar_date,
       b.report_type, rt.name_en AS report_name, rt.scope, rt.status AS type_status,
       b.period_start_day, b.period_end_day, b.provenance, b.quality, b.source, b.title, b.title_ar,
       (b.sections_ar IS NOT NULL) AS has_arabic_edition,
       b.generated_at, b.updated_at,
       (SELECT jsonb_object_agg(d.lang || '_' || d.format,
                                jsonb_build_object('document_id', d.id, 'version', d.version, 'bytes', d.bytes,
                                                   'stale', d.source_updated_at < b.updated_at))
          FROM public.report_documents d WHERE d.briefing_id = b.id AND d.is_current) AS documents
  FROM public.daily_briefings b
  JOIN public.report_types rt ON rt.code = b.report_type;

CREATE OR REPLACE VIEW public.v_report_documents_needed
WITH (security_invoker = true) AS
SELECT b.id AS briefing_id, b.conflict_day, b.report_type, l.lang, f.format,
       d.id AS current_document_id, d.version AS current_version,
       CASE WHEN d.id IS NULL THEN 'missing' ELSE 'stale' END AS reason
  FROM public.daily_briefings b
 CROSS JOIN (VALUES ('en'), ('ar')) l(lang)
 CROSS JOIN (VALUES ('docx'), ('pdf')) f(format)
  LEFT JOIN public.report_documents d
         ON d.briefing_id = b.id AND d.lang = l.lang AND d.format = f.format AND d.is_current
 WHERE (l.lang = 'en' OR b.sections_ar IS NOT NULL)
   AND (d.id IS NULL OR d.source_updated_at < b.updated_at);
COMMENT ON VIEW public.v_report_documents_needed IS 'Work queue for the document renderer: (brief, lang, format) with no current or a stale document. AR rows appear only once the brief has an Arabic edition.';

-- ---------------------------------------------------------------------------
-- 8. Storage bucket (private; downloads via short-lived signed URLs minted server-side)
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('reports', 'reports', false, 20971520,
        ARRAY['application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;
-- No storage.objects policy for anon/authenticated on bucket 'reports': only service_role
-- (bypasses RLS) uploads and signs URLs. Add a read policy here only if the operator rules
-- that downloads are public (open question in the ADR).

-- ---------------------------------------------------------------------------
-- 9. RLS + privileges
-- ---------------------------------------------------------------------------
ALTER TABLE public.report_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_type_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_documents   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS report_types_service_all ON public.report_types;
CREATE POLICY report_types_service_all ON public.report_types FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS report_types_public_read ON public.report_types;
CREATE POLICY report_types_public_read ON public.report_types FOR SELECT TO anon, authenticated
  USING (status IN ('active', 'paused', 'retired'));

DROP POLICY IF EXISTS report_type_events_service_all ON public.report_type_events;
CREATE POLICY report_type_events_service_all ON public.report_type_events FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS report_documents_service_all ON public.report_documents;
CREATE POLICY report_documents_service_all ON public.report_documents FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS report_documents_public_read ON public.report_documents;
CREATE POLICY report_documents_public_read ON public.report_documents FOR SELECT TO anon, authenticated USING (true);

REVOKE ALL ON public.report_types, public.report_type_events, public.report_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.report_types, public.report_documents TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.report_types, public.report_type_events, public.report_documents TO service_role;
REVOKE DELETE, TRUNCATE ON public.report_types, public.report_type_events, public.report_documents FROM service_role;

REVOKE ALL ON public.v_briefing_catalog, public.v_report_documents_needed FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_briefing_catalog TO anon, authenticated, service_role;
GRANT SELECT ON public.v_report_documents_needed TO service_role;

-- daily_briefings: anon SELECT stays (existing policy anon_read_briefings); write privileges removed.
-- FLAGGED FIX (lead decides): production's only read policy on daily_briefings is TO anon, while the
-- site reads briefings with @supabase/ssr createBrowserClient (hooks/useBriefing.ts), which sends the
-- signed-in user's JWT -> role authenticated -> RLS returns ZERO briefings to logged-in users.
-- Additive, read-only; delete this statement if tier gating of briefings is intended.
DROP POLICY IF EXISTS daily_briefings_authenticated_read ON public.daily_briefings;
CREATE POLICY daily_briefings_authenticated_read ON public.daily_briefings FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.daily_briefings TO authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.daily_briefings FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.report_type_transition(text, text, text, text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.report_type_propose(text, text, text, text, text, text, jsonb, jsonb, jsonb, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.report_type_transition(text, text, text, text, uuid, text, jsonb, integer),
                          public.report_type_propose(text, text, text, text, text, text, jsonb, jsonb, jsonb, text, integer)
  TO service_role;

COMMIT;
