-- Migration 20261006120000: nai_scores_v2 — NAI "War Posture" method (war-posture-v1)
--
-- Operator ruling 2026-10-06: adopt candidate C2 "War Posture" (NAI decision memo §2 C2, §3, §5, §6).
--
--   expressed_score (E, 0-100): the official narrative's position on continuing hostilities.
--       0 = demands immediate unconditional ceasefire · 50 = conditional / ambivalent ·
--       100 = backs continuing or escalating military action (by its own side or a side it supports).
--       Same question for every state; no belligerent is the reference (DECISION-001).
--   latent band [latent_low, latent_high]: the same scale for the population and
--       non-government elites. Stored as a BAND, both NULL when there is no evidence.
--       Never a guessed point.
--   gap      = E - midpoint(band)   (signed; NULL when E or band is missing)
--   gap_size = |gap|
--   category = public.nai_c2_category(E, latent_low, latent_high), i.e. the memo's
--       banded(c2, E, lo, hi): a category is assigned only if EVERY integer L in
--       [latent_low, latent_high] yields the same c2(E, L); otherwise UNSCORABLE.
--       Missing E or missing band -> UNSCORABLE.
--
-- CONVENTIONS, NOT EMPIRICAL FINDINGS: the gap thresholds 10 / 20 / 30 and the side
-- midpoint 50 are conventions chosen in the memo (§2, "conventions (theory)"). They are
-- not derived from data. Changing any of them requires a new method_version and a
-- rescore — STORED generated columns do NOT recompute when a function is redefined.
--
-- The legacy table public.nai_scores (Days 1-35) is ARCHIVED, read-only and on a
-- different (US-referenced) axis. It is NOT comparable and is NOT touched here.
-- Never relabel or copy its rows into this table.
--
-- NOT APPLIED by the author. The lead applies it.

-- ---------------------------------------------------------------------------
-- 1. Category functions (IMMUTABLE so they can back a GENERATED column)
-- ---------------------------------------------------------------------------

