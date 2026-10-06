-- Migration 20261007100000: scenario_registry — dynamic scenarios (born, rise, fade, retire)
--
-- NOT APPLIED by the author. Architect deliverable for review by the lead (Wave 1, W2).
-- Depends on production objects: admin_users, detected_scenarios (+ enum scenario_detection_status),
-- platform_alerts, scenario_probabilities, update_updated_at(). Target: PostgreSQL 15+ (prod 17.6).
--
-- OPERATOR RULINGS ENCODED HERE (2026-10-06, binding)
--   R1 "dont accept any invented claim": every probability stores its inputs. Rows of a
--      market-anchored method without a run, a horizon and a valid non-empty input list are
--      REJECTED by CHECK. Operator overrides must reference an override record carrying
--      reason + admin. The legacy method is only accepted for Days 1-35 rows imported from
--      scenario_probabilities, and only inside the import transaction.
--   R2 Scenarios are dynamic. Birth = operator approval of a detected_scenarios candidate
--      (>=2 independent non-party sources + new actor/instrument) or of a market-proposed
--      candidate. RETIREMENT: probability BELOW 10% for 14 CONSECUTIVE conflict days -> fading
--      (automatic) -> retired (operator confirmation only). A resolved defining market/condition
--      -> fading immediately. Fading -> active again if it recovers to >= 10%. Retired is
--      terminal and stays visible.
--   R3 Probabilities by Claude ONLY via the market-anchored method; operator override at
--      input level (reclassify/exclude a market -> recompute, stamped "+override:<id>") or
--      output level (numbers + reason, method 'operator-override'; computed rows kept).
--   R4 A-D are a mutually exclusive set summing to exactly 100 (group 'core', enforced at
--      COMMIT by a deferred constraint trigger); E is independent/overlapping (group
--      'independent', no sum).
--   R5 Historical Days 1-35 and 221 are migrated WITHOUT altering values; the existing
--      table keeps serving every current reader (see section 9: sync + compatibility view).
--
-- Session settings used as transaction-local guards (set_config(..., true)):
--   app.lifecycle_txn = 'on'   only scenario_transition()/scenario_promote_candidate() may change scenarios.status
--   app.legacy_import = 'on'   only the import block may write method 'legacy-desk-v0'
--   app.scenario_sync = 'on'   set by the sync trigger before writing scenario_probabilities
--   app.registry_import = 'on' import of an already-published day: keeps the supplied recorded_at
--                              (otherwise recorded_at is forced to now(), so provenance cannot be backdated)

SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------------------
-- 0. Helpers (pure, IMMUTABLE — usable in CHECK constraints)
-- ---------------------------------------------------------------------------

-- Lower-cased host of an http(s) URL without a leading "www.". NULL if not a URL.
CREATE OR REPLACE FUNCTION public.url_host(u text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT regexp_replace(lower(substring(u FROM '^https?://([^/:?#[:space:]]+)')), '^www\.', '')
$$;

-- One element of a market-anchored input list. Two shapes are accepted:
--  (a) market reading (the shape of data/scenario-evidence/day-221/scenario_d221.json "inputs"):
--      venue, question, url (http/s), read_at, probability (0..1 number), used (boolean);
--      used=false requires a non-empty excluded_reason; used=true requires numeric yes_bid/yes_ask.
--  (b) derived step: {"kind":"derived","rule":<non-empty text>,"from":[<non-empty array>]}
--      e.g. B = 1 - A - C - D, or "no passing proxy -> 0 (method 1.9)".
CREATE OR REPLACE FUNCTION public.scenario_input_element_valid(el jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT coalesce(
    jsonb_typeof(el) = 'object' AND (
      (     el ->> 'kind' = 'derived'
        AND jsonb_typeof(el -> 'rule') = 'string' AND length(btrim(el ->> 'rule')) > 0
        AND jsonb_typeof(el -> 'from') = 'array'  AND jsonb_array_length(el -> 'from') >= 1)
      OR
      (     coalesce(el ->> 'kind', 'market') = 'market'
        AND jsonb_typeof(el -> 'venue') = 'string'    AND length(btrim(el ->> 'venue')) > 0
        AND jsonb_typeof(el -> 'question') = 'string' AND length(btrim(el ->> 'question')) > 0
        AND jsonb_typeof(el -> 'url') = 'string'      AND (el ->> 'url') ~* '^https?://[^[:space:]]+$'
        AND jsonb_typeof(el -> 'read_at') = 'string'  AND length(btrim(el ->> 'read_at')) > 0
        AND jsonb_typeof(el -> 'probability') = 'number'
        AND (el ->> 'probability')::numeric BETWEEN 0 AND 1
        AND jsonb_typeof(el -> 'used') = 'boolean'
        AND CASE WHEN (el ->> 'used')::boolean
                 THEN jsonb_typeof(el -> 'yes_bid') = 'number' AND jsonb_typeof(el -> 'yes_ask') = 'number'
                 ELSE jsonb_typeof(el -> 'excluded_reason') = 'string' AND length(btrim(el ->> 'excluded_reason')) > 0
            END)
    ), false)
$$;

-- Whole input list: non-empty array, every element valid; when require_basis, at least one
-- element is a USED market reading or a derived step (a number with nothing behind it is rejected).
CREATE OR REPLACE FUNCTION public.scenario_inputs_valid(inputs jsonb, require_basis boolean)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT jsonb_typeof(inputs) = 'array'
     AND jsonb_array_length(inputs) >= 1
     AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(inputs) x(el)
                     WHERE NOT public.scenario_input_element_valid(x.el))
     AND (NOT require_basis OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(inputs) x(el)
           WHERE x.el ->> 'kind' = 'derived'
              OR (coalesce(x.el ->> 'kind', 'market') = 'market' AND (x.el ->> 'used') = 'true')))
$$;

