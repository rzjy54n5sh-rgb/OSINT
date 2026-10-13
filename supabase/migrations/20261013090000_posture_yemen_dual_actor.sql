-- =====================================================================================================
-- 20261013090000_posture_yemen_dual_actor.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- War Posture v2: Yemen has two authorities, shown as two separate lines (operator decision, Omar,
-- 2026-10-13: "Its complicated, I guess you must show both of them").
--   * government          — the internationally recognised Government of Yemen (Presidential Leadership
--                           Council, Aden). The default for every row of every country.
--   * de_facto_authority  — the Ansar Allah (Houthi) authorities in Sanaa.
-- The two are never merged into one number: every rule that was per (country, conflict) is now per
-- (country, conflict, actor).
--
-- What changes:
--   1. public.posture_actors — registry of non-default actors (seeded with the two YE rows; the
--      'government' row for YE carries the display name). Locked like posture_publication_policy: rows
--      are added by a reviewed migration only (no API INSERT, no UPDATE / DELETE for anyone).
--   2. actor text NOT NULL DEFAULT 'government' on posture_evidence and posture_scores, CHECK
--      actor IN ('government', 'de_facto_authority'). ADD COLUMN with a constant default is catalog-only:
--      existing rows read 'government' without being rewritten (no UPDATE, append-only guards untouched).
--   3. 'de_facto_authority' only where registered: ENFORCED BY TRIGGER (posture_evidence_actor_check on
--      posture_evidence; inside posture_scores_validate on posture_scores) via posture_actor_registered().
--      Not an FK: an FK on (country_code, actor) would need a 'government' registry row for every
--      country ever captured, and a partial FK needs a stored generated column (table rewrite + a column
--      PostgREST would expose). The trigger is safe because posture_actors is locked (rows can never be
--      removed or changed), so a check passed at insert stays true.
--   4. posture_scores: one row per country x conflict x ACTOR x day (UNIQUE posture_scores_actor_day_key
--      replaces posture_scores_pair_day_key); day order, first-row, no-change, evidence re-use / re-capture
--      and reverification rules all per actor; evidence_id must be evidence of the same country, conflict
--      AND actor.
--   5. viewer_posture_v2: same parameters, returns actor + actor_display_name (+ _ar) — the return type
--      changes, so the function is dropped and re-created (only when it still has the old shape) and
--      re-granted exactly as before (anon, authenticated, service_role; never PUBLIC). EG / AE / SA
--      withholding unchanged.
--
-- Data written: the two posture_actors seed rows only (plus the catalog-only actor default). Requires
-- 20261012091000_war_posture_v2.sql (preflight asserts it). Idempotent: a second run is a no-op (see
-- supabase/tests/posture_yemen_dual_actor_fingerprint.sql). ONE TRANSACTION. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261013090000_posture_yemen_dual_actor.sql
-- Tests: supabase/tests/posture_yemen_dual_actor_test.sql (+ run_posture_yemen_dual_actor_tests.sh).
-- NOTE: re-running the OLDER war_posture_v2 file after this one fails as a whole (its CREATE OR REPLACE of
-- viewer_posture_v2 cannot change the return type), so it can never silently re-install the
-- actor-blind validator. Migrations run once, in order.
-- NOT applied by the author.
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight ---------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regclass('public.posture_evidence') IS NULL OR to_regclass('public.posture_scores') IS NULL
     OR to_regclass('public.conflicts') IS NULL OR to_regclass('public.posture_publication_policy') IS NULL THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor preflight: posture_evidence / posture_scores / conflicts / posture_publication_policy missing (apply 20261012091000_war_posture_v2 first)';
  END IF;
  IF to_regprocedure('public.viewer_posture_v2(text,text,integer)') IS NULL
     OR to_regprocedure('public.posture_scores_validate()') IS NULL
     OR to_regprocedure('public.posture_is_withheld(text)') IS NULL
     OR to_regprocedure('public.posture_confidence_now(text,integer,integer)') IS NULL
     OR to_regprocedure('public.posture_decay_factor(integer,integer)') IS NULL
     OR to_regprocedure('public.posture_freshness(integer)') IS NULL
     OR to_regprocedure('public.posture_day_date(integer)') IS NULL
     OR to_regprocedure('public.posture_current_day()') IS NULL
     OR to_regprocedure('public.viewer_has_feature(text)') IS NULL
     OR to_regprocedure('public.trust_append_only_guard()') IS NULL THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor preflight: war_posture_v2 functions missing (apply 20261012091000_war_posture_v2 first)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.posture_scores'::regclass AND tgname = 'posture_scores_validate')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.posture_scores'::regclass AND tgname = 'posture_scores_append_only')
     OR NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid = 'public.posture_evidence'::regclass AND tgname = 'posture_evidence_append_only') THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor preflight: posture_scores_validate / append-only triggers missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.conflicts WHERE conflict_code = 'red-sea-houthi') THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor preflight: conflicts registry row red-sea-houthi missing';
  END IF;
