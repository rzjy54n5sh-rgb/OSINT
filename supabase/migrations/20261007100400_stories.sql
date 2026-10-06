-- Migration 20261007100400: stories — live intelligence layer (stories, topics, alerts)
--
-- NOT APPLIED by the author. Architect deliverable (Wave 1, W4). Depends on 20261007100000
-- (reject_mutation, jsonb_nonempty, url_host, scenario_markets), 20261007100300 (report_types)
-- and production articles, article_sources, detected_scenarios, platform_alerts, admin_users.
--
-- OPERATOR RULINGS ENCODED HERE (2026-10-06, binding)
--   * Articles cluster into STORIES (same event across outlets): first_seen, outlets, party vs
--     independent mix, language mix; GEOLOCATION ONLY WHEN STATED — a story location must quote
--     the article text that states it (checked against the article's title/summary).
--   * Story titles are the verbatim headline of a member article (no invented headlines).
--   * Topics emerge and fade (status per day in topic_daily); threshold events raise alerts,
--     which may be promoted to a detected_scenarios candidate (scenario birth path) or a banner.
--   * Retention-safe: no row in these tables is ever deleted; clustered articles cannot be
--     deleted either (FK ON DELETE RESTRICT). Merges are recorded, never destructive.
--   * Free tier / no metered AI: clustering, topic status and alert rules run in a deterministic
--     GitHub Action; nothing here calls a model.
-- NEVER use articles.lat/lng for story geolocation: those are per-outlet HQ constants (DB audit #13).

SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intel_lang_valid(l text)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT l IN ('en','ar','fa','he','fr','de','ru','tr','es','zh','ur','hi','other','unknown')
$$;

-- Alert / candidate evidence: non-empty array of {url http(s), outlet, published_at, party_status}.
CREATE OR REPLACE FUNCTION public.intel_evidence_valid(ev jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT jsonb_typeof(ev) = 'array' AND jsonb_array_length(ev) >= 1
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(ev) x(el)
        WHERE NOT coalesce((jsonb_typeof(x.el) = 'object'
          AND (x.el ->> 'url') ~* '^https?://[^[:space:]]+$'
          AND length(btrim(coalesce(x.el ->> 'outlet', ''))) > 0
          AND length(btrim(coalesce(x.el ->> 'published_at', ''))) > 0
          AND (x.el ->> 'party_status') IN ('party', 'state_aligned', 'independent', 'unknown')), false))
$$;

-- Distinct hosts among independent evidence items.
CREATE OR REPLACE FUNCTION public.intel_independent_hosts(ev jsonb)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT count(DISTINCT public.url_host(x.el ->> 'url'))::integer
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ev) = 'array' THEN ev ELSE '[]'::jsonb END) x(el)
   WHERE x.el ->> 'party_status' = 'independent'
$$;