-- Birth evidence (R2).
--  origin 'detected': {"sources":[{name,url,published_at,claim,party_source:false},...],
--                      "new_actor": text|null, "new_instrument": text|null}
--      >= 2 independent (party_source=false) sources on >= 2 distinct hosts,
--      and a non-empty new_actor or new_instrument.
--  origin 'market':   {"markets":[{venue,question,url,read_at},...], "sources":[...optional]}
--      >= 1 market with venue, question, http(s) url, read_at.
CREATE OR REPLACE FUNCTION public.scenario_birth_evidence_valid(origin text, ev jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT coalesce(CASE origin
    WHEN 'detected' THEN
          jsonb_typeof(ev) = 'object'
      AND jsonb_typeof(ev -> 'sources') = 'array'
      AND (SELECT count(DISTINCT public.url_host(x.el ->> 'url'))
             FROM jsonb_array_elements(ev -> 'sources') x(el)
            WHERE jsonb_typeof(x.el) = 'object'
              AND (x.el ->> 'party_source') = 'false'
              AND (x.el ->> 'url') ~* '^https?://[^[:space:]]+$'
              AND length(btrim(coalesce(x.el ->> 'name', ''))) > 0
              AND length(btrim(coalesce(x.el ->> 'claim', ''))) > 0
              AND length(btrim(coalesce(x.el ->> 'published_at', ''))) > 0) >= 2
      AND (length(btrim(coalesce(ev ->> 'new_actor', ''))) > 0
           OR length(btrim(coalesce(ev ->> 'new_instrument', ''))) > 0)
    WHEN 'market' THEN
          jsonb_typeof(ev) = 'object'
      AND jsonb_typeof(ev -> 'markets') = 'array'
      AND EXISTS (SELECT 1 FROM jsonb_array_elements(ev -> 'markets') x(el)
                   WHERE length(btrim(coalesce(x.el ->> 'venue', ''))) > 0
                     AND length(btrim(coalesce(x.el ->> 'question', ''))) > 0
                     AND (x.el ->> 'url') ~* '^https?://[^[:space:]]+$'
                     AND length(btrim(coalesce(x.el ->> 'read_at', ''))) > 0)
    ELSE false END, false)
$$;

-- Provenance cut-off for a conflict day: 06:00 UTC on the calendar day after it (Day 1 = 2026-02-28).
-- Explicit UTC so the result never depends on the session TimeZone.
CREATE OR REPLACE FUNCTION public.conflict_day_cutoff(p_day integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT ((date '2026-02-28' + p_day)::timestamp AT TIME ZONE 'UTC') + interval '6 hours'
$$;
CREATE OR REPLACE FUNCTION public.provenance_for(p_day integer, p_recorded timestamptz)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT CASE WHEN p_recorded < public.conflict_day_cutoff(p_day) THEN 'contemporaneous' ELSE 'reconstructed' END
$$;

-- Generic: jsonb is a non-empty array or a non-empty object.
CREATE OR REPLACE FUNCTION public.jsonb_nonempty(j jsonb)
RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT coalesce((jsonb_typeof(j) = 'array'  AND jsonb_array_length(j) > 0)
               OR (jsonb_typeof(j) = 'object' AND j <> '{}'::jsonb), false)
$$;

-- Generic trigger: reject UPDATE/DELETE (append-only logs).
CREATE OR REPLACE FUNCTION public.reject_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION '% on %.% is not allowed (append-only / retention-safe table)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $$;

-- ---------------------------------------------------------------------------
-- 1. scenario_groups — exclusive set (sum constraint) vs independent scenarios
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_groups (
  code                   text PRIMARY KEY,
  name_en                text NOT NULL,
  name_ar                text,
  kind                   text NOT NULL,
  sum_target             numeric(6,3),
  fade_threshold_pct     numeric(6,3) NOT NULL DEFAULT 10,
  fade_consecutive_days  integer      NOT NULL DEFAULT 14,
  description            text NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenario_groups_code_chk      CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'),
  CONSTRAINT scenario_groups_kind_chk      CHECK (kind IN ('exclusive', 'independent')),
  CONSTRAINT scenario_groups_sum_iff_excl  CHECK ((kind = 'exclusive') = (sum_target IS NOT NULL)),
  CONSTRAINT scenario_groups_sum_range     CHECK (sum_target IS NULL OR (sum_target > 0 AND sum_target <= 100)),
  CONSTRAINT scenario_groups_fade_thr      CHECK (fade_threshold_pct > 0 AND fade_threshold_pct < 100),
  CONSTRAINT scenario_groups_fade_days     CHECK (fade_consecutive_days >= 1)
);
COMMENT ON TABLE public.scenario_groups IS
  'Scenario sets. exclusive: members are mutually exclusive outcomes; published probabilities of live members sum to sum_target on every published day (deferred check). independent: overlapping, no sum. Fade rule per group: below fade_threshold_pct for fade_consecutive_days consecutive conflict days (operator ruling 2026-10-06: 10% / 14 days).';

INSERT INTO public.scenario_groups (code, name_en, kind, sum_target, fade_threshold_pct, fade_consecutive_days, description) VALUES
  ('core', 'Core outcome set', 'exclusive', 100, 10, 14,
   'Mutually exclusive outcomes over the method horizon; A-D at creation. Members sum to exactly 100.'),
  ('independent', 'Independent scenarios', 'independent', NULL, 10, 14,
   'Overlapping sub-branch scenarios outside the 100 (E UAE Direct Strike at creation).')
ON CONFLICT (code) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. scenario_methods — the fixed, published mappings
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_methods (
  method_version  text PRIMARY KEY,
  family          text NOT NULL,
  description     text NOT NULL,
  spec_ref        text NOT NULL,
  code_ref        text,
  published_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenario_methods_version_chk CHECK (method_version ~ '^[a-z0-9][a-z0-9._-]{2,63}$'),
  CONSTRAINT scenario_methods_family_chk  CHECK (family IN ('market-anchored', 'operator-override', 'legacy-desk')),
  CONSTRAINT scenario_methods_family_prefix CHECK (method_version LIKE family || '%')
);
COMMENT ON TABLE public.scenario_methods IS
  'Registered probability methods. A new mapping = a new method_version row (never edit a published one).';

INSERT INTO public.scenario_methods (method_version, family, description, spec_ref, code_ref, published_at) VALUES
  ('legacy-desk-v0', 'legacy-desk',
   'Fixed A-E desk/pipeline estimates written for Days 1-35 before the registry. Inputs were not stored; values are imported unchanged and cannot be reproduced. Accepted for conflict_day 1-35 import only.',
   'scenario_probabilities rows Days 1-35 as of migration 20261007100000', NULL, '2026-04-03 07:01:57+00'),
  ('market-anchored-v1', 'market-anchored',
   'Market-anchored v1: class probability = highest qualifying proxy (mid of YES bid/ask; floor spread<=0.05, liquidity>=$10k, volume>=$10k, resolution=H); C via Hormuz gate; B residual; precedence D>C>A>B; Hamilton rounding; E independent, NULL if no proxy passes.',
   'scenario_method.md (market-anchored-v1) sha256:f5268bbe9b249c50570857a5441e69709366fe5b007f44d631ace095a1816e70',
   'compute_d221.py sha256:db31cd791d45fadbe10ba61929c574cf7b80522e54b901100e0a4879e96c3437 (to be committed to the repo by W2 builder)',
   '2026-10-06 16:15:00+00'),
  ('operator-override', 'operator-override',
   'Output-level operator override: numbers supplied by the operator with reason; the computed rows stay stored and unpublished.',
   'scenario_method.md section 1.10 (output level)', NULL, '2026-10-06 16:15:00+00')
ON CONFLICT (method_version) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. scenarios — the registry
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenarios (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                    text NOT NULL UNIQUE,
  group_code              text NOT NULL REFERENCES public.scenario_groups(code),
  legacy_column           text UNIQUE,
  name_en                 text NOT NULL,
  name_ar                 text,
  definition_en           text NOT NULL,
  definition_ar           text,
  status                  text NOT NULL,
  origin                  text NOT NULL,
  born_day                integer NOT NULL,
  fading_since_day        integer,
  retired_day             integer,
  detected_scenario_id    uuid UNIQUE REFERENCES public.detected_scenarios(id),
  supersedes_scenario_id  uuid REFERENCES public.scenarios(id),
  display_order           integer NOT NULL DEFAULT 100,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenarios_code_chk        CHECK (code ~ '^[A-Z][A-Z0-9_]{0,15}$'),
  CONSTRAINT scenarios_legacy_col_chk  CHECK (legacy_column IS NULL OR legacy_column IN ('scenario_a','scenario_b','scenario_c','scenario_d','scenario_e')),
  CONSTRAINT scenarios_legacy_only_fixed CHECK (legacy_column IS NULL OR origin = 'legacy_fixed'),
  CONSTRAINT scenarios_status_chk      CHECK (status IN ('active', 'fading', 'retired')),
  CONSTRAINT scenarios_origin_chk      CHECK (origin IN ('legacy_fixed', 'detected', 'market')),
  CONSTRAINT scenarios_detected_ref    CHECK (origin = 'legacy_fixed' OR detected_scenario_id IS NOT NULL),
  CONSTRAINT scenarios_definition_len  CHECK (length(btrim(definition_en)) >= 20),
  CONSTRAINT scenarios_born_chk        CHECK (born_day >= 1),
  CONSTRAINT scenarios_status_days     CHECK (
       (status = 'active'  AND fading_since_day IS NULL AND retired_day IS NULL)
    OR (status = 'fading'  AND fading_since_day IS NOT NULL AND retired_day IS NULL)
    OR (status = 'retired' AND retired_day IS NOT NULL)),
  CONSTRAINT scenarios_day_order       CHECK ((fading_since_day IS NULL OR fading_since_day >= born_day)
                                          AND (retired_day IS NULL OR retired_day > born_day))
);
COMMENT ON TABLE public.scenarios IS
  'Scenario registry. status changes ONLY via scenario_transition()/scenario_promote_candidate() (guard trigger). retired_day = first conflict day with no reading; retired rows stay forever.';
COMMENT ON COLUMN public.scenarios.legacy_column IS 'Column of scenario_probabilities this scenario feeds (A-E only). NULL for every scenario born after the registry.';
COMMENT ON COLUMN public.scenarios.origin IS 'legacy_fixed = A-E carried over; detected = approved detected_scenarios candidate (evidence rule); market = approved market-proposed candidate.';

CREATE INDEX IF NOT EXISTS idx_scenarios_status ON public.scenarios (status, display_order);

DROP TRIGGER IF EXISTS scenarios_updated_at ON public.scenarios;
CREATE TRIGGER scenarios_updated_at BEFORE UPDATE ON public.scenarios
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Guard: lifecycle columns and identity can only change inside the lifecycle functions.
CREATE OR REPLACE FUNCTION public.scenarios_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scenarios rows are never deleted (retire instead)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.status <> 'active' THEN
      RAISE EXCEPTION 'a scenario is born active';
    END IF;
    IF current_setting('app.lifecycle_txn', true) IS DISTINCT FROM 'on' THEN
      RAISE EXCEPTION 'insert scenarios only via scenario_promote_candidate() (or the registry migration)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
    RETURN NEW;
  END IF;
  IF (NEW.status, NEW.fading_since_day, NEW.retired_day, NEW.born_day, NEW.group_code, NEW.code, NEW.legacy_column, NEW.origin)
     IS DISTINCT FROM
     (OLD.status, OLD.fading_since_day, OLD.retired_day, OLD.born_day, OLD.group_code, OLD.code, OLD.legacy_column, OLD.origin)
     AND current_setting('app.lifecycle_txn', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'scenario lifecycle/identity columns change only via scenario_transition()'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD.status = 'retired' AND NEW.status <> 'retired' THEN
    RAISE EXCEPTION 'retired is terminal; re-birth a new scenario with supersedes_scenario_id';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenarios_guard ON public.scenarios;
CREATE TRIGGER scenarios_guard BEFORE INSERT OR UPDATE OR DELETE ON public.scenarios
  FOR EACH ROW EXECUTE FUNCTION public.scenarios_guard();

-- ---------------------------------------------------------------------------
-- 4. scenario_markets — market <-> scenario links (role, active window, weight)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_markets (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id            uuid NOT NULL REFERENCES public.scenarios(id),
  venue                  text NOT NULL,
  market_key             text NOT NULL,
  question               text NOT NULL,
  url                    text NOT NULL,
  api_url                text,
  role                   text NOT NULL,
  transform              text NOT NULL DEFAULT 'identity',
  same_event_key         text,
  venue_weight           numeric(4,2) NOT NULL,
  resolves_at            timestamptz,
  valid_from_day         integer NOT NULL,
  valid_to_day           integer,
  link_status            text NOT NULL DEFAULT 'proposed',
  proposed_by            text NOT NULL,
  proposal_reason        text NOT NULL,
  approved_by            uuid REFERENCES public.admin_users(id),
  approved_at            timestamptz,
  fade_on_outcome        text,
  resolved_outcome       text,
  resolved_at            timestamptz,
  resolution_source_url  text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenario_markets_venue_chk   CHECK (venue IN ('Polymarket','Kalshi','PredictIt','Metaculus','Good Judgment Open','Manifold')),
  CONSTRAINT scenario_markets_url_chk     CHECK (url ~* '^https?://[^[:space:]]+$' AND (api_url IS NULL OR api_url ~* '^https?://[^[:space:]]+$')),
  CONSTRAINT scenario_markets_role_chk    CHECK (role IN ('class_proxy', 'gate', 'defining_condition', 'context')),
  CONSTRAINT scenario_markets_transform   CHECK (transform IN ('identity', 'complement')),
  CONSTRAINT scenario_markets_weight_chk  CHECK (venue_weight > 0 AND venue_weight <= 1),
  CONSTRAINT scenario_markets_window_chk  CHECK (valid_from_day >= 1 AND (valid_to_day IS NULL OR valid_to_day >= valid_from_day)),
  CONSTRAINT scenario_markets_status_chk  CHECK (link_status IN ('proposed', 'approved', 'rejected', 'ended')),
  CONSTRAINT scenario_markets_approval    CHECK (link_status NOT IN ('approved', 'ended') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)),
  CONSTRAINT scenario_markets_reason_chk  CHECK (length(btrim(proposal_reason)) >= 5),
  -- coalesce(..., false): a CHECK that evaluates to NULL passes, so every nullable comparison is closed.
  CONSTRAINT scenario_markets_defining    CHECK (role <> 'defining_condition' OR coalesce(fade_on_outcome IN ('yes', 'no', 'any'), false)),
  CONSTRAINT scenario_markets_fade_only_defining CHECK (fade_on_outcome IS NULL OR role = 'defining_condition'),
  CONSTRAINT scenario_markets_resolution  CHECK (coalesce(
       (resolved_outcome IS NULL AND resolved_at IS NULL AND resolution_source_url IS NULL)
    OR (resolved_outcome IN ('yes', 'no', 'void') AND resolved_at IS NOT NULL
        AND resolution_source_url ~* '^https?://[^[:space:]]+$'), false)),
  CONSTRAINT scenario_markets_key UNIQUE (scenario_id, venue, market_key, role, valid_from_day)
);
COMMENT ON TABLE public.scenario_markets IS
  'Which market feeds which scenario, in which role, over which conflict-day window. Only link_status=approved rows are used by the method. A reclassification is a NEW row (old row valid_to_day set, status ended); history is never rewritten. venue_weight per method: real-money 1.0, Metaculus/GJO 0.5, Manifold 0.2.';
COMMENT ON COLUMN public.scenario_markets.transform IS 'complement: event probability = 1 - YES mid (e.g. "ceasefire continues" contracts).';
COMMENT ON COLUMN public.scenario_markets.fade_on_outcome IS 'defining_condition only: resolution outcome that ends the scenario (-> fading immediately).';

CREATE INDEX IF NOT EXISTS idx_scenario_markets_active ON public.scenario_markets (scenario_id, link_status, valid_from_day);
CREATE INDEX IF NOT EXISTS idx_scenario_markets_resolved_defining ON public.scenario_markets (scenario_id)
  WHERE role = 'defining_condition' AND resolved_at IS NOT NULL;

DROP TRIGGER IF EXISTS scenario_markets_updated_at ON public.scenario_markets;
CREATE TRIGGER scenario_markets_updated_at BEFORE UPDATE ON public.scenario_markets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
DROP TRIGGER IF EXISTS scenario_markets_no_delete ON public.scenario_markets;
CREATE TRIGGER scenario_markets_no_delete BEFORE DELETE ON public.scenario_markets
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

-- ---------------------------------------------------------------------------
-- 5. scenario_overrides — operator overrides (input or output level), immutable
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text NOT NULL,
  group_code      text REFERENCES public.scenario_groups(code),
  valid_from_day  integer NOT NULL,
  valid_to_day    integer,
  payload         jsonb NOT NULL,
  reason          text NOT NULL,
  admin_id        uuid NOT NULL REFERENCES public.admin_users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenario_overrides_kind_chk    CHECK (kind IN ('input', 'output')),
  CONSTRAINT scenario_overrides_reason_chk  CHECK (length(btrim(reason)) >= 10),
  CONSTRAINT scenario_overrides_payload_chk CHECK (jsonb_typeof(payload) = 'object' AND payload <> '{}'::jsonb),
  CONSTRAINT scenario_overrides_window_chk  CHECK (valid_from_day >= 1 AND (valid_to_day IS NULL OR valid_to_day >= valid_from_day)),
  CONSTRAINT scenario_overrides_output_day  CHECK (kind <> 'output' OR coalesce(valid_to_day = valid_from_day AND group_code IS NOT NULL
                                                   AND jsonb_typeof(payload -> 'values') = 'object', false)),
  CONSTRAINT scenario_overrides_input_shape CHECK (kind <> 'input' OR (payload ?| ARRAY['exclude', 'reclassify', 'params']))
);
COMMENT ON TABLE public.scenario_overrides IS
  'Operator overrides (method 1.10). input: payload {exclude:[market_key..], reclassify:[{market_key, to_code}], params:{...}} applied by the job for valid_from..valid_to; rows computed under it carry override_id and display as "<method>+override:<id8>". output: payload {values:{"A":n,...}} for one day+group; applied by scenario_apply_output_override(). Immutable except closing valid_to_day once.';

CREATE OR REPLACE FUNCTION public.scenario_overrides_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scenario_overrides rows are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'valid_to_day') IS DISTINCT FROM (to_jsonb(OLD) - 'valid_to_day')
     OR OLD.valid_to_day IS NOT NULL THEN
    RAISE EXCEPTION 'scenario_overrides is immutable; only an open valid_to_day may be closed once'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenario_overrides_guard ON public.scenario_overrides;