END $pre$;

-- =====================================================================================================
-- §1 Actor registry
-- =====================================================================================================
CREATE TABLE IF NOT EXISTS public.posture_actors (
  country_code    text        NOT NULL,
  actor           text        NOT NULL,
  display_name    text        NOT NULL,
  display_name_ar text        NOT NULL,
  note            text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT posture_actors_pkey PRIMARY KEY (country_code, actor),
  CONSTRAINT posture_actors_cc_chk CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT posture_actors_actor_chk CHECK (actor IN ('government', 'de_facto_authority')),
  CONSTRAINT posture_actors_text_chk CHECK (length(btrim(display_name)) BETWEEN 1 AND 200 AND length(btrim(display_name_ar)) BETWEEN 1 AND 200
                                            AND COALESCE(length(note), 0) <= 2000)
);
COMMENT ON TABLE public.posture_actors IS
  'War Posture v2 actors per country. Every country is scored for its government (actor = government, the default, no row needed). A country listed here with actor = de_facto_authority also has a separate line for a de facto authority (Yemen: Ansar Allah / Houthi authorities in Sanaa). The lines are never merged. Rows are added by a reviewed migration only (locked: no UPDATE / DELETE).';

INSERT INTO public.posture_actors (country_code, actor, display_name, display_name_ar, note) VALUES
  ('YE', 'government', 'Government of Yemen (Presidential Leadership Council)', 'الحكومة اليمنية (مجلس القيادة الرئاسي)',
   'The internationally recognised government, seated in Aden. Default actor for Yemen: a row without an explicit actor is this line. Operator decision 2026-10-13.'),
  ('YE', 'de_facto_authority', 'Ansar Allah (Houthi) authorities, Sanaa', 'سلطات أنصار الله (الحوثيين) في صنعاء',
   'De facto authorities in Sanaa (Supreme Political Council), not internationally recognised. Shown as its own line, never merged with the government line. Saba (Sanaa) and Al-Masirah are party sources. Operator decision 2026-10-13.')
ON CONFLICT (country_code, actor) DO NOTHING;

DROP TRIGGER IF EXISTS posture_actors_locked ON public.posture_actors;
CREATE TRIGGER posture_actors_locked BEFORE UPDATE OR DELETE ON public.posture_actors
  FOR EACH ROW EXECUTE FUNCTION public.trust_append_only_guard();
ALTER TABLE public.posture_actors ENABLE ALWAYS TRIGGER posture_actors_locked;
DROP TRIGGER IF EXISTS posture_actors_no_truncate ON public.posture_actors;
CREATE TRIGGER posture_actors_no_truncate BEFORE TRUNCATE ON public.posture_actors
  FOR EACH STATEMENT EXECUTE FUNCTION public.trust_append_only_guard();
ALTER TABLE public.posture_actors ENABLE ALWAYS TRIGGER posture_actors_no_truncate;

