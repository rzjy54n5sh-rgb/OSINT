-- =====================================================================================================
-- 20261012091000_war_posture_v2.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- War Posture v2 (operator-approved redesign, strategy agreed 2026-10-08; panel seats 08 / 09, red team
-- cluster 10). What changes:
--
--   1. Per conflict. A posture is scored per country PER CONFLICT (country x conflict x day) against a small
--      registry (public.conflicts), instead of one blended number per country.
--   2. Capture once, carry forward, decay. The verbatim statement is captured ONCE into the append-only
--      public.posture_evidence ledger (quote + archive URL + page SHA-256). A score row is written only when
--      the posture CHANGES; on every other day the last row is carried forward and its confidence decays
--      with the age of its evidence (half-life 30 days, see §3). A score is NULL only when no position was
--      ever captured: a page that fails to re-open never blanks a score. "Deliberate silence" is its own
--      stance, not NULL.
--   3. Positions-ledger-only countries. For Egypt, the UAE and Saudi Arabia (public.posture_publication_policy)
--      the database stores and serves NO 0-100 grade, label, category or band: v2 score rows are rejected
--      at insert, the legacy nai_scores_v2 rows are hidden from direct API reads (RLS) and returned by
--      viewer_nai_v2 with every graded field NULL. Their verbatim statements and behavioural acts stay public
--      in posture_evidence.
--   4. Five neutral behavioural labels (immediate_ceasefire / conditional_deescalation / ambivalent /
--      continued_pressure / escalation) plus a `defensive` flag replace adjective labels.
--   5. Moves only on new evidence: every score row carries change_reason (new_evidence | reverification |
--      nulled), enforced against the pair's previous row, so a "biggest move" can be restricted to
--      new_evidence and never shows a method artefact.
--
-- SCHEMA DECISION: a NEW table public.posture_scores, not new columns on nai_scores_v2. Reasons:
--   * nai_scores_v2 rows are blended (one number per country across different wars) and are re-written
--     daily; giving them a conflict_code would be a guess. They stay untouched, readable and comparable to
--     each other under method war-posture-v1 (history is never relabelled).
--   * its UNIQUE (country_code, conflict_day, method_version) is the daily task's upsert key; widening it to
--     include conflict_code would break the running task's ON CONFLICT target.
--   * v2 binds a score to ONE captured evidence row (FK) instead of a jsonb source list, writes on change
--     only, and validates change_reason against the previous row; on the old table every one of those
--     constraints would need a "legacy rows exempt" branch.
--   viewer_nai_v2 keeps its exact signature (the deployed app keeps working); viewer_posture_v2 is the new
--   read with the same tier rules.
--
-- Requires 20261008090000_security_hardening.sql and 20261009090000_trust_ledgers.sql (both applied in
-- prod). Idempotent (re-running is a no-op; see supabase/tests/war_posture_v2_fingerprint.sql). ONE
-- TRANSACTION (own BEGIN/COMMIT). Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261012091000_war_posture_v2.sql
-- Tests: supabase/tests/war_posture_v2_test.sql (+ run_war_posture_v2_tests.sh). NOT applied by the author.
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight ---------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regclass('public.nai_scores_v2') IS NULL OR to_regclass('public.posture_evidence') IS NULL
     OR to_regclass('public.tier_features') IS NULL THEN
    RAISE EXCEPTION 'war_posture_v2 preflight: nai_scores_v2 / posture_evidence / tier_features missing (apply trust_ledgers first)';
  END IF;
  IF to_regprocedure('public.viewer_nai_v2(integer,text,integer,boolean,text)') IS NULL
     OR to_regprocedure('public.viewer_has_feature(text)') IS NULL
     OR to_regprocedure('public.nai_c2_category(integer,integer,integer)') IS NULL
     OR to_regprocedure('public.nai_v2_sources_valid(jsonb)') IS NULL THEN
    RAISE EXCEPTION 'war_posture_v2 preflight: viewer_nai_v2 / viewer_has_feature / nai_c2_category / nai_v2_sources_valid missing (apply security_hardening first)';
  END IF;
END $pre$;

-- =====================================================================================================
-- §1 Conflicts registry
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.conflicts (
  conflict_code    text        NOT NULL,
  name             text        NOT NULL,
  short_name       text        NOT NULL,
  description      text        NOT NULL,
  theatre          text        NOT NULL,
  started_on       date,
  status           text        NOT NULL DEFAULT 'active',
  sort_order       integer     NOT NULL DEFAULT 100,
  ucdp_conflict_id integer,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT conflicts_pkey PRIMARY KEY (conflict_code),
  CONSTRAINT conflicts_code_chk CHECK (conflict_code ~ '^[a-z0-9][a-z0-9_-]{0,63}$'),
  CONSTRAINT conflicts_text_chk CHECK (length(btrim(name)) BETWEEN 1 AND 200 AND length(btrim(short_name)) BETWEEN 1 AND 40
                                       AND length(btrim(description)) BETWEEN 1 AND 2000 AND length(btrim(theatre)) BETWEEN 1 AND 80),
  CONSTRAINT conflicts_status_chk CHECK (status IN ('active', 'dormant', 'ended'))
);
COMMENT ON TABLE public.conflicts IS
  'War Posture v2 conflicts registry: a posture is scored per country PER conflict. conflict_code is the key used by posture_evidence and posture_scores.';