CREATE TRIGGER scenario_overrides_guard BEFORE UPDATE OR DELETE ON public.scenario_overrides
  FOR EACH ROW EXECUTE FUNCTION public.scenario_overrides_guard();

-- ---------------------------------------------------------------------------
-- 6. scenario_runs — one computation (all scenarios, one day), full input table
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_runs (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conflict_day     integer NOT NULL,
  method_version   text NOT NULL REFERENCES public.scenario_methods(method_version),
  override_id      uuid REFERENCES public.scenario_overrides(id),
  horizon_end      date,
  read_started_at  timestamptz,
  read_finished_at timestamptz,
  code_ref         text NOT NULL,
  evidence_ref     text NOT NULL,
  inputs           jsonb NOT NULL,
  computed         jsonb,
  verdict          text NOT NULL,
  flags            text[] NOT NULL DEFAULT '{}',
  created_by       text NOT NULL,
  provenance       text NOT NULL,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT scenario_runs_day_chk        CHECK (conflict_day >= 1),
  CONSTRAINT scenario_runs_verdict_chk    CHECK (verdict IN ('PUBLISH', 'PUBLISH_WITH_FLAG', 'KEEP_FROZEN')),
  CONSTRAINT scenario_runs_provenance_chk CHECK (provenance = public.provenance_for(conflict_day, recorded_at)),
  CONSTRAINT scenario_runs_read_order     CHECK (read_finished_at IS NULL OR coalesce(read_finished_at >= read_started_at, false)),
  CONSTRAINT scenario_runs_market_sourced CHECK (method_version NOT LIKE 'market-anchored-%' OR (
        public.scenario_inputs_valid(inputs, false)
    AND horizon_end IS NOT NULL AND read_started_at IS NOT NULL AND read_finished_at IS NOT NULL
    AND length(btrim(code_ref)) > 0 AND length(btrim(evidence_ref)) > 0)),
  CONSTRAINT scenario_runs_not_override   CHECK (method_version <> 'operator-override'),
  CONSTRAINT scenario_runs_input_override CHECK (override_id IS NULL OR method_version LIKE 'market-anchored-%')
);
COMMENT ON TABLE public.scenario_runs IS
  'One method run for one conflict day: the FULL input table (used, excluded, context), verdict, code and evidence references. A verifier recomputes the published numbers from inputs + method_version; the result must be identical. Immutable.';
CREATE INDEX IF NOT EXISTS idx_scenario_runs_day ON public.scenario_runs (conflict_day DESC, recorded_at DESC);
CREATE OR REPLACE FUNCTION public.scenario_recorded_at_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('app.registry_import', true), '') <> 'on'
     AND coalesce(current_setting('app.legacy_import', true), '') <> 'on' THEN
    NEW.recorded_at := now();                       -- provenance cannot be backdated
    IF NEW.conflict_day > public.get_current_conflict_day() THEN
      RAISE EXCEPTION 'conflict_day % is in the future (today is Day %)', NEW.conflict_day, public.get_current_conflict_day();
    END IF;
  END IF;
  -- writers may omit provenance; it is derived (and the CHECK rejects a supplied value that disagrees)
  IF NEW.provenance IS NULL THEN
    NEW.provenance := public.provenance_for(NEW.conflict_day, NEW.recorded_at);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenario_runs_recorded_at ON public.scenario_runs;