-- 'government' is always allowed; any other actor only when registered for that country.
CREATE OR REPLACE FUNCTION public.posture_actor_registered(p_country text, p_actor text)
RETURNS boolean
LANGUAGE sql STABLE PARALLEL SAFE
SET search_path = ''
AS $fn$
  SELECT p_actor = 'government'
      OR EXISTS (SELECT 1 FROM public.posture_actors a WHERE a.country_code = p_country AND a.actor = p_actor)
$fn$;
COMMENT ON FUNCTION public.posture_actor_registered(text, text) IS
  'TRUE when the actor may be used for the country: government always; any other actor only when listed in posture_actors.';

-- =====================================================================================================
-- §2 actor column on posture_evidence and posture_scores (catalog-only default; existing rows = government)
-- =====================================================================================================
ALTER TABLE public.posture_evidence ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT 'government';
ALTER TABLE public.posture_scores   ADD COLUMN IF NOT EXISTS actor text NOT NULL DEFAULT 'government';
COMMENT ON COLUMN public.posture_evidence.actor IS
  'Whose voice the evidence is: government (default; the internationally recognised government) or de_facto_authority (only for countries registered in posture_actors, e.g. YE = Ansar Allah / Houthi authorities, Sanaa).';
COMMENT ON COLUMN public.posture_scores.actor IS
  'Which authority this line scores: government (default) or de_facto_authority (registered in posture_actors). Every rule is per country x conflict x actor; the lines are never merged into one number.';