-- Registry rows (definitions, not data). started_on only where the start date is established:
-- us-iran = Conflict Day 1 (DAY LOCK); horn-tigray = CLAUDE.md theatre ruling 2026-10-07; sudan = 15 Apr 2023.
INSERT INTO public.conflicts (conflict_code, name, short_name, description, theatre, started_on, sort_order) VALUES
  ('us-iran', 'US/Israel–Iran war (2026)', 'US–Iran',
   'Hostilities between the United States and Israel and Iran and its allied forces since 28 February 2026 (Conflict Day 1). Party codenames: Epic Fury (US), Roaring Lion (Israel), True Promise IV (Iran).',
   'Gulf & Levant', DATE '2026-02-28', 10),
  ('red-sea-houthi', 'Red Sea and Houthi front', 'Red Sea / Houthis',
   'Attacks by the Houthis (Ansar Allah) on shipping and on Saudi territory, and the military responses to them, including by the Saudi-led coalition.',
   'Red Sea & Yemen', NULL, 20),
  ('horn-tigray', 'Ethiopia offensive and Eritrea rupture (2026)', 'Ethiopia / Horn',
   'Ethiopia''s offensive from 23 September 2026 against the TPLF/Fano/OLA alliance, and the Ethiopia–Eritrea rupture over Red Sea access.',
   'Horn of Africa', DATE '2026-09-23', 30),
  ('sudan', 'Sudan: SAF–RSF war', 'Sudan',
   'The war between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF), since 15 April 2023.',
   'Horn of Africa', DATE '2023-04-15', 40)
ON CONFLICT (conflict_code) DO NOTHING;

-- =====================================================================================================
-- §2 Publication policy: countries whose War Posture is shown as a stated-positions ledger only
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.posture_publication_policy (
  country_code text        NOT NULL,
  policy       text        NOT NULL,
  reason       text        NOT NULL,
  ruled_on     date        NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posture_publication_policy_pkey PRIMARY KEY (country_code),
  CONSTRAINT posture_publication_policy_cc_chk CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT posture_publication_policy_policy_chk CHECK (policy IN ('positions_ledger_only')),
  CONSTRAINT posture_publication_policy_reason_chk CHECK (length(btrim(reason)) BETWEEN 1 AND 2000)
);
COMMENT ON TABLE public.posture_publication_policy IS
  'Editorial policy: countries listed here get NO public 0-100 War Posture grade, label, band or category; only their verbatim stated positions and behavioural acts (posture_evidence) are published. Enforced in posture_scores (insert rejected), nai_scores_v2 (RLS) and the viewer_* RPCs.';

INSERT INTO public.posture_publication_policy (country_code, policy, reason, ruled_on) VALUES
  ('EG', 'positions_ledger_only', 'Editorial policy (strategy review 2026-10-08, red-team cluster 10): the desk does not publish a numeric War Posture grade or category colour for the governments of the jurisdictions its operator works in (Egypt, UAE) or for Saudi Arabia. Their verbatim stated positions and behavioural acts are published instead.', DATE '2026-10-08'),
  ('AE', 'positions_ledger_only', 'Editorial policy (strategy review 2026-10-08, red-team cluster 10): the desk does not publish a numeric War Posture grade or category colour for the governments of the jurisdictions its operator works in (Egypt, UAE) or for Saudi Arabia. Their verbatim stated positions and behavioural acts are published instead.', DATE '2026-10-08'),
  ('SA', 'positions_ledger_only', 'Editorial policy (strategy review 2026-10-08, red-team cluster 10): the desk does not publish a numeric War Posture grade or category colour for the governments of the jurisdictions its operator works in (Egypt, UAE) or for Saudi Arabia. Their verbatim stated positions and behavioural acts are published instead.', DATE '2026-10-08')
ON CONFLICT (country_code) DO NOTHING;

-- SECURITY INVOKER on purpose: RLS policies evaluate it with the caller's privileges, and the policy table
-- is public-read (it is a published editorial rule).
CREATE OR REPLACE FUNCTION public.posture_is_withheld(p_country text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.posture_publication_policy p
                  WHERE p.country_code = upper(btrim(p_country)) AND p.policy = 'positions_ledger_only')
$fn$;
COMMENT ON FUNCTION public.posture_is_withheld(text) IS
  'TRUE when the country is under the positions-ledger-only editorial policy (no public War Posture grade).';

-- =====================================================================================================
-- §3 Labels, day helpers and the decay schedule (IMMUTABLE: usable in CHECKs; mirrored in lib/posture.ts)
-- =====================================================================================================
-- Five neutral behavioural labels on the E scale (anchors 0/25/50/75/100 sit at the centre of each band).
--   0-12 immediate_ceasefire · 13-37 conditional_deescalation · 38-62 ambivalent ·
--   63-87 continued_pressure · 88-100 escalation
CREATE OR REPLACE FUNCTION public.posture_label_for_score(e integer)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN e IS NULL OR e < 0 OR e > 100 THEN NULL
    WHEN e <= 12 THEN 'immediate_ceasefire'
    WHEN e <= 37 THEN 'conditional_deescalation'
    WHEN e <= 62 THEN 'ambivalent'
    WHEN e <= 87 THEN 'continued_pressure'
    ELSE 'escalation'
  END
$fn$;

-- DAY LOCK: Day 1 = 2026-02-28 (UTC).
CREATE OR REPLACE FUNCTION public.posture_day_date(p_day integer)
RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$ SELECT DATE '2026-02-27' + p_day $fn$;

CREATE OR REPLACE FUNCTION public.posture_current_day()
RETURNS integer
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = ''
AS $fn$ SELECT (timezone('UTC', now())::date - DATE '2026-02-28') + 1 $fn$;