CREATE TRIGGER scenario_runs_recorded_at BEFORE INSERT ON public.scenario_runs
  FOR EACH ROW EXECUTE FUNCTION public.scenario_recorded_at_guard();
DROP TRIGGER IF EXISTS scenario_runs_immutable ON public.scenario_runs;
CREATE TRIGGER scenario_runs_immutable BEFORE UPDATE OR DELETE ON public.scenario_runs
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

-- ---------------------------------------------------------------------------
-- 7. scenario_daily — one row per scenario per day per (method, run, override)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_daily (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id      uuid NOT NULL REFERENCES public.scenarios(id),
  conflict_day     integer NOT NULL,
  method_version   text NOT NULL REFERENCES public.scenario_methods(method_version),
  run_id           uuid REFERENCES public.scenario_runs(id),
  override_id      uuid REFERENCES public.scenario_overrides(id),
  probability      numeric(6,3),
  probability_raw  numeric,
  null_reason      text,
  inputs           jsonb NOT NULL DEFAULT '[]'::jsonb,
  horizon_end      date,
  is_published     boolean NOT NULL DEFAULT false,
  provenance       text NOT NULL,
  legacy_row_id    uuid,
  recorded_at      timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  method_label     text GENERATED ALWAYS AS (
                     method_version || CASE WHEN override_id IS NOT NULL AND method_version <> 'operator-override'
                                            THEN '+override:' || left(override_id::text, 8) ELSE '' END) STORED,
  CONSTRAINT scenario_daily_day_chk          CHECK (conflict_day >= 1),
  CONSTRAINT scenario_daily_prob_range       CHECK (probability IS NULL OR probability BETWEEN 0 AND 100),
  CONSTRAINT scenario_daily_raw_range        CHECK (probability_raw IS NULL OR probability_raw BETWEEN 0 AND 100),
  -- exactly one of: a number, or a stated reason why there is no number
  CONSTRAINT scenario_daily_prob_xor_reason  CHECK ((probability IS NULL) = (null_reason IS NOT NULL)),
  CONSTRAINT scenario_daily_reason_len       CHECK (null_reason IS NULL OR length(btrim(null_reason)) >= 5),
  CONSTRAINT scenario_daily_provenance_chk   CHECK (provenance = public.provenance_for(conflict_day, recorded_at)),
  CONSTRAINT scenario_daily_inputs_array     CHECK (jsonb_typeof(inputs) = 'array'),
  -- R1: market-anchored rows need a run, a horizon and valid inputs; a number needs a basis.
  CONSTRAINT scenario_daily_market_sourced   CHECK (method_version NOT LIKE 'market-anchored-%' OR (
        run_id IS NOT NULL AND horizon_end IS NOT NULL
    AND public.scenario_inputs_valid(inputs, probability IS NOT NULL))),
  -- R3 output override: must point at an operator override record (reason + admin).
  CONSTRAINT scenario_daily_override_ref     CHECK (method_version <> 'operator-override' OR (override_id IS NOT NULL AND probability IS NOT NULL)),
  -- legacy method: only imported history, Days 1-35, no inputs, pointing at the source row.
  CONSTRAINT scenario_daily_legacy_scope     CHECK (method_version <> 'legacy-desk-v0' OR (
        conflict_day BETWEEN 1 AND 35 AND legacy_row_id IS NOT NULL AND inputs = '[]'::jsonb AND run_id IS NULL)),
  CONSTRAINT scenario_daily_legacy_ref_only  CHECK (legacy_row_id IS NULL OR method_version = 'legacy-desk-v0'),
  -- any future method family must still carry inputs unless explicitly exempted above
  CONSTRAINT scenario_daily_inputs_required  CHECK (method_version IN ('legacy-desk-v0', 'operator-override')
                                                 OR jsonb_array_length(inputs) >= 1),
  CONSTRAINT scenario_daily_key UNIQUE NULLS NOT DISTINCT (scenario_id, conflict_day, method_version, run_id, override_id)
);
COMMENT ON TABLE public.scenario_daily IS
  'Daily probability per scenario. Exactly one row per (scenario, day) may be published. Rows are immutable except is_published. Exclusive groups: published members sum to sum_target at COMMIT (deferred trigger). probability is in percent (published, rounded); probability_raw is the unrounded value.';
COMMENT ON COLUMN public.scenario_daily.inputs IS
  'Inputs behind THIS number: market readings (scenario_d221.json input shape) and/or {"kind":"derived","rule","from"} steps. Empty only for legacy-desk-v0 (imported) and operator-override (reason lives in scenario_overrides).';
COMMENT ON COLUMN public.scenario_daily.recorded_at IS 'When the value was recorded. For imported legacy rows = scenario_probabilities.updated_at of the source row.';
COMMENT ON COLUMN public.scenario_daily.provenance IS 'provenance_for(conflict_day, recorded_at): contemporaneous = recorded by 06:00 UTC on the calendar day after the conflict day; reconstructed = later. recorded_at is forced to now() except in an import.';

CREATE UNIQUE INDEX IF NOT EXISTS scenario_daily_one_published
  ON public.scenario_daily (scenario_id, conflict_day) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_scenario_daily_day_pub
  ON public.scenario_daily (conflict_day DESC) WHERE is_published;
CREATE INDEX IF NOT EXISTS idx_scenario_daily_run ON public.scenario_daily (run_id) WHERE run_id IS NOT NULL;