DO $cols$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_evidence'::regclass AND conname = 'posture_evidence_actor_chk') THEN
    ALTER TABLE public.posture_evidence ADD CONSTRAINT posture_evidence_actor_chk CHECK (actor IN ('government', 'de_facto_authority'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_scores'::regclass AND conname = 'posture_scores_actor_chk') THEN
    ALTER TABLE public.posture_scores ADD CONSTRAINT posture_scores_actor_chk CHECK (actor IN ('government', 'de_facto_authority'));
  END IF;
  -- one row per country x conflict x actor x day (was: per country x conflict x day)
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_scores'::regclass AND conname = 'posture_scores_actor_day_key') THEN
    ALTER TABLE public.posture_scores ADD CONSTRAINT posture_scores_actor_day_key UNIQUE (country_code, conflict_code, actor, conflict_day, method_version);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_scores'::regclass AND conname = 'posture_scores_pair_day_key') THEN
    ALTER TABLE public.posture_scores DROP CONSTRAINT posture_scores_pair_day_key;
  END IF;
END $cols$;

CREATE INDEX IF NOT EXISTS posture_evidence_actor_pair_idx
  ON public.posture_evidence (country_code, conflict_code, actor, captured_at DESC);

-- Registry enforcement on evidence (posture_scores is enforced inside posture_scores_validate).
CREATE OR REPLACE FUNCTION public.posture_evidence_actor_check()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $fn$
BEGIN
  IF NOT public.posture_actor_registered(NEW.country_code, NEW.actor) THEN
    RAISE EXCEPTION 'posture_evidence: actor % is not registered for % (posture_actors) — only YE has a de_facto_authority line', NEW.actor, NEW.country_code
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
DROP TRIGGER IF EXISTS posture_evidence_actor_check ON public.posture_evidence;
CREATE TRIGGER posture_evidence_actor_check BEFORE INSERT OR UPDATE ON public.posture_evidence
  FOR EACH ROW EXECUTE FUNCTION public.posture_evidence_actor_check();
ALTER TABLE public.posture_evidence ENABLE ALWAYS TRIGGER posture_evidence_actor_check;

-- =====================================================================================================
-- §3 posture_scores_validate — every rule per country x conflict x ACTOR
-- =====================================================================================================
-- Same body as 20261012091000 with: the actor registry check, actor in every "pair" predicate, and the
-- evidence row required to be of the same actor.
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
  IF NOT public.posture_actor_registered(NEW.country_code, NEW.actor) THEN
    RAISE EXCEPTION 'posture_scores: actor % is not registered for % (posture_actors) — only YE has a de_facto_authority line', NEW.actor, NEW.country_code
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.conflict_day > public.posture_current_day() THEN
    RAISE EXCEPTION 'posture_scores: conflict_day % is in the future (DAY LOCK says today is Day %)', NEW.conflict_day, public.posture_current_day()
      USING ERRCODE = 'check_violation';
  END IF;
  -- as_of is the DAY LOCK date of conflict_day: otherwise a row filed under an old day could rest on
  -- evidence captured later (the "evidence after as_of" rule below is keyed on as_of).
  IF NEW.as_of IS DISTINCT FROM public.posture_day_date(NEW.conflict_day) THEN
    RAISE EXCEPTION 'posture_scores: as_of % is not the DAY LOCK date of conflict_day % (%)', NEW.as_of, NEW.conflict_day, public.posture_day_date(NEW.conflict_day)
      USING ERRCODE = 'check_violation';
  END IF;
  -- silence cannot have been checked through a time that has not happened yet.
  IF NEW.silence_checked_through IS NOT NULL AND NEW.silence_checked_through > now() + interval '10 minutes' THEN
    RAISE EXCEPTION 'posture_scores: silence_checked_through % is in the future', NEW.silence_checked_through
      USING ERRCODE = 'check_violation';
  END IF;
  -- rows are appended in day order per country x conflict x actor: an earlier-day insert would silently
  -- re-base the change_reason / no-change / "previous row" of every later row of that line.
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM public.posture_scores p
        WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.actor = NEW.actor
          AND p.method_version = NEW.method_version AND p.conflict_day >= NEW.conflict_day) THEN
    RAISE EXCEPTION 'posture_scores: %/%/% already has a row on or after Day % — rows are appended in day order only', NEW.country_code, NEW.conflict_code, NEW.actor, NEW.conflict_day
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
    IF ev.actor <> NEW.actor THEN
      RAISE EXCEPTION 'posture_scores: evidence % is the voice of actor %, not % — each authority''s line rests only on its own statements', ev.id, ev.actor, NEW.actor
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
   WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.actor = NEW.actor
     AND p.method_version = NEW.method_version AND p.conflict_day < NEW.conflict_day AND p.id <> NEW.id
   ORDER BY p.conflict_day DESC LIMIT 1;

  IF NOT FOUND THEN
    IF NEW.change_reason <> 'new_evidence' THEN
      RAISE EXCEPTION 'posture_scores: the first row for %/%/% must be change_reason new_evidence (got %)', NEW.country_code, NEW.conflict_code, NEW.actor, NEW.change_reason
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;

  IF prev.stance IS NOT DISTINCT FROM NEW.stance AND prev.label IS NOT DISTINCT FROM NEW.label
     AND prev.expressed_score IS NOT DISTINCT FROM NEW.expressed_score AND prev.defensive IS NOT DISTINCT FROM NEW.defensive
     AND prev.evidence_id IS NOT DISTINCT FROM NEW.evidence_id AND prev.confidence_base IS NOT DISTINCT FROM NEW.confidence_base
     AND prev.latent_low IS NOT DISTINCT FROM NEW.latent_low AND prev.latent_high IS NOT DISTINCT FROM NEW.latent_high THEN
    RAISE EXCEPTION 'posture_scores: no change vs Day % for %/%/% — carry forward (write no row)', prev.conflict_day, NEW.country_code, NEW.conflict_code, NEW.actor
      USING ERRCODE = 'check_violation';
  END IF;

  IF NEW.change_reason = 'new_evidence' AND EXISTS (
       SELECT 1 FROM public.posture_scores p
        WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.actor = NEW.actor AND p.method_version = NEW.method_version
          AND p.conflict_day < NEW.conflict_day AND p.evidence_id = NEW.evidence_id) THEN
    RAISE EXCEPTION 'posture_scores: evidence % was already used for %/%/% — a re-coding of it is change_reason reverification', NEW.evidence_id, NEW.country_code, NEW.conflict_code, NEW.actor
      USING ERRCODE = 'check_violation';
  END IF;
  -- a second capture of the same statement (same URL + same quote, whitespace/case-normalised) is not
  -- new evidence either: otherwise a re-coding could be laundered into a "biggest move".
  IF NEW.change_reason = 'new_evidence' AND NEW.evidence_id IS NOT NULL AND EXISTS (
       SELECT 1 FROM public.posture_scores p JOIN public.posture_evidence pe ON pe.id = p.evidence_id
        WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.actor = NEW.actor AND p.method_version = NEW.method_version
          AND p.conflict_day < NEW.conflict_day AND pe.id <> ev.id
          AND pe.source_url = ev.source_url
          AND regexp_replace(lower(btrim(pe.position_quote)), '\s+', ' ', 'g') = regexp_replace(lower(btrim(ev.position_quote)), '\s+', ' ', 'g')) THEN
    RAISE EXCEPTION 'posture_scores: evidence % re-captures a statement already used for %/%/% (same URL and quote) — a re-coding of it is change_reason reverification', NEW.evidence_id, NEW.country_code, NEW.conflict_code, NEW.actor
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.change_reason = 'reverification' AND NOT EXISTS (
       SELECT 1 FROM public.posture_scores p
        WHERE p.country_code = NEW.country_code AND p.conflict_code = NEW.conflict_code AND p.actor = NEW.actor AND p.method_version = NEW.method_version
          AND p.conflict_day < NEW.conflict_day AND p.evidence_id = NEW.evidence_id) THEN
    RAISE EXCEPTION 'posture_scores: reverification must re-code evidence already used for %/%/% (new evidence is change_reason new_evidence)', NEW.country_code, NEW.conflict_code, NEW.actor
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.change_reason = 'nulled' AND prev.stance = 'nulled' THEN
    RAISE EXCEPTION 'posture_scores: %/%/% is already nulled', NEW.country_code, NEW.conflict_code, NEW.actor USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END $fn$;
-- (trigger posture_scores_validate from 20261012091000 already points at this function; re-asserted below)
ALTER TABLE public.posture_scores ENABLE ALWAYS TRIGGER posture_scores_validate;

-- =====================================================================================================
-- §4 viewer_posture_v2 — per country x conflict x actor
-- =====================================================================================================
-- The return type gains actor / actor_display_name / actor_display_name_ar, so the old shape is dropped
-- first (CREATE OR REPLACE cannot change a return type). Only when it still has the old shape: a re-run
-- keeps the function (and its OID, ACL) as is.
DO $drop$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE oid = 'public.viewer_posture_v2(text,text,integer)'::regprocedure
                AND NOT ('actor' = ANY (proargnames))) THEN
    DROP FUNCTION public.viewer_posture_v2(text, text, integer);
  END IF;