-- c2(E, L) from the memo, line for line:
--   if E is None or L is None: return U
--   g = abs(E - L)
--   if g < 10: return 'ALIGNED'
--   if g < 20: return 'STABLE'
--   if g < 30: return 'TENSION'
--   return 'FRACTURE' if (E >= 50) == (L >= 50) else 'INVERSION'
CREATE OR REPLACE FUNCTION public.nai_c2_point(e integer, l integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN e IS NULL OR l IS NULL        THEN 'UNSCORABLE'
    WHEN abs(e - l) < 10               THEN 'ALIGNED'
    WHEN abs(e - l) < 20               THEN 'STABLE'
    WHEN abs(e - l) < 30               THEN 'TENSION'
    WHEN (e >= 50) = (l >= 50)         THEN 'FRACTURE'
    ELSE                                    'INVERSION'
  END
$$;

COMMENT ON FUNCTION public.nai_c2_point(integer, integer) IS
  'NAI war-posture-v1: memo c2(E,L). Thresholds 10/20/30 and midpoint 50 are conventions, not empirical.';

-- banded(c2, E, lo, hi) from the memo, line for line:
--   if E is None or lo is None or hi is None: return U
--   cats = {f(E, L) for L in range(lo, hi + 1)}
--   return cats.pop() if len(cats) == 1 else U
-- (An inverted band lo > hi gives an empty set in Python -> U; here count(DISTINCT) = 0 -> U.
--  The table CHECK forbids lo > hi anyway.)
CREATE OR REPLACE FUNCTION public.nai_c2_category(e integer, lo integer, hi integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN e IS NULL OR lo IS NULL OR hi IS NULL THEN 'UNSCORABLE'
    ELSE (
      SELECT CASE WHEN count(DISTINCT c.cat) = 1 THEN min(c.cat) ELSE 'UNSCORABLE' END
      FROM generate_series(lo, hi) AS s(l)
      CROSS JOIN LATERAL (SELECT public.nai_c2_point(e, s.l) AS cat) AS c
    )
  END
$$;

COMMENT ON FUNCTION public.nai_c2_category(integer, integer, integer) IS
  'NAI war-posture-v1: memo banded(c2,E,lo,hi). Category only if constant across every integer L in [lo,hi], else UNSCORABLE. NULL E or band -> UNSCORABLE.';

-- Source-list validator. Every element must be an object carrying the data-contract
-- fields: non-empty claim and name, an http(s) url, a published_at string, a boolean
-- party_source, and feeds in ('E','L'). Operator standing order: never accept an
-- invented claim, so a source without a link or a claim is rejected at the DB.
CREATE OR REPLACE FUNCTION public.nai_v2_sources_valid(src jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(src) = 'array'
     AND jsonb_array_length(src) >= 1
     AND NOT EXISTS (
       SELECT 1
       FROM jsonb_array_elements(src) AS x(el)
       -- coalesce: a missing key makes the conjunction NULL, and NOT NULL would silently pass.
       WHERE NOT coalesce((
             jsonb_typeof(x.el) = 'object'
         AND jsonb_typeof(x.el -> 'claim') = 'string'        AND length(btrim(x.el ->> 'claim')) > 0
         AND jsonb_typeof(x.el -> 'name') = 'string'         AND length(btrim(x.el ->> 'name')) > 0
         AND jsonb_typeof(x.el -> 'url') = 'string'          AND (x.el ->> 'url') ~* '^https?://[^[:space:]]+$'
         AND jsonb_typeof(x.el -> 'published_at') = 'string' AND length(btrim(x.el ->> 'published_at')) > 0
         AND jsonb_typeof(x.el -> 'party_source') = 'boolean'
         AND (x.el ->> 'feeds') IN ('E', 'L')
       ), false)
     )
$$;

-- TRUE when at least one source element feeds the given side ('E' or 'L').
CREATE OR REPLACE FUNCTION public.nai_v2_sources_feed(src jsonb, side text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $$
  SELECT jsonb_typeof(src) = 'array'
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(src) AS x(el) WHERE (x.el ->> 'feeds') = side)
$$;

-- ---------------------------------------------------------------------------
-- 2. Table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.nai_scores_v2 (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code     text        NOT NULL,
  conflict_day     integer     NOT NULL,
  as_of            date        NOT NULL,
  expressed_score  integer,
  expressed_basis  text,
  latent_low       integer,
  latent_high      integer,
  latent_basis     text,
  confidence       text        NOT NULL,
  sources          jsonb       NOT NULL,
  gap              numeric GENERATED ALWAYS AS
                     (expressed_score - (latent_low + latent_high) / 2.0) STORED,
  gap_size         numeric GENERATED ALWAYS AS
                     (abs(expressed_score - (latent_low + latent_high) / 2.0)) STORED,
  category         text    GENERATED ALWAYS AS
                     (public.nai_c2_category(expressed_score, latent_low, latent_high)) STORED,
  method_version   text        NOT NULL DEFAULT 'war-posture-v1',
  created_at       timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT nai_scores_v2_country_code_chk  CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT nai_scores_v2_conflict_day_chk  CHECK (conflict_day >= 1),
  CONSTRAINT nai_scores_v2_expressed_range   CHECK (expressed_score IS NULL OR expressed_score BETWEEN 0 AND 100),
  CONSTRAINT nai_scores_v2_latent_low_range  CHECK (latent_low  IS NULL OR latent_low  BETWEEN 0 AND 100),
  CONSTRAINT nai_scores_v2_latent_high_range CHECK (latent_high IS NULL OR latent_high BETWEEN 0 AND 100),
  CONSTRAINT nai_scores_v2_latent_both_or_neither CHECK ((latent_low IS NULL) = (latent_high IS NULL)),
  CONSTRAINT nai_scores_v2_latent_order      CHECK (latent_low IS NULL OR latent_low <= latent_high),
  CONSTRAINT nai_scores_v2_confidence_chk    CHECK (confidence IN ('high', 'medium', 'low')),
  CONSTRAINT nai_scores_v2_sources_nonempty  CHECK (jsonb_typeof(sources) = 'array' AND jsonb_array_length(sources) >= 1),
  CONSTRAINT nai_scores_v2_sources_shape     CHECK (public.nai_v2_sources_valid(sources)),
  -- A score with no source feeding it is an unsourced claim: reject it.
  CONSTRAINT nai_scores_v2_expressed_sourced CHECK (expressed_score IS NULL OR public.nai_v2_sources_feed(sources, 'E')),
  CONSTRAINT nai_scores_v2_latent_sourced    CHECK (latent_low IS NULL OR public.nai_v2_sources_feed(sources, 'L')),
  CONSTRAINT nai_scores_v2_country_day_method_key UNIQUE (country_code, conflict_day, method_version)
);

COMMENT ON TABLE public.nai_scores_v2 IS
  'NAI War Posture (C2, ruling 2026-10-06). Series starts Day 221. Legacy nai_scores (Days 1-35) is archived, different axis, NOT comparable. Thresholds 10/20/30 and midpoint 50 are conventions.';
COMMENT ON COLUMN public.nai_scores_v2.expressed_score IS
  'E 0-100: official position on continuing hostilities. 0 = immediate unconditional ceasefire, 50 = conditional/ambivalent, 100 = continue/escalate. NULL = no evidence.';
COMMENT ON COLUMN public.nai_scores_v2.latent_low IS
  'Lower bound of the latent band (population + non-government elites, same scale). NULL with latent_high when there is no evidence.';
COMMENT ON COLUMN public.nai_scores_v2.latent_high IS
  'Upper bound of the latent band. NULL with latent_low when there is no evidence.';
COMMENT ON COLUMN public.nai_scores_v2.gap IS 'E - midpoint(latent band), signed. NULL when E or band missing.';
COMMENT ON COLUMN public.nai_scores_v2.category IS
  'nai_c2_category(E, lo, hi): ALIGNED/STABLE/TENSION/FRACTURE/INVERSION or UNSCORABLE. Derived from the band, not from gap.';
COMMENT ON COLUMN public.nai_scores_v2.sources IS
  'Non-empty array of {claim, name, url, published_at, party_source, feeds: E|L}.';

CREATE INDEX IF NOT EXISTS idx_nai_scores_v2_conflict_day ON public.nai_scores_v2 (conflict_day DESC);

-- ---------------------------------------------------------------------------
-- 3. RLS: public read, service_role write. No anon / authenticated writes.
-- ---------------------------------------------------------------------------

ALTER TABLE public.nai_scores_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "nai_scores_v2_public_select" ON public.nai_scores_v2;
CREATE POLICY "nai_scores_v2_public_select" ON public.nai_scores_v2
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "nai_scores_v2_service" ON public.nai_scores_v2;
CREATE POLICY "nai_scores_v2_service" ON public.nai_scores_v2
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Supabase default privileges grant ALL on new public tables to anon/authenticated.
-- RLS already blocks their writes (no policy); revoke the privileges as well.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.nai_scores_v2 FROM anon, authenticated;
GRANT SELECT ON public.nai_scores_v2 TO anon, authenticated;
GRANT ALL ON public.nai_scores_v2 TO service_role;