-- Decay schedule (a published convention, not an empirical finding):
--   decay_factor   = 0.5 ^ (age_days / half_life_days), half-life 30 days by default
--   confidence_now = base weight (high 0.9, medium 0.7, low 0.5) x decay_factor, banded
--                    >= 0.60 high, >= 0.30 medium, else low — and never above the base confidence
--   freshness      = current (age <= 14 days), decaying (15-45), stale (> 45). Stale positions stay on
--                    record and are shown as stale; age never turns a position into NULL.
CREATE OR REPLACE FUNCTION public.posture_decay_factor(p_age_days integer, p_half_life_days integer DEFAULT 30)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT CASE WHEN p_age_days IS NULL THEN NULL
              ELSE round(power(0.5::numeric, greatest(p_age_days, 0)::numeric / greatest(coalesce(p_half_life_days, 30), 1)), 4)
         END
$fn$;

CREATE OR REPLACE FUNCTION public.posture_confidence_now(p_base text, p_age_days integer, p_half_life_days integer DEFAULT 30)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  WITH b AS (
    SELECT CASE p_base WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 END AS rank_base,
           CASE p_base WHEN 'high' THEN 0.9 WHEN 'medium' THEN 0.7 WHEN 'low' THEN 0.5 END
             * public.posture_decay_factor(p_age_days, p_half_life_days) AS w
  )
  SELECT CASE WHEN rank_base IS NULL OR w IS NULL THEN NULL
              ELSE (ARRAY['low', 'medium', 'high'])[least(rank_base, CASE WHEN w >= 0.60 THEN 3 WHEN w >= 0.30 THEN 2 ELSE 1 END)]
         END
    FROM b
$fn$;

CREATE OR REPLACE FUNCTION public.posture_freshness(p_age_days integer)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT CASE WHEN p_age_days IS NULL THEN NULL
              WHEN p_age_days <= 14 THEN 'current'
              WHEN p_age_days <= 45 THEN 'decaying'
              ELSE 'stale' END
$fn$;

-- Latent sources for v2: same shape as nai_scores_v2.sources, every element feeding 'L'.
CREATE OR REPLACE FUNCTION public.posture_latent_sources_valid(src jsonb)
RETURNS boolean
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT public.nai_v2_sources_valid(src)
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(src) AS x(el) WHERE (x.el ->> 'feeds') IS DISTINCT FROM 'L')
$fn$;

-- =====================================================================================================
-- §4 posture_evidence: evidence kind, behavioural acts, statement date, registry FK
-- =====================================================================================================
-- ADD COLUMN with a constant default is catalog-only (no row rewrite, no UPDATE: the append-only guard
-- is not involved). Existing rows read as evidence_kind = 'statement'.
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS evidence_kind  text NOT NULL DEFAULT 'statement';
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS act_type       text;
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS speaker_office text;
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS stated_at      timestamptz;
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS quote_language text;
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS party_source   boolean;

COMMENT ON COLUMN public.posture_evidence.evidence_kind IS
  'statement = verbatim position of a government voice; act = a behavioural act (deployment, basing, vote ...) stated as a fact with its source sentence quoted; silence_trigger = the salient event a government did not answer (backs a deliberate_silence score).';
COMMENT ON COLUMN public.posture_evidence.act_type IS 'Only for evidence_kind = act. Seller-side acts (arms notifications) belong to the seller''s row.';
COMMENT ON COLUMN public.posture_evidence.stated_at IS 'When the statement was made / the act or trigger happened, as given on the page (captured_at = when the desk archived it). Decay runs from coalesce(stated_at, captured_at).';
COMMENT ON COLUMN public.posture_evidence.party_source IS 'TRUE when the publishing outlet is a party / state source: valid for what a government SAYS, never for population opinion or contested facts.';