-- Topic definition: {"any_terms":[..>=1 strings], "all_terms":[..]?, "none_terms":[..]?} (case-insensitive,
-- word-boundary match on title+summary; multilingual terms allowed). Deterministic, no model.
CREATE OR REPLACE FUNCTION public.topic_definition_valid(def jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT coalesce(jsonb_typeof(def) = 'object'
     AND jsonb_typeof(def -> 'any_terms') = 'array' AND jsonb_array_length(def -> 'any_terms') >= 1
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(def -> 'any_terms') t(v)
                      WHERE jsonb_typeof(t.v) <> 'string' OR length(btrim(t.v #>> '{}')) < 2)
     AND (def -> 'all_terms' IS NULL OR jsonb_typeof(def -> 'all_terms') = 'array')
     AND (def -> 'none_terms' IS NULL OR jsonb_typeof(def -> 'none_terms') = 'array'), false)
$$;

-- conflict day of a timestamp (DAY LOCK: 2026-02-28 = Day 1, UTC)
CREATE OR REPLACE FUNCTION public.conflict_day_of(ts timestamptz)
RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT ((ts AT TIME ZONE 'UTC')::date - date '2026-02-28') + 1
$$;

-- ---------------------------------------------------------------------------
-- 1. outlets + outlet_aliases — who published (party vs independent, language)
-- ---------------------------------------------------------------------------
-- articles.source_name matches article_sources.display_name for only 102/584 production rows
-- (2026-10-06), so story mix needs its own outlet registry. Classification must cite its basis
-- (DECISION-002 tiers, article_sources.is_party_source, or a URL); default is 'unknown', never guessed.
CREATE TABLE IF NOT EXISTS public.outlets (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                  text NOT NULL UNIQUE,
  lang                  text NOT NULL,
  country_code          text,
  party_status          text NOT NULL DEFAULT 'unknown',
  party_affiliation     text,
  source_tier           smallint,
  classification_basis  text NOT NULL,
  article_source_id     uuid REFERENCES public.article_sources(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT outlets_lang_chk     CHECK (public.intel_lang_valid(lang)),
  CONSTRAINT outlets_country_chk  CHECK (country_code IS NULL OR country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT outlets_party_chk    CHECK (party_status IN ('party', 'state_aligned', 'independent', 'unknown')),
  CONSTRAINT outlets_affil_chk    CHECK (party_status NOT IN ('party', 'state_aligned') OR length(btrim(coalesce(party_affiliation, ''))) > 0),
  CONSTRAINT outlets_tier_chk     CHECK (source_tier IS NULL OR source_tier BETWEEN 1 AND 3),
  CONSTRAINT outlets_basis_chk    CHECK (length(btrim(classification_basis)) >= 3)
);
COMMENT ON TABLE public.outlets IS 'Outlet registry for story mix. party = belligerent party/military outlet; state_aligned = state media of a party/aligned state (DECISION-002 Tier 3); independent; unknown (default).';
DROP TRIGGER IF EXISTS outlets_updated_at ON public.outlets;
CREATE TRIGGER outlets_updated_at BEFORE UPDATE ON public.outlets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.outlet_aliases (
  alias_kind  text NOT NULL,
  alias       text NOT NULL,
  outlet_id   uuid NOT NULL REFERENCES public.outlets(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (alias_kind, alias),
  CONSTRAINT outlet_aliases_kind_chk CHECK (alias_kind IN ('source_name', 'host')),
  CONSTRAINT outlet_aliases_host_chk CHECK (alias_kind <> 'host' OR alias ~ '^[a-z0-9.-]+$')
);
COMMENT ON TABLE public.outlet_aliases IS 'Exact articles.source_name strings and URL hosts (no www.) that resolve to an outlet.';

-- ---------------------------------------------------------------------------
-- 2. topics + topic_daily — topics emerge, become active, fade, go dormant
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.topics (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug              text NOT NULL UNIQUE,
  label_en          text NOT NULL,
  label_ar          text,
  kind              text NOT NULL,
  definition        jsonb NOT NULL,
  country_codes     text[] NOT NULL DEFAULT '{}',
  status            text NOT NULL DEFAULT 'emerging',
  origin            text NOT NULL,
  first_seen_day    integer,
  last_active_day   integer,
  status_since_day  integer,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT topics_slug_chk    CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,47}$'),
  CONSTRAINT topics_kind_chk    CHECK (kind IN ('theatre', 'country', 'actor', 'instrument', 'thematic', 'event')),
  CONSTRAINT topics_def_chk     CHECK (public.topic_definition_valid(definition)),
  CONSTRAINT topics_status_chk  CHECK (status IN ('emerging', 'active', 'fading', 'dormant')),
  CONSTRAINT topics_origin_chk  CHECK (origin IN ('operator', 'claude_task', 'burst_detector')),
  CONSTRAINT topics_days_chk    CHECK (coalesce((first_seen_day IS NULL OR first_seen_day >= 1)
                                   AND (last_active_day IS NULL OR last_active_day >= first_seen_day), false))
);
COMMENT ON TABLE public.topics IS 'Topic = deterministic term definition. status is recomputed daily by the job from topic_daily (rule version stored there); history = topic_daily.status per day.';
DROP TRIGGER IF EXISTS topics_updated_at ON public.topics;
CREATE TRIGGER topics_updated_at BEFORE UPDATE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TABLE IF NOT EXISTS public.topic_daily (
  topic_id                  uuid NOT NULL REFERENCES public.topics(id),
  conflict_day              integer NOT NULL,
  story_count               integer NOT NULL,
  article_count             integer NOT NULL,
  outlet_count              integer NOT NULL,
  independent_outlet_count  integer NOT NULL,
  party_outlet_count        integer NOT NULL,
  lang_counts               jsonb NOT NULL DEFAULT '{}'::jsonb,
  status                    text NOT NULL,
  rule_version              text NOT NULL,
  computed_at               timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (topic_id, conflict_day),
  CONSTRAINT topic_daily_day_chk     CHECK (conflict_day >= 1),
  CONSTRAINT topic_daily_counts_chk  CHECK (story_count >= 0 AND article_count >= story_count AND outlet_count >= 0
                                        AND independent_outlet_count >= 0 AND party_outlet_count >= 0
                                        AND independent_outlet_count + party_outlet_count <= outlet_count),
  CONSTRAINT topic_daily_status_chk  CHECK (status IN ('emerging', 'active', 'fading', 'dormant')),
  CONSTRAINT topic_daily_lang_chk    CHECK (jsonb_typeof(lang_counts) = 'object')
);
CREATE INDEX IF NOT EXISTS idx_topic_daily_day ON public.topic_daily (conflict_day DESC);

-- Theatre report types are driven by a topic (FK deferred to here because topics is created here).
ALTER TABLE public.report_types DROP CONSTRAINT IF EXISTS report_types_topic_slug_fkey;
ALTER TABLE public.report_types ADD CONSTRAINT report_types_topic_slug_fkey
  FOREIGN KEY (topic_slug) REFERENCES public.topics(slug);

-- ---------------------------------------------------------------------------
-- 3. stories + story_articles
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stories (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cluster_key               text NOT NULL UNIQUE,
  cluster_method_version    text NOT NULL,
  title                     text NOT NULL,
  title_article_id          uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  first_seen_at             timestamptz NOT NULL,
  first_article_id          uuid NOT NULL REFERENCES public.articles(id) ON DELETE RESTRICT,
  first_outlet_name         text NOT NULL,
  last_seen_at              timestamptz NOT NULL,
  conflict_day_first        integer NOT NULL,
  conflict_day_last         integer NOT NULL,
  article_count             integer NOT NULL DEFAULT 1,
  outlet_count              integer NOT NULL DEFAULT 1,
  party_outlet_count        integer NOT NULL DEFAULT 0,
  independent_outlet_count  integer NOT NULL DEFAULT 0,
  unknown_outlet_count      integer NOT NULL DEFAULT 1,
  lang_counts               jsonb NOT NULL DEFAULT '{}'::jsonb,
  geo_lat                   double precision,
  geo_lng                   double precision,
  geo_place                 text,
  geo_article_id            uuid REFERENCES public.articles(id) ON DELETE RESTRICT,
  geo_quote                 text,
  status                    text NOT NULL DEFAULT 'developing',
  merged_into_story_id      uuid REFERENCES public.stories(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT stories_seen_chk     CHECK (last_seen_at >= first_seen_at AND conflict_day_last >= conflict_day_first),
  CONSTRAINT stories_counts_chk   CHECK (article_count >= 1 AND outlet_count >= 1 AND outlet_count <= article_count
                                     AND party_outlet_count >= 0 AND independent_outlet_count >= 0 AND unknown_outlet_count >= 0
                                     AND party_outlet_count + independent_outlet_count + unknown_outlet_count = outlet_count),
  CONSTRAINT stories_lang_chk     CHECK (jsonb_typeof(lang_counts) = 'object'),
  CONSTRAINT stories_status_chk   CHECK (status IN ('developing', 'active', 'cooling', 'closed', 'merged')),
  CONSTRAINT stories_merge_chk    CHECK ((status = 'merged') = (merged_into_story_id IS NOT NULL) AND merged_into_story_id IS DISTINCT FROM id),
  -- geolocation only when stated: all-or-nothing, with the stating article and the quoted words
  -- coalesce(..., false): a NULL CHECK result would pass, letting partial geolocation through.
  CONSTRAINT stories_geo_chk      CHECK (coalesce(
       (geo_lat IS NULL AND geo_lng IS NULL AND geo_place IS NULL AND geo_article_id IS NULL AND geo_quote IS NULL)
    OR (geo_lat BETWEEN -90 AND 90 AND geo_lng BETWEEN -180 AND 180
        AND length(btrim(coalesce(geo_place, ''))) > 0 AND geo_article_id IS NOT NULL
        AND length(btrim(coalesce(geo_quote, ''))) >= 3), false))
);
COMMENT ON TABLE public.stories IS
  'One real-world event across outlets. Counts/first/last/lang mix are DERIVED from story_articles by trigger (never hand-written). title = verbatim headline of title_article_id. geo_* only when an article states the place: geo_quote must occur in that article''s title/summary.';

CREATE INDEX IF NOT EXISTS idx_stories_last_seen ON public.stories (last_seen_at DESC) WHERE status <> 'merged';
CREATE INDEX IF NOT EXISTS idx_stories_day_last ON public.stories (conflict_day_last DESC);
CREATE INDEX IF NOT EXISTS idx_stories_first_seen ON public.stories (first_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.story_articles (
  article_id               uuid PRIMARY KEY REFERENCES public.articles(id) ON DELETE RESTRICT,
  story_id                 uuid NOT NULL REFERENCES public.stories(id),
  outlet_id                uuid REFERENCES public.outlets(id),
  outlet_name              text NOT NULL,
  lang                     text NOT NULL,
  lang_basis               text NOT NULL,
  party_status             text NOT NULL,
  published_at             timestamptz NOT NULL,
  similarity               numeric(5,4),
  is_seed                  boolean NOT NULL DEFAULT false,
  cluster_method_version   text NOT NULL,
  assigned_at              timestamptz NOT NULL DEFAULT now(),
  reassigned_from_story_id uuid REFERENCES public.stories(id),
  CONSTRAINT story_articles_lang_chk   CHECK (public.intel_lang_valid(lang)),
  CONSTRAINT story_articles_basis_chk  CHECK (lang_basis IN ('script_detect', 'outlet_registry', 'article_sources', 'unknown')
                                          AND (lang <> 'unknown') = (lang_basis <> 'unknown')),
  CONSTRAINT story_articles_party_chk  CHECK (party_status IN ('party', 'state_aligned', 'independent', 'unknown')
                                          AND (party_status = 'unknown' OR outlet_id IS NOT NULL)),
  CONSTRAINT story_articles_sim_chk    CHECK (similarity IS NULL OR similarity BETWEEN 0 AND 1),
  CONSTRAINT story_articles_seed_chk   CHECK (is_seed OR similarity IS NOT NULL)
);
COMMENT ON TABLE public.story_articles IS
  'Article -> story membership (one story per article). outlet/lang/party are SNAPSHOTS at clustering time so history does not shift when the outlet registry changes. A non-unknown party_status requires a registered outlet.';
CREATE INDEX IF NOT EXISTS idx_story_articles_story ON public.story_articles (story_id, published_at);

CREATE TABLE IF NOT EXISTS public.story_topics (
  story_id       uuid NOT NULL REFERENCES public.stories(id),
  topic_id       uuid NOT NULL REFERENCES public.topics(id),
  matched_by     text NOT NULL,
  matched_terms  text[] NOT NULL DEFAULT '{}',
  rule_version   text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (story_id, topic_id),
  CONSTRAINT story_topics_by_chk CHECK (matched_by IN ('rule', 'operator')
                                     AND (matched_by <> 'rule' OR cardinality(matched_terms) >= 1))
);
CREATE INDEX IF NOT EXISTS idx_story_topics_topic ON public.story_topics (topic_id, story_id);

-- stories: verbatim title, stated geolocation, no deletes.
CREATE OR REPLACE FUNCTION public.stories_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_text text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'stories are never deleted (close or merge instead)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT a.title INTO NEW.title FROM public.articles a WHERE a.id = NEW.title_article_id;
  IF NEW.geo_article_id IS NOT NULL THEN
    SELECT coalesce(a.title, '') || ' ' || coalesce(a.summary, '') INTO v_text FROM public.articles a WHERE a.id = NEW.geo_article_id;
    IF strpos(lower(v_text), lower(btrim(NEW.geo_quote))) = 0 THEN
      RAISE EXCEPTION 'geo_quote "%" does not occur in article % title/summary: location not stated', NEW.geo_quote, NEW.geo_article_id;
    END IF;
    IF TG_OP = 'INSERT' OR NEW.geo_article_id IS DISTINCT FROM OLD.geo_article_id THEN
      IF NOT EXISTS (SELECT 1 FROM public.story_articles sa WHERE sa.article_id = NEW.geo_article_id AND sa.story_id = NEW.id)
         AND NEW.geo_article_id <> NEW.first_article_id THEN
        RAISE EXCEPTION 'geo_article_id must be a member article of the story';
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stories_guard ON public.stories;
CREATE TRIGGER stories_guard BEFORE INSERT OR UPDATE OR DELETE ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.stories_guard();
DROP TRIGGER IF EXISTS stories_updated_at ON public.stories;
CREATE TRIGGER stories_updated_at BEFORE UPDATE ON public.stories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Derived aggregates: recomputed from story_articles whenever membership changes.
CREATE OR REPLACE FUNCTION public.story_refresh(p_story_id uuid)
RETURNS void LANGUAGE sql SET search_path = '' AS $$
  WITH m AS (
    SELECT sa.*, coalesce(sa.outlet_id::text, 'name:' || lower(sa.outlet_name)) AS outlet_key
      FROM public.story_articles sa WHERE sa.story_id = p_story_id
  ), per_outlet AS (
    SELECT DISTINCT ON (outlet_key) outlet_key, party_status FROM m ORDER BY outlet_key, published_at, article_id
  ), first_row AS (
    SELECT article_id, outlet_name, published_at FROM m ORDER BY published_at, article_id LIMIT 1
  ), agg AS (
    SELECT count(*) AS n, min(published_at) AS first_at, max(published_at) AS last_at,
           (SELECT jsonb_object_agg(lang, c) FROM (SELECT lang, count(*) AS c FROM m GROUP BY lang) l) AS langs
      FROM m
  )
  UPDATE public.stories s
     SET article_count            = agg.n,
         outlet_count             = (SELECT count(*) FROM per_outlet),
         party_outlet_count       = (SELECT count(*) FROM per_outlet WHERE party_status IN ('party', 'state_aligned')),
         independent_outlet_count = (SELECT count(*) FROM per_outlet WHERE party_status = 'independent'),
         unknown_outlet_count     = (SELECT count(*) FROM per_outlet WHERE party_status = 'unknown'),
         first_seen_at            = agg.first_at,
         last_seen_at             = agg.last_at,
         first_article_id         = (SELECT article_id FROM first_row),
         first_outlet_name        = (SELECT outlet_name FROM first_row),
         conflict_day_first       = public.conflict_day_of(agg.first_at),
         conflict_day_last        = public.conflict_day_of(agg.last_at),
         lang_counts              = coalesce(agg.langs, '{}'::jsonb)
    FROM agg
   WHERE s.id = p_story_id AND agg.n > 0
$$;

CREATE OR REPLACE FUNCTION public.story_articles_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE a record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'story_articles rows are never deleted (reassign on merge)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  SELECT ar.source_name, ar.published_at INTO a FROM public.articles ar WHERE ar.id = NEW.article_id;
  -- snapshots must equal the article they describe
  IF NEW.outlet_name IS DISTINCT FROM a.source_name OR NEW.published_at IS DISTINCT FROM a.published_at THEN
    RAISE EXCEPTION 'story_articles snapshot (outlet_name/published_at) must equal articles row %', NEW.article_id;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'story_id' - 'reassigned_from_story_id' - 'assigned_at')
       IS DISTINCT FROM (to_jsonb(OLD) - 'story_id' - 'reassigned_from_story_id' - 'assigned_at') THEN
      RAISE EXCEPTION 'story_articles: only story reassignment (merge) is allowed';
    END IF;
    IF NEW.story_id <> OLD.story_id AND NEW.reassigned_from_story_id IS DISTINCT FROM OLD.story_id THEN
      RAISE EXCEPTION 'reassignment must record reassigned_from_story_id = previous story';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS story_articles_guard ON public.story_articles;
CREATE TRIGGER story_articles_guard BEFORE INSERT OR UPDATE OR DELETE ON public.story_articles
  FOR EACH ROW EXECUTE FUNCTION public.story_articles_guard();

-- Statement-level refresh: each touched story is recomputed ONCE per statement (the job inserts
-- in batches), which keeps row churn on stories low (sized at ~150 stories / 400 articles a day).
CREATE OR REPLACE FUNCTION public.story_articles_refresh_ins()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.story_refresh(x.story_id) FROM (SELECT DISTINCT story_id FROM new_rows) x;
  RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.story_articles_refresh_upd()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM public.story_refresh(x.story_id)
     FROM (SELECT story_id FROM new_rows UNION SELECT story_id FROM old_rows) x;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS story_articles_refresh_ins ON public.story_articles;
CREATE TRIGGER story_articles_refresh_ins AFTER INSERT ON public.story_articles
  REFERENCING NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.story_articles_refresh_ins();
DROP TRIGGER IF EXISTS story_articles_refresh_upd ON public.story_articles;
CREATE TRIGGER story_articles_refresh_upd AFTER UPDATE ON public.story_articles
  REFERENCING OLD TABLE AS old_rows NEW TABLE AS new_rows FOR EACH STATEMENT EXECUTE FUNCTION public.story_articles_refresh_upd();

-- Merge: move every member of p_from into p_into, mark p_from merged. Nothing is deleted.
CREATE OR REPLACE FUNCTION public.story_merge(p_from uuid, p_into uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_n integer;
BEGIN
  IF p_from = p_into THEN RAISE EXCEPTION 'cannot merge a story into itself'; END IF;
  UPDATE public.story_articles SET story_id = p_into, reassigned_from_story_id = p_from, assigned_at = now()
   WHERE story_id = p_from;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  INSERT INTO public.story_topics (story_id, topic_id, matched_by, matched_terms, rule_version)
  SELECT p_into, topic_id, matched_by, matched_terms, rule_version FROM public.story_topics WHERE story_id = p_from
  ON CONFLICT DO NOTHING;
  UPDATE public.stories SET status = 'merged', merged_into_story_id = p_into WHERE id = p_from;
  RETURN v_n;
END $$;

-- Verification view: must always be empty (acceptance test).
CREATE OR REPLACE VIEW public.v_story_counts_check
WITH (security_invoker = true) AS
SELECT s.id, s.article_count, x.n
  FROM public.stories s
  LEFT JOIN (SELECT story_id, count(*) AS n FROM public.story_articles GROUP BY story_id) x ON x.story_id = s.id
 WHERE s.status <> 'merged' AND s.article_count IS DISTINCT FROM x.n;

-- Media-room board.
CREATE OR REPLACE VIEW public.v_story_board
WITH (security_invoker = true) AS
SELECT s.id, s.title, s.status, s.first_seen_at, s.last_seen_at, s.first_outlet_name,
       s.conflict_day_first, s.conflict_day_last, s.article_count, s.outlet_count,
       s.party_outlet_count, s.independent_outlet_count, s.unknown_outlet_count, s.lang_counts,
       s.geo_lat, s.geo_lng, s.geo_place,
       (SELECT coalesce(jsonb_agg(t.slug ORDER BY t.slug), '[]'::jsonb)
          FROM public.story_topics st JOIN public.topics t ON t.id = st.topic_id WHERE st.story_id = s.id) AS topics
  FROM public.stories s
 WHERE s.status <> 'merged';

-- ---------------------------------------------------------------------------
-- 4. intel_alerts — threshold events for operator review
-- ---------------------------------------------------------------------------
-- (Separate from platform_alerts, which is a keyed banner table: one row per banner key.)
CREATE TABLE IF NOT EXISTS public.intel_alerts (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  alert_kind            text NOT NULL,
  severity              text NOT NULL,
  conflict_day          integer NOT NULL,
  story_id              uuid REFERENCES public.stories(id),
  topic_id              uuid REFERENCES public.topics(id),
  scenario_market_id    uuid REFERENCES public.scenario_markets(id),
  report_type           text REFERENCES public.report_types(code),
  rule_code             text NOT NULL,
  rule_version          text NOT NULL,
  rule_snapshot         jsonb NOT NULL,
  metrics               jsonb NOT NULL,
  evidence              jsonb NOT NULL,
  summary               text NOT NULL,
  dedupe_key            text NOT NULL UNIQUE,
  status                text NOT NULL DEFAULT 'open',
  detected_scenario_id  uuid REFERENCES public.detected_scenarios(id),
  platform_alert_key    text REFERENCES public.platform_alerts(key),
  reviewed_by           uuid REFERENCES public.admin_users(id),
  reviewed_at           timestamptz,
  review_note           text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT intel_alerts_kind_chk     CHECK (alert_kind IN ('new_belligerent', 'chokepoint_change', 'mass_casualty_report', 'story_spike',
                                                             'topic_emerging', 'market_move', 'report_type_threshold', 'scenario_candidate')),
  CONSTRAINT intel_alerts_sev_chk      CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT intel_alerts_day_chk      CHECK (conflict_day >= 1),
  CONSTRAINT intel_alerts_subject_chk  CHECK (num_nonnulls(story_id, topic_id, scenario_market_id, report_type) >= 1),
  CONSTRAINT intel_alerts_rule_chk     CHECK (public.jsonb_nonempty(rule_snapshot) AND public.jsonb_nonempty(metrics)),
  CONSTRAINT intel_alerts_evidence_chk CHECK (public.intel_evidence_valid(evidence)),
  -- a scenario-candidate alert must already meet the birth evidence bar
  CONSTRAINT intel_alerts_candidate_chk CHECK (alert_kind <> 'scenario_candidate' OR public.intel_independent_hosts(evidence) >= 2),
  CONSTRAINT intel_alerts_summary_chk  CHECK (length(btrim(summary)) >= 10),
  CONSTRAINT intel_alerts_status_chk   CHECK (status IN ('open', 'acknowledged', 'dismissed', 'promoted')),
  CONSTRAINT intel_alerts_review_chk   CHECK (status = 'open' OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)),
  CONSTRAINT intel_alerts_promote_chk  CHECK (status <> 'promoted' OR detected_scenario_id IS NOT NULL OR platform_alert_key IS NOT NULL)
);
COMMENT ON TABLE public.intel_alerts IS
  'Threshold events raised by the deterministic job (rule_code/rule_version/rule_snapshot) with the observed metrics and source evidence. Review queue for the operator; promotion creates a detected_scenarios candidate or raises a platform_alerts banner. Never deleted.';
CREATE INDEX IF NOT EXISTS idx_intel_alerts_open ON public.intel_alerts (created_at DESC) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_intel_alerts_day ON public.intel_alerts (conflict_day DESC, alert_kind);

CREATE OR REPLACE FUNCTION public.intel_alerts_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'intel_alerts rows are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - ARRAY['status', 'detected_scenario_id', 'platform_alert_key', 'reviewed_by', 'reviewed_at', 'review_note'])
     IS DISTINCT FROM
     (to_jsonb(OLD) - ARRAY['status', 'detected_scenario_id', 'platform_alert_key', 'reviewed_by', 'reviewed_at', 'review_note']) THEN
    RAISE EXCEPTION 'intel_alerts: only review fields may change' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS intel_alerts_guard ON public.intel_alerts;
CREATE TRIGGER intel_alerts_guard BEFORE UPDATE OR DELETE ON public.intel_alerts
  FOR EACH ROW EXECUTE FUNCTION public.intel_alerts_guard();

-- ---------------------------------------------------------------------------
-- 5. Retention: no deletes anywhere on this surface
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS outlets_no_delete ON public.outlets;
CREATE TRIGGER outlets_no_delete BEFORE DELETE ON public.outlets FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
DROP TRIGGER IF EXISTS outlet_aliases_no_delete ON public.outlet_aliases;
CREATE TRIGGER outlet_aliases_no_delete BEFORE DELETE ON public.outlet_aliases FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
DROP TRIGGER IF EXISTS topics_no_delete ON public.topics;
CREATE TRIGGER topics_no_delete BEFORE DELETE ON public.topics FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
DROP TRIGGER IF EXISTS topic_daily_no_delete ON public.topic_daily;
CREATE TRIGGER topic_daily_no_delete BEFORE DELETE ON public.topic_daily FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
DROP TRIGGER IF EXISTS story_topics_no_delete ON public.story_topics;
CREATE TRIGGER story_topics_no_delete BEFORE DELETE ON public.story_topics FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

-- ---------------------------------------------------------------------------
-- 6. RLS + privileges: public read (except the alert review queue); service_role write
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['outlets','outlet_aliases','topics','topic_daily','stories','story_articles','story_topics','intel_alerts']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_all', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM service_role', t);
    IF t <> 'intel_alerts' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_public_read', t);
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)', t || '_public_read', t);
      EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', t);
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON public.v_story_board, public.v_story_counts_check FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_story_board TO anon, authenticated, service_role;
GRANT SELECT ON public.v_story_counts_check TO service_role;

-- articles: RLS already blocks anon writes; remove the privileges too (writers are service_role).
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.articles FROM anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.story_merge(uuid, uuid), public.story_refresh(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.story_merge(uuid, uuid), public.story_refresh(uuid) TO service_role;

COMMIT;