-- Guard: rows immutable except is_published; never deleted; legacy method only in the import txn;
-- a KEEP_FROZEN run is never published; a row is never published for a day its scenario is not live.
CREATE OR REPLACE FUNCTION public.scenario_daily_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_verdict text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scenario_daily rows are never deleted (unpublish instead)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- method_label is a generated column: not yet computed in NEW inside a BEFORE trigger, so it is excluded.
  IF TG_OP = 'UPDATE' AND (to_jsonb(NEW) - 'is_published' - 'method_label')
                          IS DISTINCT FROM (to_jsonb(OLD) - 'is_published' - 'method_label') THEN
    RAISE EXCEPTION 'scenario_daily values are immutable; insert a new row (new run / override) instead'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' AND NEW.method_version = 'legacy-desk-v0'
     AND current_setting('app.legacy_import', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'legacy-desk-v0 rows are accepted only by the registry import' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF NEW.is_published AND NEW.run_id IS NOT NULL THEN
    SELECT r.verdict INTO v_verdict FROM public.scenario_runs r WHERE r.id = NEW.run_id;
    IF v_verdict = 'KEEP_FROZEN' THEN
      RAISE EXCEPTION 'run % has verdict KEEP_FROZEN; its rows cannot be published', NEW.run_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenario_daily_recorded_at ON public.scenario_daily;
CREATE TRIGGER scenario_daily_recorded_at BEFORE INSERT ON public.scenario_daily
  FOR EACH ROW EXECUTE FUNCTION public.scenario_recorded_at_guard();
DROP TRIGGER IF EXISTS scenario_daily_guard ON public.scenario_daily;
CREATE TRIGGER scenario_daily_guard BEFORE INSERT OR UPDATE OR DELETE ON public.scenario_daily
  FOR EACH ROW EXECUTE FUNCTION public.scenario_daily_guard();

-- Deferred (COMMIT-time) consistency of one (group, day): R4 + lifecycle liveness.
CREATE OR REPLACE FUNCTION public.scenario_daily_check_group_day(p_group text, p_day integer)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  g             public.scenario_groups%ROWTYPE;
  v_n_pub       integer;
  v_n_null      integer;
  v_sum         numeric;
  v_missing     text;
  v_not_live    text;
BEGIN
  SELECT * INTO g FROM public.scenario_groups WHERE code = p_group;

  SELECT string_agg(s.code, ',') INTO v_not_live
    FROM public.scenario_daily d JOIN public.scenarios s ON s.id = d.scenario_id
   WHERE d.is_published AND d.conflict_day = p_day AND s.group_code = p_group
     AND NOT (s.born_day <= p_day AND (s.retired_day IS NULL OR p_day < s.retired_day));
  IF v_not_live IS NOT NULL THEN
    RAISE EXCEPTION 'day %: published reading for scenario(s) % outside their life (born_day..retired_day-1)', p_day, v_not_live;
  END IF;

  IF g.kind <> 'exclusive' THEN RETURN; END IF;

  SELECT count(*), count(*) FILTER (WHERE d.probability IS NULL), sum(d.probability)
    INTO v_n_pub, v_n_null, v_sum
    FROM public.scenario_daily d JOIN public.scenarios s ON s.id = d.scenario_id
   WHERE d.is_published AND d.conflict_day = p_day AND s.group_code = p_group;
  IF v_n_pub = 0 THEN RETURN; END IF;   -- nothing published for this group/day: no claim, no check

  IF v_n_null > 0 THEN
    RAISE EXCEPTION 'day %, group %: a published member of an exclusive set has no number (publish all or none)', p_day, p_group;
  END IF;

  SELECT string_agg(s.code, ',' ORDER BY s.code) INTO v_missing
    FROM public.scenarios s
   WHERE s.group_code = p_group
     AND s.born_day <= p_day AND (s.retired_day IS NULL OR p_day < s.retired_day)
     AND NOT EXISTS (SELECT 1 FROM public.scenario_daily d
                      WHERE d.scenario_id = s.id AND d.conflict_day = p_day AND d.is_published);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'day %, group %: live member(s) % have no published reading (exclusive set must be complete)', p_day, p_group, v_missing;
  END IF;

  IF v_sum <> g.sum_target THEN
    RAISE EXCEPTION 'day %, group %: published probabilities sum to %, must be exactly %', p_day, p_group, v_sum, g.sum_target;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.scenario_daily_deferred_check()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_group text;
BEGIN
  SELECT s.group_code INTO v_group FROM public.scenarios s WHERE s.id = NEW.scenario_id;
  PERFORM public.scenario_daily_check_group_day(v_group, NEW.conflict_day);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS scenario_daily_a_group_check ON public.scenario_daily;
CREATE CONSTRAINT TRIGGER scenario_daily_a_group_check
  AFTER INSERT OR UPDATE ON public.scenario_daily
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.scenario_daily_deferred_check();

-- ---------------------------------------------------------------------------
-- 8. scenario_lifecycle_events — immutable log of every status change
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scenario_lifecycle_events (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  scenario_id    uuid NOT NULL REFERENCES public.scenarios(id),
  conflict_day   integer NOT NULL,
  from_status    text,
  to_status      text NOT NULL,
  reason_code    text NOT NULL,
  actor_kind     text NOT NULL,
  actor          text NOT NULL,
  admin_id       uuid REFERENCES public.admin_users(id),
  reason         text NOT NULL,
  evidence       jsonb NOT NULL,
  rule_snapshot  jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sle_status_chk     CHECK (to_status IN ('active', 'fading', 'retired')
                                   AND (from_status IS NULL OR from_status IN ('active', 'fading'))),
  CONSTRAINT sle_reason_code    CHECK (reason_code IN ('imported', 'born', 'threshold_streak', 'condition_resolved', 'recovered', 'operator_decision')),
  CONSTRAINT sle_actor_kind     CHECK (actor_kind IN ('migration', 'job', 'operator')),
  CONSTRAINT sle_operator_admin CHECK (actor_kind <> 'operator' OR admin_id IS NOT NULL),
  CONSTRAINT sle_retire_by_op   CHECK (to_status <> 'retired' OR actor_kind = 'operator'),
  CONSTRAINT sle_born_by_op     CHECK (reason_code <> 'born' OR actor_kind = 'operator'),
  CONSTRAINT sle_import_by_mig  CHECK ((reason_code = 'imported') = (actor_kind = 'migration')),
  CONSTRAINT sle_birth_shape    CHECK ((from_status IS NULL) = (reason_code IN ('imported', 'born'))),
  CONSTRAINT sle_reason_len     CHECK (length(btrim(reason)) >= 5),
  CONSTRAINT sle_evidence       CHECK (public.jsonb_nonempty(evidence))
);
COMMENT ON TABLE public.scenario_lifecycle_events IS
  'Append-only lifecycle history (birth, fade, recovery, retirement) with actor, reason, evidence and the rule snapshot used.';
CREATE INDEX IF NOT EXISTS idx_sle_scenario ON public.scenario_lifecycle_events (scenario_id, id);
DROP TRIGGER IF EXISTS sle_immutable ON public.scenario_lifecycle_events;
CREATE TRIGGER sle_immutable BEFORE UPDATE OR DELETE ON public.scenario_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();

-- ---------------------------------------------------------------------------
-- 9. Lifecycle: days below threshold, eligibility view, transitions, tick, birth
-- ---------------------------------------------------------------------------

-- Consecutive conflict days, ending at p_as_of_day, on which the scenario has a PUBLISHED
-- reading strictly below its group's threshold. A missing day or a NULL reading breaks the
-- streak (no reading is not evidence of being low).
CREATE OR REPLACE FUNCTION public.scenario_days_below_threshold(p_scenario_id uuid, p_as_of_day integer)
RETURNS integer LANGUAGE sql STABLE SET search_path = '' AS $$
  WITH s AS (
    SELECT sc.born_day, g.fade_threshold_pct AS thr
      FROM public.scenarios sc JOIN public.scenario_groups g ON g.code = sc.group_code
     WHERE sc.id = p_scenario_id
  )
  SELECT CASE WHEN p_as_of_day < s.born_day THEN 0 ELSE
           p_as_of_day - coalesce((
             SELECT max(gs.d)
               FROM generate_series(s.born_day, p_as_of_day) AS gs(d)
               LEFT JOIN public.scenario_daily sd
                      ON sd.scenario_id = p_scenario_id AND sd.conflict_day = gs.d AND sd.is_published
              WHERE sd.id IS NULL OR sd.probability IS NULL OR sd.probability >= s.thr
           ), s.born_day - 1)
         END
    FROM s
$$;
COMMENT ON FUNCTION public.scenario_days_below_threshold(uuid, integer) IS
  'Length of the run of consecutive conflict days ending at p_as_of_day with a published reading < group threshold. Missing/NULL day breaks the run.';

-- TRUE if an approved defining-condition market of the scenario has resolved with the outcome that ends it.
CREATE OR REPLACE FUNCTION public.scenario_condition_resolved(p_scenario_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.scenario_markets m
     WHERE m.scenario_id = p_scenario_id AND m.role = 'defining_condition'
       AND m.link_status IN ('approved', 'ended') AND m.resolved_at IS NOT NULL
       AND m.resolved_outcome <> 'void'
       AND (m.fade_on_outcome = 'any' OR m.fade_on_outcome = m.resolved_outcome))
$$;

-- Eligibility as of the latest published day across all scenarios.
CREATE OR REPLACE VIEW public.v_scenario_lifecycle
WITH (security_invoker = true) AS
WITH asof AS (SELECT max(conflict_day) AS d FROM public.scenario_daily WHERE is_published)
SELECT s.id AS scenario_id, s.code, s.name_en, s.group_code, s.status, s.born_day, s.fading_since_day, s.retired_day,
       g.fade_threshold_pct AS threshold_pct, g.fade_consecutive_days AS required_days,
       asof.d AS as_of_day,
       (SELECT sd.probability FROM public.scenario_daily sd
         WHERE sd.scenario_id = s.id AND sd.is_published AND sd.conflict_day = asof.d) AS latest_probability,
       public.scenario_days_below_threshold(s.id, asof.d) AS days_below_threshold,
       public.scenario_condition_resolved(s.id) AS condition_resolved,
       (s.status = 'active' AND (public.scenario_days_below_threshold(s.id, asof.d) >= g.fade_consecutive_days
                                 OR public.scenario_condition_resolved(s.id))) AS eligible_to_fade,
       (s.status = 'fading' AND NOT public.scenario_condition_resolved(s.id)
         AND coalesce((SELECT sd.probability >= g.fade_threshold_pct FROM public.scenario_daily sd
                        WHERE sd.scenario_id = s.id AND sd.is_published AND sd.conflict_day = asof.d), false)) AS eligible_to_reactivate,
       (s.status = 'fading') AS awaiting_retirement_confirmation
  FROM public.scenarios s
  JOIN public.scenario_groups g ON g.code = s.group_code
  CROSS JOIN asof;
COMMENT ON VIEW public.v_scenario_lifecycle IS
  'Per scenario: threshold streak and what the lifecycle rule allows next (10%/14 days per ruling 2026-10-06).';

-- The ONLY way to change a scenario's status.
--   active -> fading  : job or operator; job needs streak >= required days or a resolved defining condition
--   fading -> active  : job or operator; job needs latest reading >= threshold and no resolved condition
--   fading -> retired : operator only (admin id required)
--   active -> retired : refused (must fade first); retired -> * : refused (terminal)
CREATE OR REPLACE FUNCTION public.scenario_transition(
  p_scenario_id  uuid,
  p_to_status    text,
  p_reason_code  text,
  p_actor_kind   text,
  p_actor        text,
  p_admin_id     uuid,
  p_reason       text,
  p_evidence     jsonb,
  p_as_of_day    integer)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  s          public.scenarios%ROWTYPE;
  g          public.scenario_groups%ROWTYPE;
  v_streak   integer;
  v_resolved boolean;
  v_latest   numeric;
  v_last_pub integer;
  v_retired  integer;
BEGIN
  SELECT * INTO s FROM public.scenarios WHERE id = p_scenario_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'scenario % not found', p_scenario_id; END IF;
  SELECT * INTO g FROM public.scenario_groups WHERE code = s.group_code;
  IF p_actor_kind NOT IN ('job', 'operator') THEN RAISE EXCEPTION 'actor_kind must be job or operator'; END IF;
  IF p_actor_kind = 'operator' AND (p_admin_id IS NULL OR NOT EXISTS (
       SELECT 1 FROM public.admin_users a WHERE a.id = p_admin_id AND a.is_active)) THEN
    RAISE EXCEPTION 'operator transitions need an active admin_users id';
  END IF;

  v_streak   := public.scenario_days_below_threshold(s.id, p_as_of_day);
  v_resolved := public.scenario_condition_resolved(s.id);
  SELECT sd.probability INTO v_latest FROM public.scenario_daily sd
   WHERE sd.scenario_id = s.id AND sd.is_published AND sd.conflict_day = p_as_of_day;

  IF s.status = 'retired' THEN
    RAISE EXCEPTION 'scenario % is retired (terminal)', s.code;
  ELSIF s.status = 'active' AND p_to_status = 'fading' THEN
    IF p_actor_kind = 'job' THEN
      IF p_reason_code = 'threshold_streak' AND v_streak < g.fade_consecutive_days THEN
        RAISE EXCEPTION 'scenario %: % day(s) below % percent, rule needs %', s.code, v_streak, g.fade_threshold_pct, g.fade_consecutive_days;
      ELSIF p_reason_code = 'condition_resolved' AND NOT v_resolved THEN
        RAISE EXCEPTION 'scenario %: no resolved defining condition', s.code;
      ELSIF p_reason_code NOT IN ('threshold_streak', 'condition_resolved') THEN
        RAISE EXCEPTION 'job fade needs reason threshold_streak or condition_resolved';
      END IF;
    ELSIF p_reason_code NOT IN ('threshold_streak', 'condition_resolved', 'operator_decision') THEN
      RAISE EXCEPTION 'invalid reason_code % for fade', p_reason_code;
    END IF;
  ELSIF s.status = 'fading' AND p_to_status = 'active' THEN
    IF p_actor_kind = 'job' THEN
      IF p_reason_code <> 'recovered' OR v_resolved OR v_latest IS NULL OR v_latest < g.fade_threshold_pct THEN
        RAISE EXCEPTION 'scenario %: no recovery (latest %, threshold %, condition resolved %)', s.code, v_latest, g.fade_threshold_pct, v_resolved;
      END IF;
    ELSIF p_reason_code NOT IN ('recovered', 'operator_decision') THEN
      RAISE EXCEPTION 'invalid reason_code % for reactivation', p_reason_code;
    END IF;
  ELSIF s.status = 'fading' AND p_to_status = 'retired' THEN
    IF p_actor_kind <> 'operator' THEN
      RAISE EXCEPTION 'retirement requires operator confirmation';
    END IF;
  ELSE
    RAISE EXCEPTION 'transition % -> % is not allowed', s.status, p_to_status;
  END IF;

  PERFORM set_config('app.lifecycle_txn', 'on', true);
  IF p_to_status = 'fading' THEN
    UPDATE public.scenarios SET status = 'fading', fading_since_day = p_as_of_day WHERE id = s.id;
  ELSIF p_to_status = 'active' THEN
    UPDATE public.scenarios SET status = 'active', fading_since_day = NULL WHERE id = s.id;
  ELSE
    -- retired_day = first day with no reading: never before a day that already has a published reading.
    SELECT max(sd.conflict_day) INTO v_last_pub FROM public.scenario_daily sd
     WHERE sd.scenario_id = s.id AND sd.is_published;
    v_retired := greatest(p_as_of_day, coalesce(v_last_pub + 1, p_as_of_day), s.born_day + 1);
    UPDATE public.scenarios SET status = 'retired', retired_day = v_retired WHERE id = s.id;
  END IF;
  PERFORM set_config('app.lifecycle_txn', 'off', true);

  INSERT INTO public.scenario_lifecycle_events
    (scenario_id, conflict_day, from_status, to_status, reason_code, actor_kind, actor, admin_id, reason, evidence, rule_snapshot)
  VALUES
    (s.id, p_as_of_day, s.status, p_to_status, p_reason_code, p_actor_kind, p_actor, p_admin_id, p_reason, p_evidence,
     jsonb_build_object('threshold_pct', g.fade_threshold_pct, 'required_days', g.fade_consecutive_days,
                        'days_below_threshold', v_streak, 'latest_probability', v_latest,
                        'condition_resolved', v_resolved, 'as_of_day', p_as_of_day));
END $$;

-- Deterministic daily tick (GitHub Action, after the day's run is published). Evaluates every
-- active/fading scenario born on or before p_as_of_day AS OF that day (not the display view's day).
CREATE OR REPLACE FUNCTION public.scenario_lifecycle_tick(p_as_of_day integer, p_job text)
RETURNS TABLE (code text, from_status text, to_status text, reason_code text)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  r          record;
  v_streak   integer;
  v_resolved boolean;
  v_latest   numeric;
BEGIN
  FOR r IN
    SELECT s.id, s.code, s.status, g.fade_threshold_pct AS thr, g.fade_consecutive_days AS req
      FROM public.scenarios s JOIN public.scenario_groups g ON g.code = s.group_code
     WHERE s.status IN ('active', 'fading') AND s.born_day <= p_as_of_day
     ORDER BY s.code
  LOOP
    v_streak   := public.scenario_days_below_threshold(r.id, p_as_of_day);
    v_resolved := public.scenario_condition_resolved(r.id);
    v_latest   := (SELECT sd.probability FROM public.scenario_daily sd
                    WHERE sd.scenario_id = r.id AND sd.is_published AND sd.conflict_day = p_as_of_day);
    IF r.status = 'active' AND v_resolved THEN
      PERFORM public.scenario_transition(r.id, 'fading', 'condition_resolved', 'job', p_job, NULL,
        'Defining market/condition resolved', jsonb_build_object('scenario_markets',
          (SELECT jsonb_agg(jsonb_build_object('id', m.id, 'url', m.url, 'resolved_outcome', m.resolved_outcome,
                                               'resolved_at', m.resolved_at, 'resolution_source_url', m.resolution_source_url))
             FROM public.scenario_markets m
            WHERE m.scenario_id = r.id AND m.role = 'defining_condition' AND m.resolved_at IS NOT NULL)),
        p_as_of_day);
      code := r.code; from_status := 'active'; to_status := 'fading'; reason_code := 'condition_resolved'; RETURN NEXT;
    ELSIF r.status = 'active' AND v_streak >= r.req THEN
      PERFORM public.scenario_transition(r.id, 'fading', 'threshold_streak', 'job', p_job, NULL,
        format('Below %s%% for %s consecutive days', r.thr, v_streak),
        (SELECT jsonb_agg(jsonb_build_object('conflict_day', sd.conflict_day, 'probability', sd.probability,
                                             'scenario_daily_id', sd.id, 'method', sd.method_label) ORDER BY sd.conflict_day)
           FROM public.scenario_daily sd
          WHERE sd.scenario_id = r.id AND sd.is_published
            AND sd.conflict_day > p_as_of_day - v_streak AND sd.conflict_day <= p_as_of_day),
        p_as_of_day);
      code := r.code; from_status := 'active'; to_status := 'fading'; reason_code := 'threshold_streak'; RETURN NEXT;
    ELSIF r.status = 'fading' AND NOT v_resolved AND v_latest IS NOT NULL AND v_latest >= r.thr THEN
      PERFORM public.scenario_transition(r.id, 'active', 'recovered', 'job', p_job, NULL,
        format('Recovered to %s%% (threshold %s%%)', v_latest, r.thr),
        (SELECT jsonb_agg(jsonb_build_object('conflict_day', sd.conflict_day, 'probability', sd.probability, 'scenario_daily_id', sd.id))
           FROM public.scenario_daily sd
          WHERE sd.scenario_id = r.id AND sd.is_published AND sd.conflict_day = p_as_of_day),
        p_as_of_day);
      code := r.code; from_status := 'fading'; to_status := 'active'; reason_code := 'recovered'; RETURN NEXT;
    END IF;
  END LOOP;
END $$;

-- Birth: operator approves a detected_scenarios candidate (origin 'detected' or 'market').
CREATE OR REPLACE FUNCTION public.scenario_promote_candidate(
  p_detected_id    uuid,
  p_code           text,
  p_group_code     text,
  p_name_en        text,
  p_definition_en  text,
  p_born_day       integer,
  p_origin         text,
  p_evidence       jsonb,
  p_admin_id       uuid,
  p_name_ar        text DEFAULT NULL,
  p_definition_ar  text DEFAULT NULL,
  p_display_order  integer DEFAULT 100)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_status public.scenario_detection_status;
  v_id     uuid;
BEGIN
  IF p_origin NOT IN ('detected', 'market') THEN RAISE EXCEPTION 'origin must be detected or market'; END IF;
  IF p_admin_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.admin_users a WHERE a.id = p_admin_id AND a.is_active) THEN
    RAISE EXCEPTION 'birth requires an active operator (admin_users id)';
  END IF;
  SELECT status INTO v_status FROM public.detected_scenarios WHERE id = p_detected_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'detected scenario % not found', p_detected_id; END IF;
  IF v_status <> 'candidate' THEN RAISE EXCEPTION 'detected scenario % is %, not candidate', p_detected_id, v_status; END IF;
  IF NOT public.scenario_birth_evidence_valid(p_origin, p_evidence) THEN
    RAISE EXCEPTION 'birth evidence fails the rule for origin % (detected: >=2 independent non-party sources on distinct hosts + new actor/instrument; market: >=1 market with venue/question/url/read_at)', p_origin;
  END IF;

  PERFORM set_config('app.lifecycle_txn', 'on', true);
  INSERT INTO public.scenarios (code, group_code, name_en, name_ar, definition_en, definition_ar, status, origin,
                                born_day, detected_scenario_id, display_order)
  VALUES (p_code, p_group_code, p_name_en, p_name_ar, p_definition_en, p_definition_ar, 'active', p_origin,
          p_born_day, p_detected_id, p_display_order)
  RETURNING id INTO v_id;
  PERFORM set_config('app.lifecycle_txn', 'off', true);

  UPDATE public.detected_scenarios
     SET status = 'approved', approved_by = p_admin_id, approved_at = now(),
         new_actor = coalesce(new_actor, p_evidence ->> 'new_actor'),
         new_instrument = coalesce(new_instrument, p_evidence ->> 'new_instrument')
   WHERE id = p_detected_id;

  INSERT INTO public.scenario_lifecycle_events
    (scenario_id, conflict_day, from_status, to_status, reason_code, actor_kind, actor, admin_id, reason, evidence)
  VALUES (v_id, p_born_day, NULL, 'active', 'born', 'operator', 'admin', p_admin_id,
          format('Approved candidate %s (%s)', p_code, p_origin), p_evidence);
  RETURN v_id;
END $$;

-- Output-level override (method 1.10.2): operator numbers for one day + group, with reason.
-- Unpublishes the current published rows of that group/day (kept for audit) and publishes the override.
CREATE OR REPLACE FUNCTION public.scenario_apply_output_override(
  p_conflict_day integer, p_group_code text, p_values jsonb, p_reason text, p_admin_id uuid)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE
  v_override uuid;
  v_prov     text;
  r          record;
BEGIN
  IF jsonb_typeof(p_values) <> 'object' THEN RAISE EXCEPTION 'values must be an object {"CODE": number}'; END IF;
  INSERT INTO public.scenario_overrides (kind, group_code, valid_from_day, valid_to_day, payload, reason, admin_id)
  VALUES ('output', p_group_code, p_conflict_day, p_conflict_day, jsonb_build_object('values', p_values), p_reason, p_admin_id)
  RETURNING id INTO v_override;

  v_prov := public.provenance_for(p_conflict_day, now());

  UPDATE public.scenario_daily d SET is_published = false
    FROM public.scenarios s
   WHERE s.id = d.scenario_id AND s.group_code = p_group_code AND d.conflict_day = p_conflict_day AND d.is_published;

  FOR r IN SELECT key AS code, value FROM jsonb_each(p_values) LOOP
    IF jsonb_typeof(r.value) <> 'number' THEN RAISE EXCEPTION 'value for % is not a number', r.code; END IF;
    INSERT INTO public.scenario_daily (scenario_id, conflict_day, method_version, override_id, probability,
                                       probability_raw, inputs, is_published, provenance)
    SELECT s.id, p_conflict_day, 'operator-override', v_override, (r.value #>> '{}')::numeric,
           (r.value #>> '{}')::numeric, '[]'::jsonb, true, v_prov
      FROM public.scenarios s WHERE s.code = r.code AND s.group_code = p_group_code;
    IF NOT FOUND THEN RAISE EXCEPTION 'scenario % is not in group %', r.code, p_group_code; END IF;
  END LOOP;
  RETURN v_override;   -- group completeness + sum are checked at COMMIT
END $$;

-- Publish a run: unpublish whatever is published for the run's scenarios/day, publish the run's rows.
CREATE OR REPLACE FUNCTION public.scenario_publish_run(p_run_id uuid)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_day integer; v_verdict text; v_n integer;
BEGIN
  SELECT conflict_day, verdict INTO v_day, v_verdict FROM public.scenario_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_verdict = 'KEEP_FROZEN' THEN RAISE EXCEPTION 'run % is KEEP_FROZEN', p_run_id; END IF;
  UPDATE public.scenario_daily d SET is_published = false
   WHERE d.conflict_day = v_day AND d.is_published AND d.run_id IS DISTINCT FROM p_run_id
     AND d.scenario_id IN (SELECT scenario_id FROM public.scenario_daily WHERE run_id = p_run_id);
  UPDATE public.scenario_daily SET is_published = true WHERE run_id = p_run_id AND NOT is_published;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ---------------------------------------------------------------------------
-- 10. Compatibility: view in scenario_probabilities' exact shape + transition-phase sync
-- ---------------------------------------------------------------------------
-- Reproduces scenario_probabilities (id, conflict_day, scenario_a..d, updated_at, scenario_e)
-- from published A-E rows. Only legacy imports and CONTEMPORANEOUS rows are exposed in the
-- legacy shape, because that shape cannot carry a "reconstructed" label.
CREATE OR REPLACE VIEW public.v_scenario_probabilities_compat
WITH (security_invoker = true) AS
WITH pub AS (
  SELECT sd.conflict_day, s.legacy_column, sd.probability, sd.recorded_at
    FROM public.scenario_daily sd
    JOIN public.scenarios s ON s.id = sd.scenario_id
   WHERE sd.is_published AND s.legacy_column IS NOT NULL
     AND (sd.method_version = 'legacy-desk-v0' OR sd.provenance = 'contemporaneous')
), agg AS (
  SELECT conflict_day,
         (max(probability) FILTER (WHERE legacy_column = 'scenario_a'))::double precision AS scenario_a,
         (max(probability) FILTER (WHERE legacy_column = 'scenario_b'))::double precision AS scenario_b,
         (max(probability) FILTER (WHERE legacy_column = 'scenario_c'))::double precision AS scenario_c,
         (max(probability) FILTER (WHERE legacy_column = 'scenario_d'))::double precision AS scenario_d,
         max(recorded_at)                                                                 AS updated_at,
         (max(probability) FILTER (WHERE legacy_column = 'scenario_e'))::double precision AS scenario_e
    FROM pub
   GROUP BY conflict_day
  HAVING count(*) FILTER (WHERE legacy_column IN ('scenario_a','scenario_b','scenario_c','scenario_d')
                            AND probability IS NOT NULL) = 4
)
-- id: the existing row's id is preserved (looked up by conflict_day; after the phase-2 rename the
-- view keeps pointing at the frozen table by OID); a day first written through the registry gets
-- a deterministic id md5('scenario_probabilities:<day>').
SELECT coalesce(sp.id, md5('scenario_probabilities:' || a.conflict_day)::uuid) AS id,
       a.conflict_day, a.scenario_a, a.scenario_b, a.scenario_c, a.scenario_d, a.updated_at, a.scenario_e
  FROM agg a
  LEFT JOIN public.scenario_probabilities sp ON sp.conflict_day = a.conflict_day;
COMMENT ON VIEW public.v_scenario_probabilities_compat IS
  'scenario_probabilities shape derived from scenario_daily. Phase 2 swaps it in under the old name (see ADR).';

-- Transition phase: keep the physical table in step with published A-E rows (COMMIT time,
-- after the group check), so every current reader keeps working unchanged.
CREATE OR REPLACE FUNCTION public.scenario_daily_sync_legacy()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v record;
BEGIN
  IF current_setting('app.legacy_import', true) = 'on' THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scenarios s WHERE s.id = NEW.scenario_id AND s.legacy_column IS NOT NULL) THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v FROM public.v_scenario_probabilities_compat c WHERE c.conflict_day = NEW.conflict_day;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM set_config('app.scenario_sync', 'on', true);
  INSERT INTO public.scenario_probabilities AS t (id, conflict_day, scenario_a, scenario_b, scenario_c, scenario_d, scenario_e, updated_at)
  VALUES (v.id, v.conflict_day, v.scenario_a, v.scenario_b, v.scenario_c, v.scenario_d, v.scenario_e, v.updated_at)
  ON CONFLICT (conflict_day) DO UPDATE
     SET scenario_a = EXCLUDED.scenario_a, scenario_b = EXCLUDED.scenario_b, scenario_c = EXCLUDED.scenario_c,
         scenario_d = EXCLUDED.scenario_d, scenario_e = EXCLUDED.scenario_e, updated_at = EXCLUDED.updated_at
   WHERE (t.scenario_a, t.scenario_b, t.scenario_c, t.scenario_d, t.scenario_e)
         IS DISTINCT FROM (EXCLUDED.scenario_a, EXCLUDED.scenario_b, EXCLUDED.scenario_c, EXCLUDED.scenario_d, EXCLUDED.scenario_e);
  PERFORM set_config('app.scenario_sync', 'off', true);
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS scenario_daily_b_sync_legacy ON public.scenario_daily;
CREATE CONSTRAINT TRIGGER scenario_daily_b_sync_legacy
  AFTER INSERT OR UPDATE ON public.scenario_daily
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION public.scenario_daily_sync_legacy();

-- ---------------------------------------------------------------------------
-- 11. Fix the approval alert trigger (production bug found while designing birth)
-- ---------------------------------------------------------------------------
-- Production detected_scenarios has scenario_label/scenario_name and NO label/new_actor/
-- new_instrument columns, but activate_new_scenario_alert() reads NEW.label etc., so ANY
-- approval raises 'record "new" has no field "label"'. Add the two evidence columns
-- (nullable, additive) and read the label safely.
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS new_actor text;
ALTER TABLE public.detected_scenarios ADD COLUMN IF NOT EXISTS new_instrument text;

CREATE OR REPLACE FUNCTION public.activate_new_scenario_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_label text := coalesce(to_jsonb(NEW) ->> 'scenario_label', to_jsonb(NEW) ->> 'label');
  v_title text := coalesce(to_jsonb(NEW) ->> 'title', to_jsonb(NEW) ->> 'scenario_name');
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status <> 'approved') THEN
    UPDATE public.platform_alerts
       SET is_active = TRUE, activated_at = now(),
           title = 'New Scenario ' || coalesce(v_label, '?') || ' Detected',
           message = v_title,
           value = jsonb_build_object('scenario_label', v_label, 'scenario_id', NEW.id, 'conflict_day', NEW.conflict_day,
                                      'new_actor', NEW.new_actor, 'new_instrument', NEW.new_instrument)
     WHERE key = 'new_scenario_alert';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.activate_new_scenario_alert() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 12. RLS + privileges. Public read; service_role write; no anon/authenticated writes.
--     (Policy names prove nothing: roles are stated explicitly AND table privileges revoked.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_groups','scenario_methods','scenarios','scenario_markets','scenario_overrides',
                           'scenario_runs','scenario_daily','scenario_lifecycle_events']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_service_all', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service_all', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO service_role', t);
    EXECUTE format('REVOKE DELETE, TRUNCATE ON public.%I FROM service_role', t);
  END LOOP;
END $$;

-- Public read (anon + authenticated). Proposed/rejected market links stay private.
DROP POLICY IF EXISTS scenario_groups_public_read ON public.scenario_groups;
CREATE POLICY scenario_groups_public_read ON public.scenario_groups FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS scenario_methods_public_read ON public.scenario_methods;
CREATE POLICY scenario_methods_public_read ON public.scenario_methods FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS scenarios_public_read ON public.scenarios;
CREATE POLICY scenarios_public_read ON public.scenarios FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS scenario_markets_public_read ON public.scenario_markets;
CREATE POLICY scenario_markets_public_read ON public.scenario_markets FOR SELECT TO anon, authenticated
  USING (link_status IN ('approved', 'ended'));
DROP POLICY IF EXISTS scenario_overrides_public_read ON public.scenario_overrides;
CREATE POLICY scenario_overrides_public_read ON public.scenario_overrides FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS scenario_runs_public_read ON public.scenario_runs;
CREATE POLICY scenario_runs_public_read ON public.scenario_runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS scenario_daily_public_read ON public.scenario_daily;
CREATE POLICY scenario_daily_public_read ON public.scenario_daily FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS sle_public_read ON public.scenario_lifecycle_events;
CREATE POLICY sle_public_read ON public.scenario_lifecycle_events FOR SELECT TO anon, authenticated USING (true);

GRANT SELECT ON public.scenario_groups, public.scenario_methods, public.scenarios, public.scenario_markets,
                public.scenario_overrides, public.scenario_runs, public.scenario_daily, public.scenario_lifecycle_events
  TO anon, authenticated;
REVOKE ALL ON public.v_scenario_lifecycle, public.v_scenario_probabilities_compat FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.v_scenario_lifecycle, public.v_scenario_probabilities_compat TO anon, authenticated, service_role;

-- Existing tables on this surface: RLS already blocks anon writes; remove the privileges too.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.scenario_probabilities FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.detected_scenarios FROM anon, authenticated;

-- Mutating functions: service_role only (admin UI calls them server-side after its own auth check).
REVOKE EXECUTE ON FUNCTION public.scenario_transition(uuid, text, text, text, text, uuid, text, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scenario_lifecycle_tick(integer, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scenario_promote_candidate(uuid, text, text, text, text, integer, text, jsonb, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scenario_apply_output_override(integer, text, jsonb, text, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scenario_publish_run(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.scenario_daily_check_group_day(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scenario_transition(uuid, text, text, text, text, uuid, text, jsonb, integer),
                          public.scenario_lifecycle_tick(integer, text),
                          public.scenario_promote_candidate(uuid, text, text, text, text, integer, text, jsonb, uuid, text, text, integer),
                          public.scenario_apply_output_override(integer, text, jsonb, text, uuid),
                          public.scenario_publish_run(uuid)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 13. Seed A-E and import Days 1-35 unchanged (Day 221 is imported by 20261007100100)
--     Runs LAST: the deferred triggers queued here fire at COMMIT.
-- ---------------------------------------------------------------------------
DO $$ BEGIN PERFORM set_config('app.lifecycle_txn', 'on', true); END $$;
INSERT INTO public.scenarios (code, group_code, legacy_column, name_en, definition_en, status, origin, born_day, display_order) VALUES
 ('A', 'core', 'scenario_a', 'Managed Exit',
  'Within the method horizon, any one of: the US officially announces the end or suspension of the naval blockade of Iran; a US-Iran Hormuz agreement is announced; a US-Iran nuclear deal is signed or agreed; Strait of Hormuz traffic returns to normal (IMF PortWatch 7-day average transit calls >= 60). Diplomatic meetings and the mere continuation of the existing ceasefire do not count.',
  'active', 'legacy_fixed', 1, 10),
 ('B', 'core', 'scenario_b', 'Prolonged War',
  'Sustained, controlled conflict: the status quo (no strikes on Iranian territory, blockade in force, Hormuz closed) continues through the horizon. Computed as the residual 100 - A - C - D.',
  'active', 'legacy_fixed', 1, 20),
 ('C', 'core', 'scenario_c', 'Cascade',
  'Bab el-Mandeb is effectively closed within the horizon (IMF PortWatch 7-day average <= 10) while the Strait of Hormuz is still closed.',
  'active', 'legacy_fixed', 1, 30),
 ('D', 'core', 'scenario_d', 'Escalation Spiral',
  'Within the horizon, any one of: a US kinetic strike on Iranian territory (the US-Iran ceasefire breaks; counts per ruling J1, 2026-10-06); an Israel-Iran strike (that ceasefire breaks); Kharg Island leaves Iranian control; a US or Israeli ground offensive; a new state belligerent strikes Iran.',
  'active', 'legacy_fixed', 1, 40),
 ('E', 'independent', 'scenario_e', 'UAE Direct Strike',
  'An Iranian qualifying strike that targets the UAE within the horizon. Independent of and overlapping with A-D; not part of the 100.',
  'active', 'legacy_fixed',
  coalesce((SELECT min(conflict_day) FROM public.scenario_probabilities WHERE scenario_e IS NOT NULL), 1), 50)
ON CONFLICT (code) DO NOTHING;
DO $$ BEGIN PERFORM set_config('app.lifecycle_txn', 'off', true); END $$;

INSERT INTO public.scenario_lifecycle_events (scenario_id, conflict_day, from_status, to_status, reason_code, actor_kind, actor, reason, evidence)
SELECT s.id, s.born_day, NULL, 'active', 'imported', 'migration', '20261007100000_scenario_registry',
       'Fixed scenario carried over from scenario_probabilities.' || s.legacy_column,
       jsonb_build_array(jsonb_build_object('kind', 'legacy_table', 'table', 'public.scenario_probabilities',
                                            'column', s.legacy_column, 'first_day', s.born_day))
  FROM public.scenarios s
 WHERE s.origin = 'legacy_fixed'
   AND NOT EXISTS (SELECT 1 FROM public.scenario_lifecycle_events e WHERE e.scenario_id = s.id);

-- Fail loudly if any legacy value would not survive numeric(6,3) exactly.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.scenario_probabilities sp
     CROSS JOIN LATERAL (VALUES (sp.scenario_a), (sp.scenario_b), (sp.scenario_c), (sp.scenario_d), (sp.scenario_e)) v(val)
     WHERE v.val IS NOT NULL AND (v.val::numeric(6,3))::double precision <> v.val) THEN
    RAISE EXCEPTION 'a legacy probability is not representable in numeric(6,3); import aborted (values must not change)';
  END IF;
END $$;

DO $$ BEGIN PERFORM set_config('app.legacy_import', 'on', true); END $$;
INSERT INTO public.scenario_daily (scenario_id, conflict_day, method_version, probability, probability_raw, inputs,
                                   is_published, provenance, legacy_row_id, recorded_at)
SELECT s.id, sp.conflict_day, 'legacy-desk-v0', v.val::numeric(6,3), v.val::numeric, '[]'::jsonb, true,
       public.provenance_for(sp.conflict_day, sp.updated_at),
       sp.id, sp.updated_at
  FROM public.scenario_probabilities sp
 CROSS JOIN LATERAL (VALUES ('scenario_a', sp.scenario_a), ('scenario_b', sp.scenario_b), ('scenario_c', sp.scenario_c),
                            ('scenario_d', sp.scenario_d), ('scenario_e', sp.scenario_e)) v(col, val)
  JOIN public.scenarios s ON s.legacy_column = v.col
 WHERE sp.conflict_day BETWEEN 1 AND 35
   AND v.val IS NOT NULL
ON CONFLICT DO NOTHING;
-- app.legacy_import stays 'on' until COMMIT so the deferred legacy sync skips these rows.

COMMIT;