END $drop$;

-- Lines = every country x conflict x actor with a score row or a captured evidence row on or before the
-- day. A line with neither is not returned. stance values returned:
--   position | deliberate_silence | nulled — the coded row
--   uncoded  — evidence captured, not coded yet (no score)
--   withheld — country under posture_publication_policy: evidence only, every graded field NULL
-- actor_display_name: posture_actors.display_name when the country has registered actors (YE), else NULL
-- (the UI shows the country name).
CREATE OR REPLACE FUNCTION public.viewer_posture_v2(
  p_conflict text    DEFAULT NULL,
  p_country  text    DEFAULT NULL,
  p_day      integer DEFAULT NULL)
RETURNS TABLE (
  country_code text, conflict_code text,
  actor text, actor_display_name text, actor_display_name_ar text,
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
    SELECT DISTINCT ON (ps.country_code, ps.conflict_code, ps.actor) ps.*
      FROM public.posture_scores ps CROSS JOIN ref
     WHERE ps.method_version = 'war-posture-v2'
       AND ps.conflict_day <= ref.d
       AND (p_conflict IS NULL OR ps.conflict_code = lower(btrim(p_conflict)))
       AND (p_country  IS NULL OR ps.country_code  = upper(btrim(p_country)))
     ORDER BY ps.country_code, ps.conflict_code, ps.actor, ps.conflict_day DESC
  ),
  e AS (
    SELECT DISTINCT ON (pe.country_code, pe.conflict_code, pe.actor) pe.*
      FROM public.posture_evidence pe CROSS JOIN ref
     WHERE timezone('UTC', pe.captured_at)::date <= ref.ref_date
       AND (p_conflict IS NULL OR pe.conflict_code = lower(btrim(p_conflict)))
       AND (p_country  IS NULL OR pe.country_code  = upper(btrim(p_country)))
     ORDER BY pe.country_code, pe.conflict_code, pe.actor, coalesce(pe.stated_at, pe.captured_at) DESC, pe.captured_at DESC, pe.id
  ),
  pairs AS (
    SELECT s.country_code, s.conflict_code, s.actor FROM s
    UNION
    SELECT e.country_code, e.conflict_code, e.actor FROM e
  )
  SELECT p.country_code, p.conflict_code,
         p.actor, pa.display_name, pa.display_name_ar,
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
    LEFT JOIN public.posture_actors pa ON pa.country_code = p.country_code AND pa.actor = p.actor
    LEFT JOIN s ON s.country_code = p.country_code AND s.conflict_code = p.conflict_code AND s.actor = p.actor
    LEFT JOIN e ON e.country_code = p.country_code AND e.conflict_code = p.conflict_code AND e.actor = p.actor
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
       WHERE s.id IS NOT NULL AND q.country_code = s.country_code AND q.conflict_code = s.conflict_code AND q.actor = s.actor
         AND q.method_version = s.method_version AND q.conflict_day < s.conflict_day
       ORDER BY q.conflict_day DESC LIMIT 1
    ) pv ON true
   ORDER BY p.conflict_code, p.country_code, (p.actor <> 'government'), p.actor