DO $pe$
DECLARE rec record; n bigint;
BEGIN
  FOR rec IN SELECT * FROM (VALUES
    ('posture_evidence_kind_chk', $$evidence_kind IN ('statement', 'act', 'silence_trigger')$$),
    ('posture_evidence_act_type_chk', $$(evidence_kind = 'act') = (act_type IS NOT NULL) AND (act_type IS NULL OR act_type IN ('deployment', 'basing_or_overflight', 'interception', 'strike', 'un_vote', 'sanctions', 'talks_hosted', 'seizure', 'other'))$$),
    ('posture_evidence_office_chk', $$COALESCE(length(speaker_office), 0) <= 300$$),
    ('posture_evidence_lang_chk', $$quote_language IS NULL OR quote_language ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$'$$),
    ('posture_evidence_stated_chk', $$stated_at IS NULL OR stated_at <= captured_at + interval '1 day'$$)
  ) AS v(con, expr) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_evidence'::regclass AND conname = rec.con) THEN
      EXECUTE format('ALTER TABLE public.posture_evidence ADD CONSTRAINT %I CHECK (%s)', rec.con, rec.expr);
    END IF;
  END LOOP;

  -- conflict_code must name a registry row. Added NOT VALID (no scan under lock) and validated only when
  -- no existing row violates it; otherwise it stays NOT VALID (still enforced for new rows) and we report.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_evidence'::regclass AND conname = 'posture_evidence_conflict_fkey') THEN
    ALTER TABLE public.posture_evidence ADD CONSTRAINT posture_evidence_conflict_fkey
      FOREIGN KEY (conflict_code) REFERENCES public.conflicts (conflict_code) NOT VALID;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_evidence'::regclass AND conname = 'posture_evidence_conflict_fkey' AND NOT convalidated) THEN
    SELECT count(*) INTO n FROM public.posture_evidence pe
     WHERE NOT EXISTS (SELECT 1 FROM public.conflicts k WHERE k.conflict_code = pe.conflict_code);
    IF n = 0 THEN
      ALTER TABLE public.posture_evidence VALIDATE CONSTRAINT posture_evidence_conflict_fkey;
    ELSE
      RAISE NOTICE 'war_posture_v2: posture_evidence_conflict_fkey left NOT VALID — % existing row(s) name a conflict_code outside the registry', n;
    END IF;
  END IF;
END $pe$;

CREATE INDEX IF NOT EXISTS posture_evidence_pair_idx
  ON public.posture_evidence (country_code, conflict_code, captured_at DESC);

-- =====================================================================================================
-- §5 posture_scores — War Posture v2 score rows (written on change only)
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.posture_scores (
  id                      uuid        NOT NULL DEFAULT gen_random_uuid(),
  country_code            text        NOT NULL,
  conflict_code           text        NOT NULL,
  conflict_day            integer     NOT NULL,
  as_of                   date        NOT NULL,
  stance                  text        NOT NULL,
  label                   text,
  expressed_score         integer,
  defensive               boolean     NOT NULL DEFAULT false,
  evidence_id             uuid,
  confidence_base         text,
  half_life_days          integer     NOT NULL DEFAULT 30,
  silence_checked_through timestamptz,
  change_reason           text        NOT NULL,
  note                    text,
  latent_low              integer,
  latent_high             integer,
  latent_basis            text,
  latent_sources          jsonb,
  gap                     numeric GENERATED ALWAYS AS (expressed_score - (latent_low + latent_high) / 2.0) STORED,
  gap_size                numeric GENERATED ALWAYS AS (abs(expressed_score - (latent_low + latent_high) / 2.0)) STORED,
  category                text    GENERATED ALWAYS AS (public.nai_c2_category(expressed_score, latent_low, latent_high)) STORED,
  method_version          text        NOT NULL DEFAULT 'war-posture-v2',
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posture_scores_pkey PRIMARY KEY (id),
  CONSTRAINT posture_scores_conflict_fkey FOREIGN KEY (conflict_code) REFERENCES public.conflicts (conflict_code),
  CONSTRAINT posture_scores_evidence_fkey FOREIGN KEY (evidence_id) REFERENCES public.posture_evidence (id),
  CONSTRAINT posture_scores_pair_day_key UNIQUE (country_code, conflict_code, conflict_day, method_version),
  CONSTRAINT posture_scores_country_chk CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT posture_scores_day_chk CHECK (conflict_day >= 1),
  CONSTRAINT posture_scores_stance_chk CHECK (stance IN ('position', 'deliberate_silence', 'nulled')),
  CONSTRAINT posture_scores_label_chk CHECK (label IS NULL OR label IN ('immediate_ceasefire', 'conditional_deescalation', 'ambivalent', 'continued_pressure', 'escalation')),
  CONSTRAINT posture_scores_score_range CHECK (expressed_score IS NULL OR expressed_score BETWEEN 0 AND 100),
  CONSTRAINT posture_scores_label_matches_score CHECK (label IS NOT DISTINCT FROM public.posture_label_for_score(expressed_score)),
  CONSTRAINT posture_scores_confidence_chk CHECK (confidence_base IS NULL OR confidence_base IN ('high', 'medium', 'low')),
  CONSTRAINT posture_scores_half_life_chk CHECK (half_life_days BETWEEN 7 AND 365),
  CONSTRAINT posture_scores_reason_chk CHECK (change_reason IN ('new_evidence', 'reverification', 'nulled')),
  CONSTRAINT posture_scores_note_chk CHECK (COALESCE(length(note), 0) <= 4000),
  -- stance shapes
  CONSTRAINT posture_scores_position_shape CHECK (stance <> 'position'
      OR (expressed_score IS NOT NULL AND evidence_id IS NOT NULL AND confidence_base IS NOT NULL AND silence_checked_through IS NULL)),
  CONSTRAINT posture_scores_silence_shape CHECK (stance <> 'deliberate_silence'
      OR (expressed_score IS NULL AND NOT defensive AND evidence_id IS NOT NULL AND confidence_base IS NOT NULL
          AND silence_checked_through IS NOT NULL AND latent_low IS NULL)),
  CONSTRAINT posture_scores_nulled_shape CHECK ((stance = 'nulled') = (change_reason = 'nulled')
      AND (stance <> 'nulled' OR (expressed_score IS NULL AND NOT defensive AND confidence_base IS NULL
          AND silence_checked_through IS NULL AND latent_low IS NULL AND length(btrim(COALESCE(note, ''))) > 0))),
  CONSTRAINT posture_scores_reverification_note CHECK (change_reason <> 'reverification' OR length(btrim(COALESCE(note, ''))) > 0),
  -- latent band: same rules as nai_scores_v2 (band or NULL, never a guessed point without evidence)
  CONSTRAINT posture_scores_latent_range CHECK ((latent_low IS NULL OR latent_low BETWEEN 0 AND 100) AND (latent_high IS NULL OR latent_high BETWEEN 0 AND 100)),
  CONSTRAINT posture_scores_latent_both_or_neither CHECK ((latent_low IS NULL) = (latent_high IS NULL)),
  CONSTRAINT posture_scores_latent_order CHECK (latent_low IS NULL OR latent_low <= latent_high),
  CONSTRAINT posture_scores_latent_sourced CHECK ((latent_low IS NULL) = (latent_sources IS NULL)
      AND (latent_sources IS NULL OR public.posture_latent_sources_valid(latent_sources))),
  CONSTRAINT posture_scores_method_chk CHECK (length(btrim(method_version)) BETWEEN 1 AND 64)
);
COMMENT ON TABLE public.posture_scores IS
  'War Posture v2: one row per country x conflict per CHANGE (not per day). The latest row on or before a day is carried forward; confidence decays with the age of its posture_evidence row. Countries in posture_publication_policy are rejected. Read through viewer_posture_v2().';
COMMENT ON COLUMN public.posture_scores.stance IS
  'position = a coded position (label + E); deliberate_silence = a salient trigger went unanswered for >= 72 h (no score, shown as its own category); nulled = the only captured evidence was ruled inadmissible (a correction, never a page that failed to re-open).';
COMMENT ON COLUMN public.posture_scores.change_reason IS
  'new_evidence = the row rests on an evidence row not used before for this pair (only these rows may drive a "biggest move"); reverification = the same captured evidence re-coded (note required); nulled = evidence ruled inadmissible (note required).';
COMMENT ON COLUMN public.posture_scores.defensive IS 'TRUE when the government justifies its position by attacks on its own territory (e.g. "supports continued pressure, citing attacks on its territory").';

CREATE INDEX IF NOT EXISTS posture_scores_pair_idx ON public.posture_scores (country_code, conflict_code, conflict_day DESC);
CREATE INDEX IF NOT EXISTS posture_scores_day_idx  ON public.posture_scores (conflict_day DESC);

-- Row validation that needs other rows (evidence, previous row, policy). Runs for every role.
CREATE OR REPLACE FUNCTION public.posture_scores_validate()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
DECLARE
  ev   public.posture_evidence%ROWTYPE;
  prev public.posture_scores%ROWTYPE;
  ev_at timestamptz;
BEGIN
  IF public.posture_is_withheld(NEW.country_code) THEN
    RAISE EXCEPTION 'posture_scores: % is under the positions-ledger-only editorial policy (posture_publication_policy): capture its statements and acts in posture_evidence only, never a score row', NEW.country_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.conflict_day > public.posture_current_day() + 1 THEN
    RAISE EXCEPTION 'posture_scores: conflict_day % is in the future (DAY LOCK says today is Day %)', NEW.conflict_day, public.posture_current_day()
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.evidence_id IS NOT NULL THEN
    SELECT * INTO ev FROM public.posture_evidence WHERE id = NEW.evidence_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'posture_scores: evidence % not found', NEW.evidence_id USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF ev.country_code <> NEW.country_code OR ev.conflict_code <> NEW.conflict_code THEN
      RAISE EXCEPTION 'posture_scores: evidence % is for %/%, not %/%', ev.id, ev.country_code, ev.conflict_code, NEW.country_code, NEW.conflict_code
        USING ERRCODE = 'check_violation';
    END IF;
    ev_at := coalesce(ev.stated_at, ev.captured_at);
    IF (timezone('UTC', ev.captured_at))::date > NEW.as_of + 1 THEN
      RAISE EXCEPTION 'posture_scores: evidence captured % is after as_of %', ev.captured_at, NEW.as_of USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stance = 'position' AND ev.evidence_kind NOT IN ('statement', 'act') THEN
      RAISE EXCEPTION 'posture_scores: a position must rest on a statement or act, not %', ev.evidence_kind USING ERRCODE = 'check_violation';
    END IF;
    IF NEW.stance = 'deliberate_silence' THEN
      IF ev.evidence_kind <> 'silence_trigger' THEN
        RAISE EXCEPTION 'posture_scores: deliberate_silence must rest on a silence_trigger evidence row' USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.silence_checked_through < ev_at + interval '72 hours' THEN
        RAISE EXCEPTION 'posture_scores: silence needs >= 72 h without a position after the trigger (trigger %, checked through %)', ev_at, NEW.silence_checked_through
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  SELECT * INTO prev FROM public.posture_scores p
   WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code
     AND p.method_version = NEW.method_version AND p.conflict_day < NEW.conflict_day AND p.id <> NEW.id
   ORDER BY p.conflict_day DESC LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.change_reason <> 'new_evidence' THEN
      RAISE EXCEPTION 'posture_scores: the first row for %/% must be change_reason new_evidence (got %)', NEW.country_code, NEW.conflict_code, NEW.change_reason
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF prev.stance IS NOT DISTINCT FROM NEW.stance AND prev.label IS NOT DISTINCT FROM NEW.label
     AND prev.expressed_score IS NOT DISTINCT FROM NEW.expressed_score AND prev.defensive IS NOT DISTINCT FROM NEW.defensive
     AND prev.evidence_id IS NOT DISTINCT FROM NEW.evidence_id AND prev.confidence_base IS NOT DISTINCT FROM NEW.confidence_base
     AND prev.latent_low IS NOT DISTINCT FROM NEW.latent_low AND prev.latent_high IS NOT DISTINCT FROM NEW.latent_high THEN
    RAISE EXCEPTION 'posture_scores: no change vs Day % for %/% — carry forward (write no row)', prev.conflict_day, NEW.country_code, NEW.conflict_code
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.change_reason = 'new_evidence' AND EXISTS (
       SELECT 1 FROM public.posture_scores p
        WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.method_version = NEW.method_version
          AND p.conflict_day < NEW.conflict_day AND p.evidence_id = NEW.evidence_id) THEN
    RAISE EXCEPTION 'posture_scores: evidence % was already used for %/% — a re-coding of it is change_reason reverification', NEW.evidence_id, NEW.country_code, NEW.conflict_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.change_reason = 'reverification' AND NOT EXISTS (
       SELECT 1 FROM public.posture_scores p
        WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.method_version = NEW.method_version
          AND p.conflict_day < NEW.conflict_day AND p.evidence_id = NEW.evidence_id) THEN
    RAISE EXCEPTION 'posture_scores: reverification must re-code evidence already used for %/% (new evidence is change_reason new_evidence)', NEW.country_code, NEW.conflict_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.change_reason = 'nulled' AND prev.stance = 'nulled' THEN
    RAISE EXCEPTION 'posture_scores: %/% is already nulled', NEW.country_code, NEW.conflict_code USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS posture_scores_validate ON public.posture_scores;
CREATE TRIGGER posture_scores_validate BEFORE INSERT OR UPDATE ON public.posture_scores
  FOR EACH ROW EXECUTE FUNCTION public.posture_scores_validate();
ALTER TABLE public.posture_scores ENABLE ALWAYS TRIGGER posture_scores_validate;

-- =====================================================================================================
-- §6 Legacy nai_scores_v2: withhold EG / AE / SA from the API
-- =====================================================================================================
-- Direct reads (anon/authenticated column grants) no longer return policy countries' rows at all.
-- viewer_nai_v2 (SECURITY DEFINER, table owner) returns them with every graded field NULL. service_role /
-- postgres (the daily task, backups) still see the rows: the archive is kept, not deleted.
DROP POLICY IF EXISTS "nai_scores_v2_public_select" ON public.nai_scores_v2;
CREATE POLICY "nai_scores_v2_public_select" ON public.nai_scores_v2
  AS PERMISSIVE FOR SELECT TO anon, authenticated
  USING (NOT public.posture_is_withheld(country_code));

-- Same signature and output columns as 20261008090000 (the deployed app keeps working). Changes:
-- policy countries -> expressed_score / expressed_basis / latent_* / gap / gap_size / category NULL,
-- latent (L) sources removed for every tier and not counted as "available on a paid tier".
CREATE OR REPLACE FUNCTION public.viewer_nai_v2(
  p_day        integer DEFAULT NULL,
  p_country    text    DEFAULT NULL,
  p_limit      integer DEFAULT 1000,
  p_ascending  boolean DEFAULT false,
  p_method     text    DEFAULT 'war-posture-v1')
RETURNS TABLE (
  id uuid, country_code text, conflict_day integer, as_of date,
  expressed_score integer, expressed_basis text,
  latent_low integer, latent_high integer, latent_basis text,
  confidence text, sources jsonb,
  gap numeric, gap_size numeric, category text,
  method_version text, created_at timestamptz,
  latent_access boolean, gap_access boolean, hidden_latent_source_count integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH acc AS (
    SELECT public.viewer_has_feature('nai_latent_score') AS l,
           public.viewer_has_feature('nai_gap_analysis') AS g
  )
  SELECT n.id, n.country_code, n.conflict_day, n.as_of,
         CASE WHEN NOT w.w THEN n.expressed_score END,
         CASE WHEN NOT w.w THEN n.expressed_basis END,
         CASE WHEN acc.l AND NOT w.w THEN n.latent_low END,
         CASE WHEN acc.l AND NOT w.w THEN n.latent_high END,
         CASE WHEN acc.l AND NOT w.w THEN n.latent_basis END,
         n.confidence,
         CASE WHEN acc.l AND NOT w.w THEN n.sources
              ELSE COALESCE((SELECT jsonb_agg(x.el ORDER BY x.ord)
                               FROM jsonb_array_elements(n.sources) WITH ORDINALITY AS x(el, ord)
                              WHERE (x.el ->> 'feeds') IS DISTINCT FROM 'L'), '[]'::jsonb)
         END,
         CASE WHEN acc.g AND NOT w.w THEN n.gap END,
         CASE WHEN acc.g AND NOT w.w THEN n.gap_size END,
         CASE WHEN w.w THEN NULL WHEN acc.g OR n.category = 'UNSCORABLE' THEN n.category END,
         n.method_version, n.created_at,
         acc.l AND NOT w.w, acc.g AND NOT w.w,
         CASE WHEN acc.l OR w.w THEN 0
              ELSE (SELECT count(*)::integer FROM jsonb_array_elements(n.sources) AS y(el) WHERE (y.el ->> 'feeds') = 'L')
         END
    FROM public.nai_scores_v2 n
   CROSS JOIN acc
   CROSS JOIN LATERAL (SELECT public.posture_is_withheld(n.country_code) AS w) w
   WHERE n.method_version = p_method
     AND (p_day IS NULL OR n.conflict_day = p_day)
     AND (p_country IS NULL OR n.country_code = upper(btrim(p_country)))
   ORDER BY CASE WHEN p_ascending THEN n.conflict_day END ASC,
            CASE WHEN NOT p_ascending THEN n.conflict_day END DESC,
            n.country_code
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000)
$fn$;
COMMENT ON FUNCTION public.viewer_nai_v2(integer, text, integer, boolean, text) IS
  'Tier-gated read of nai_scores_v2 (War Posture v1, blended) for the calling JWT (anon = free). Paid columns NULL and L-sources removed unless tier_features allows. Countries in posture_publication_policy: every graded field NULL for every tier. SECURITY DEFINER by design.';

-- =====================================================================================================
-- §7 viewer_posture_v2 — per country x conflict: the latest coded position on or before a day (carried
--    forward), its evidence, decayed confidence, the previous row (for moves) and the tier-gated band.
-- =====================================================================================================
-- Pairs = every country x conflict with a score row or a captured evidence row on or before the day.
-- A pair with neither is not returned (= "no position ever captured"). stance values returned:
--   position | deliberate_silence | nulled — the coded row
--   uncoded  — evidence captured, not coded yet (no score)
--   withheld — country under posture_publication_policy: evidence only, every graded field NULL
CREATE OR REPLACE FUNCTION public.viewer_posture_v2(
  p_conflict text    DEFAULT NULL,
  p_country  text    DEFAULT NULL,
  p_day      integer DEFAULT NULL)
RETURNS TABLE (
  country_code text, conflict_code text,
  score_id uuid, score_day integer, as_of date,
  stance text, label text, expressed_score integer, defensive boolean,
  confidence_base text, confidence_now text, decay_factor numeric, half_life_days integer,
  evidence_id uuid, evidence_kind text, act_type text, position_quote text, speaker text, speaker_office text,
  source_url text, archive_url text, page_sha256 text, party_source boolean,
  stated_at timestamptz, captured_at timestamptz, evidence_age_days integer, freshness text,
  change_reason text, note text,
  previous_day integer, previous_stance text, previous_label text, previous_score integer,
  withheld boolean,
  latent_low integer, latent_high integer, latent_basis text, gap numeric, category text,
  latent_access boolean, gap_access boolean,
  method_version text)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH acc AS (
    SELECT public.viewer_has_feature('nai_latent_score') AS l,
           public.viewer_has_feature('nai_gap_analysis') AS g
  ),
  ref AS (
    SELECT d, public.posture_day_date(d) AS ref_date
      FROM (SELECT COALESCE(p_day, public.posture_current_day()) AS d) x
  ),
  s AS (
    SELECT DISTINCT ON (ps.country_code, ps.conflict_code) ps.*
      FROM public.posture_scores ps CROSS JOIN ref
     WHERE ps.method_version = 'war-posture-v2'
       AND ps.conflict_day <= ref.d
       AND (p_conflict IS NULL OR ps.conflict_code = lower(btrim(p_conflict)))
       AND (p_country  IS NULL OR ps.country_code  = upper(btrim(p_country)))
     ORDER BY ps.country_code, ps.conflict_code, ps.conflict_day DESC
  ),
  e AS (
    SELECT DISTINCT ON (pe.country_code, pe.conflict_code) pe.*
      FROM public.posture_evidence pe CROSS JOIN ref
     WHERE timezone('UTC', pe.captured_at)::date <= ref.ref_date
       AND (p_conflict IS NULL OR pe.conflict_code = lower(btrim(p_conflict)))
       AND (p_country  IS NULL OR pe.country_code  = upper(btrim(p_country)))
     ORDER BY pe.country_code, pe.conflict_code, coalesce(pe.stated_at, pe.captured_at) DESC, pe.captured_at DESC, pe.id
  ),
  pairs AS (
    SELECT s.country_code, s.conflict_code FROM s
    UNION
    SELECT e.country_code, e.conflict_code FROM e
  )
  SELECT p.country_code, p.conflict_code,
         CASE WHEN w.w THEN NULL ELSE s.id END,
         CASE WHEN w.w THEN NULL ELSE s.conflict_day END,
         CASE WHEN w.w THEN NULL ELSE s.as_of END,
         CASE WHEN w.w THEN 'withheld' WHEN s.id IS NULL THEN 'uncoded' ELSE s.stance END,
         CASE WHEN w.w THEN NULL ELSE s.label END,
         CASE WHEN w.w THEN NULL ELSE s.expressed_score END,
         CASE WHEN w.w THEN NULL ELSE s.defensive END,
         CASE WHEN w.w THEN NULL ELSE s.confidence_base END,
         CASE WHEN w.w THEN NULL ELSE public.posture_confidence_now(s.confidence_base, a.age, s.half_life_days) END,
         CASE WHEN w.w OR s.confidence_base IS NULL THEN NULL ELSE public.posture_decay_factor(a.age, s.half_life_days) END,
         CASE WHEN w.w THEN NULL ELSE s.half_life_days END,
         ev.id, ev.evidence_kind, ev.act_type, ev.position_quote, ev.speaker, ev.speaker_office,
         ev.source_url, ev.archive_url, ev.page_sha256, ev.party_source,
         ev.stated_at, ev.captured_at, a.age, public.posture_freshness(a.age),
         CASE WHEN w.w THEN NULL ELSE s.change_reason END,
         CASE WHEN w.w THEN NULL ELSE s.note END,
         CASE WHEN w.w THEN NULL ELSE pv.conflict_day END,
         CASE WHEN w.w THEN NULL ELSE pv.stance END,
         CASE WHEN w.w THEN NULL ELSE pv.label END,
         CASE WHEN w.w THEN NULL ELSE pv.expressed_score END,
         w.w,
         CASE WHEN acc.l AND NOT w.w THEN s.latent_low END,
         CASE WHEN acc.l AND NOT w.w THEN s.latent_high END,
         CASE WHEN acc.l AND NOT w.w THEN s.latent_basis END,
         CASE WHEN acc.g AND NOT w.w THEN s.gap END,
         CASE WHEN w.w OR s.id IS NULL THEN NULL WHEN acc.g OR s.category = 'UNSCORABLE' THEN s.category END,
         acc.l AND NOT w.w, acc.g AND NOT w.w,
         'war-posture-v2'::text
    FROM pairs p
    CROSS JOIN acc
    CROSS JOIN ref
    CROSS JOIN LATERAL (SELECT public.posture_is_withheld(p.country_code) AS w) w
    LEFT JOIN s ON s.country_code = p.country_code AND s.conflict_code = p.conflict_code
    LEFT JOIN e ON e.country_code = p.country_code AND e.conflict_code = p.conflict_code
    LEFT JOIN public.posture_evidence se ON se.id = s.evidence_id
    -- evidence shown: the coded row's evidence; the latest captured evidence when withheld or uncoded
    CROSS JOIN LATERAL (
      SELECT CASE WHEN w.w OR se.id IS NULL THEN e.id ELSE se.id END AS id
    ) pick
    LEFT JOIN public.posture_evidence ev ON ev.id = pick.id
    CROSS JOIN LATERAL (
      SELECT CASE WHEN ev.id IS NULL THEN NULL
                  ELSE greatest(ref.ref_date - timezone('UTC', coalesce(ev.stated_at, ev.captured_at))::date, 0) END AS age
    ) a
    LEFT JOIN LATERAL (
      SELECT q.conflict_day, q.stance, q.label, q.expressed_score
        FROM public.posture_scores q
       WHERE s.id IS NOT NULL AND q.country_code = s.country_code AND q.conflict_code = s.conflict_code
         AND q.method_version = s.method_version AND q.conflict_day < s.conflict_day
       ORDER BY q.conflict_day DESC LIMIT 1
    ) pv ON true
   ORDER BY p.conflict_code, p.country_code
$fn$;
COMMENT ON FUNCTION public.viewer_posture_v2(text, text, integer) IS
  'War Posture v2 for the calling JWT (anon = free): per country x conflict, the latest posture_scores row on or before p_day (default today, DAY LOCK) carried forward, its evidence, decayed confidence and the previous row. Latent band / gap / category gated by tier_features exactly like viewer_nai_v2. Countries in posture_publication_policy: stance ''withheld'', evidence only. SECURITY DEFINER by design (posture_scores has no API grants).';

-- =====================================================================================================
-- §8 Grants + RLS (nothing inherited from default privileges)
-- =====================================================================================================
REVOKE ALL ON public.conflicts, public.posture_publication_policy, public.posture_scores FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.conflicts, public.posture_publication_policy TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conflicts, public.posture_publication_policy, public.posture_scores TO service_role;

ALTER TABLE public.conflicts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posture_publication_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posture_scores             ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS conflicts_public_read ON public.conflicts;
CREATE POLICY conflicts_public_read ON public.conflicts AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS conflicts_service ON public.conflicts;
CREATE POLICY conflicts_service ON public.conflicts AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS posture_publication_policy_public_read ON public.posture_publication_policy;
CREATE POLICY posture_publication_policy_public_read ON public.posture_publication_policy AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS posture_publication_policy_service ON public.posture_publication_policy;
CREATE POLICY posture_publication_policy_service ON public.posture_publication_policy AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
-- posture_scores: no anon/authenticated policy and no grant; reads go through viewer_posture_v2.
DROP POLICY IF EXISTS posture_scores_service ON public.posture_scores;
CREATE POLICY posture_scores_service ON public.posture_scores AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Functions: pure helpers are callable by every API role (posture_is_withheld must be, for the RLS
-- policy on nai_scores_v2); the validator trigger function is not callable directly by anyone.
REVOKE ALL ON FUNCTION public.posture_is_withheld(text), public.posture_label_for_score(integer),
                       public.posture_day_date(integer), public.posture_current_day(),
                       public.posture_decay_factor(integer, integer), public.posture_confidence_now(text, integer, integer),
                       public.posture_freshness(integer), public.posture_latent_sources_valid(jsonb),
                       public.viewer_posture_v2(text, text, integer), public.posture_scores_validate()
  FROM PUBLIC, anon, authenticated;  -- the live default ACL also grants EXECUTE to anon/authenticated directly
GRANT EXECUTE ON FUNCTION public.posture_is_withheld(text), public.posture_label_for_score(integer),
                          public.posture_day_date(integer), public.posture_current_day(),
                          public.posture_decay_factor(integer, integer), public.posture_confidence_now(text, integer, integer),
                          public.posture_freshness(integer), public.posture_latent_sources_valid(jsonb),
                          public.viewer_posture_v2(text, text, integer)
  TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.viewer_nai_v2(integer, text, integer, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_nai_v2(integer, text, integer, boolean, text) TO anon, authenticated, service_role;

-- =====================================================================================================
-- §9 Post-condition asserts (abort the whole migration if any fails)
-- =====================================================================================================
DO $post$
BEGIN
  IF has_table_privilege('anon', 'public.posture_scores', 'SELECT')
     OR has_table_privilege('authenticated', 'public.posture_scores', 'SELECT')
     OR has_table_privilege('anon', 'public.posture_scores', 'INSERT')
     OR has_table_privilege('anon', 'public.conflicts', 'INSERT')
     OR has_table_privilege('authenticated', 'public.posture_publication_policy', 'UPDATE')
     OR NOT has_table_privilege('anon', 'public.conflicts', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.posture_publication_policy', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.posture_scores', 'INSERT')
     OR NOT has_function_privilege('anon', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.viewer_nai_v2(integer,text,integer,boolean,text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.posture_is_withheld(text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.posture_scores_validate()', 'EXECUTE')
     OR has_column_privilege('anon', 'public.nai_scores_v2', 'latent_low', 'SELECT')
     OR has_column_privilege('anon', 'public.nai_scores_v2', 'sources', 'SELECT') THEN
    RAISE EXCEPTION 'war_posture_v2 post-check: privilege matrix not as intended';
  END IF;
  IF (SELECT count(*) FROM public.posture_publication_policy WHERE country_code IN ('EG', 'AE', 'SA')) <> 3 THEN
    RAISE EXCEPTION 'war_posture_v2 post-check: EG / AE / SA policy rows missing';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.posture_scores'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.conflicts'::regclass) THEN
    RAISE EXCEPTION 'war_posture_v2 post-check: RLS off';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.posture_scores'::regclass AND tgname = 'posture_scores_validate' AND tgenabled = 'A') THEN
    RAISE EXCEPTION 'war_posture_v2 post-check: posture_scores_validate trigger missing or not ENABLE ALWAYS';
  END IF;
END $post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