$fn$;
COMMENT ON FUNCTION public.viewer_posture_v2(text, text, integer) IS
  'War Posture v2 for the calling JWT (anon = free): per country x conflict x ACTOR (government, or a registered de facto authority — Yemen has both, never merged), the latest posture_scores row on or before p_day (default today, DAY LOCK) carried forward, its evidence, decayed confidence and the previous row of the same line. Latent band / gap / category gated by tier_features exactly like viewer_nai_v2. Countries in posture_publication_policy: stance ''withheld'', evidence only. SECURITY DEFINER by design (posture_scores has no API grants).';

-- =====================================================================================================
-- §5 Grants + RLS
-- =====================================================================================================
REVOKE ALL ON public.posture_actors FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.posture_actors TO anon, authenticated, service_role;
ALTER TABLE public.posture_actors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS posture_actors_public_read ON public.posture_actors;
CREATE POLICY posture_actors_public_read ON public.posture_actors AS PERMISSIVE FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS posture_actors_service_read ON public.posture_actors;
CREATE POLICY posture_actors_service_read ON public.posture_actors AS PERMISSIVE FOR SELECT TO service_role USING (true);

-- viewer_posture_v2 re-granted exactly as 20261012091000 did; posture_actor_registered is a pure helper
-- (callable by the API roles, needed by the writer's triggers); the trigger function is callable by no one.
REVOKE ALL ON FUNCTION public.viewer_posture_v2(text, text, integer), public.posture_actor_registered(text, text),
                       public.posture_evidence_actor_check(), public.posture_scores_validate()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.viewer_posture_v2(text, text, integer), public.posture_actor_registered(text, text)
  TO anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.posture_evidence_actor_check() FROM service_role;

-- =====================================================================================================
-- §6 Post-condition asserts (abort the whole migration if any fails)
-- =====================================================================================================
DO $post$
BEGIN
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN ('posture_evidence', 'posture_scores')
         AND column_name = 'actor' AND is_nullable = 'NO' AND column_default = '''government''::text') <> 2 THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: actor columns missing / nullable / wrong default';
  END IF;
  IF (SELECT count(*) FROM public.posture_actors WHERE country_code = 'YE' AND actor IN ('government', 'de_facto_authority')) <> 2 THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: YE actor rows missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.posture_evidence WHERE NOT public.posture_actor_registered(country_code, actor))
     OR EXISTS (SELECT 1 FROM public.posture_scores WHERE NOT public.posture_actor_registered(country_code, actor))
     OR EXISTS (SELECT 1 FROM public.posture_scores s JOIN public.posture_evidence e ON e.id = s.evidence_id WHERE e.actor <> s.actor) THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: a row names an unregistered actor or rests on another actor''s evidence';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_scores'::regclass AND conname = 'posture_scores_actor_day_key'
                    AND pg_get_constraintdef(oid) = 'UNIQUE (country_code, conflict_code, actor, conflict_day, method_version)')
     OR EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.posture_scores'::regclass AND conname = 'posture_scores_pair_day_key') THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: per-actor day key not in place';
  END IF;
  IF (SELECT count(*) FROM pg_trigger WHERE tgenabled = 'A' AND (
        (tgrelid = 'public.posture_evidence'::regclass AND tgname = 'posture_evidence_actor_check')
     OR (tgrelid = 'public.posture_scores'::regclass AND tgname = 'posture_scores_validate')
     OR (tgrelid = 'public.posture_actors'::regclass AND tgname IN ('posture_actors_locked', 'posture_actors_no_truncate')))) <> 4 THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: actor triggers missing or not ENABLE ALWAYS';
  END IF;
  IF to_regprocedure('public.viewer_posture_v2(text,text,integer)') IS NULL
     OR NOT (SELECT proargnames @> ARRAY['actor', 'actor_display_name', 'actor_display_name_ar'] FROM pg_proc WHERE oid = 'public.viewer_posture_v2(text,text,integer)'::regprocedure)
     OR NOT (SELECT prosecdef FROM pg_proc WHERE oid = 'public.viewer_posture_v2(text,text,integer)'::regprocedure)
     OR NOT has_function_privilege('anon', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE')
     OR NOT has_function_privilege('service_role', 'public.viewer_posture_v2(text,text,integer)', 'EXECUTE')
     OR EXISTS (SELECT 1 FROM pg_proc p, aclexplode(p.proacl) a WHERE p.oid = 'public.viewer_posture_v2(text,text,integer)'::regprocedure AND a.grantee = 0)
     OR has_function_privilege('anon', 'public.posture_evidence_actor_check()', 'EXECUTE')
     OR has_function_privilege('anon', 'public.posture_scores_validate()', 'EXECUTE') THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: viewer_posture_v2 shape / grants not as intended';
  END IF;
  IF NOT has_table_privilege('anon', 'public.posture_actors', 'SELECT')
     OR has_table_privilege('anon', 'public.posture_actors', 'INSERT')
     OR has_table_privilege('service_role', 'public.posture_actors', 'INSERT')
     OR has_table_privilege('service_role', 'public.posture_actors', 'DELETE')
     OR has_table_privilege('anon', 'public.posture_scores', 'SELECT')
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.posture_actors'::regclass) THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: posture_actors / posture_scores privilege matrix not as intended';
  END IF;
  IF (SELECT count(*) FROM public.posture_publication_policy WHERE country_code IN ('EG', 'AE', 'SA')) <> 3 THEN
    RAISE EXCEPTION 'posture_yemen_dual_actor post-check: EG / AE / SA policy rows missing';
  END IF;
END $post$;

NOTIFY pgrst, 'reload schema';

COMMIT;
