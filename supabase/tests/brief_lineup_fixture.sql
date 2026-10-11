-- Scratch-only fixture for 20261012090000_brief_lineup_and_scenario_labels.sql. NEVER run on production.
-- Loaded AFTER the live-schema replica (00_live_schema.sql, 01_seed_synthetic.sql, 02_harness.sql), which
-- carries tables and grants but not the registry guards. This adds the live guard functions, triggers and
-- CHECK constraints of report_types / report_type_events / scenarios (copied from pg_get_functiondef /
-- pg_get_constraintdef on production, read-only, 2026-10-11) and the live registry rows of report_types,
-- scenario_groups and scenarios (real values, not invented), so the migration is tested against the same
-- rules it will meet in production.
SET ROLE postgres;

CREATE OR REPLACE FUNCTION public.jsonb_nonempty(j jsonb) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO '' AS $f$
  SELECT coalesce((jsonb_typeof(j) = 'array'  AND jsonb_array_length(j) > 0)
               OR (jsonb_typeof(j) = 'object' AND j <> '{}'::jsonb), false)
$f$;

CREATE OR REPLACE FUNCTION public.report_rule_valid(rule jsonb, kind text) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO '' AS $f$
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
$f$;

CREATE OR REPLACE FUNCTION public.reject_mutation() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $f$
BEGIN
  RAISE EXCEPTION '% on %.% is not allowed (append-only / retention-safe table)',
    TG_OP, TG_TABLE_SCHEMA, TG_TABLE_NAME USING ERRCODE = 'insufficient_privilege';
END $f$;

CREATE OR REPLACE FUNCTION public.report_types_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $f$
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
END $f$;

CREATE OR REPLACE FUNCTION public.scenarios_guard() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $f$
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
END $f$;

CREATE OR REPLACE FUNCTION public.scenarios_event_required() RETURNS trigger LANGUAGE plpgsql SET search_path TO '' AS $f$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.origin = 'legacy_fixed' THEN RETURN NULL; END IF;
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scenario_lifecycle_events e
                  WHERE e.scenario_id = NEW.id AND e.to_status = NEW.status AND e.created_at = now()) THEN
    RAISE EXCEPTION 'status of scenario % changed to % without a lifecycle event in the same transaction', NEW.code, NEW.status;
  END IF;
  RETURN NULL;
END $f$;

-- Live registry rows (production values, 2026-10-11). The synthetic seed's 'general' row is replaced.
UPDATE public.report_types SET name_en = 'General Intelligence Brief', scope = 'general', cadence = 'daily', backfill_cadence = 'daily',
       status = 'active', origin = 'legacy_fixed', activation_rule = '{"metric":"always"}', display_order = 10 WHERE code = 'general';
INSERT INTO public.report_types (code, name_en, scope, country_code, topic_slug, cadence, backfill_cadence, status, origin, activation_rule, pause_rule, proposal_evidence, display_order) VALUES
  ('general_weekly', 'Weekly General Digest', 'general', NULL, NULL, 'weekly', 'weekly', 'active', 'operator', '{"metric":"always"}', NULL, NULL, 15),
  ('egypt', 'Egypt Country Brief', 'country', 'EG', NULL, 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', NULL, NULL, 20),
  ('uae', 'UAE Country Brief', 'country', 'AE', NULL, 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', NULL, NULL, 30),
  ('eschatology', 'Eschatology and Geopolitics Brief', 'thematic', NULL, NULL, 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', NULL, NULL, 40),
  ('business', 'Business Opportunities Brief', 'thematic', NULL, NULL, 'daily', 'weekly', 'active', 'legacy_fixed', '{"metric":"always"}', NULL, NULL, 50),
  ('horn', 'Horn of Africa & Red Sea Brief', 'theatre', NULL, 'horn-of-africa', 'daily', 'none', 'active', 'threshold',
   '{"scope": {"country_codes": ["ET", "ER", "SD", "SO", "DJ"]}, "metric": "articles", "min_value": 5, "window_days": 7, "consecutive_windows": 1}',
   '{"scope": {"country_codes": ["ET", "ER", "SD", "SO", "DJ"]}, "metric": "articles", "max_value": 0, "window_days": 14, "consecutive_windows": 2}',
   '[{"kind": "operator_decision", "actor": "Omar", "at": "2026-10-07T08:05+03:00", "decision": "Full theatre: news, daily Horn of Africa & Red Sea brief"}]', 100);

INSERT INTO public.scenario_groups (code, name_en, kind, sum_target, fade_threshold_pct, fade_consecutive_days, description) VALUES
  ('core', 'Core outcome set', 'exclusive', 100, 10, 14, 'Mutually exclusive outcomes over the method horizon; A-D at creation. Members sum to exactly 100.'),
  ('independent', 'Independent scenarios', 'independent', NULL, 10, 14, 'Overlapping sub-branch scenarios outside the 100 (E UAE Direct Strike at creation).')
ON CONFLICT DO NOTHING;
INSERT INTO public.scenarios (id, code, group_code, legacy_column, name_en, definition_en, status, origin, born_day, display_order) VALUES
  ('e4e7c469-10d1-407f-ad0d-8d0c64451e84', 'A', 'core', 'scenario_a', 'Managed Exit', 'Within the method horizon, any one of: the US officially announces the end or suspension of the naval blockade of Iran; a US-Iran Hormuz agreement is announced; a US-Iran nuclear deal is signed or agreed; Strait of Hormuz traffic returns to normal (IMF PortWatch 7-day average transit calls >= 60). Diplomatic meetings and the mere continuation of the existing ceasefire do not count.', 'active', 'legacy_fixed', 1, 10),
  ('3453b78c-2790-45c3-84e8-a12788b56aef', 'B', 'core', 'scenario_b', 'Prolonged War', 'Sustained, controlled conflict: the status quo (no strikes on Iranian territory, blockade in force, Hormuz closed) continues through the horizon. Computed as the residual 100 - A - C - D.', 'active', 'legacy_fixed', 1, 20),
  ('82f06d21-6769-4f9f-bd13-b9f135dbd2e2', 'C', 'core', 'scenario_c', 'Cascade', 'Bab el-Mandeb is effectively closed within the horizon (IMF PortWatch 7-day average <= 10) while the Strait of Hormuz is still closed.', 'active', 'legacy_fixed', 1, 30),
  ('970802a1-0a8b-4079-ae37-1f57986d2560', 'D', 'core', 'scenario_d', 'Escalation Spiral', 'Within the horizon, any one of: a US kinetic strike on Iranian territory (the US-Iran ceasefire breaks; counts per ruling J1, 2026-10-06); an Israel-Iran strike (that ceasefire breaks); Kharg Island leaves Iranian control; a US or Israeli ground offensive; a new state belligerent strikes Iran.', 'active', 'legacy_fixed', 1, 40),
  ('68af7b28-caaa-42ea-a049-ecea3efb991e', 'E', 'independent', 'scenario_e', 'UAE Direct Strike', 'An Iranian qualifying strike that targets the UAE within the horizon. Independent of and overlapping with A-D; not part of the 100.', 'active', 'legacy_fixed', 15, 50);

-- Live CHECK constraints
ALTER TABLE public.report_types
  ADD CONSTRAINT report_types_activation CHECK (report_rule_valid(activation_rule, 'activation'::text)),
  ADD CONSTRAINT report_types_backfill_chk CHECK (backfill_cadence = ANY (ARRAY['daily'::text, 'weekly'::text, 'none'::text])),
  ADD CONSTRAINT report_types_cadence_chk CHECK (cadence = ANY (ARRAY['daily'::text, 'weekly'::text])),
  ADD CONSTRAINT report_types_code_chk CHECK (code ~ '^[a-z][a-z0-9_]{1,31}$'::text),
  ADD CONSTRAINT report_types_country_chk CHECK ((((scope = 'country'::text) = (country_code IS NOT NULL)) AND ((country_code IS NULL) OR (country_code ~ '^[A-Z]{2}$'::text)))),
  ADD CONSTRAINT report_types_evidence CHECK (((origin <> 'threshold'::text) OR jsonb_nonempty(proposal_evidence))),
  ADD CONSTRAINT report_types_origin_chk CHECK (origin = ANY (ARRAY['legacy_fixed'::text, 'threshold'::text, 'operator'::text])),
  ADD CONSTRAINT report_types_pause CHECK (((pause_rule IS NULL) OR report_rule_valid(pause_rule, 'pause'::text))),
  ADD CONSTRAINT report_types_scope_chk CHECK (scope = ANY (ARRAY['general'::text, 'country'::text, 'theatre'::text, 'thematic'::text])),
  ADD CONSTRAINT report_types_status_chk CHECK (status = ANY (ARRAY['candidate'::text, 'active'::text, 'paused'::text, 'retired'::text, 'rejected'::text])),
  ADD CONSTRAINT report_types_theatre_chk CHECK (((scope <> 'theatre'::text) OR (topic_slug IS NOT NULL)));
ALTER TABLE public.report_type_events
  ADD CONSTRAINT report_type_events_report_type_fkey FOREIGN KEY (report_type) REFERENCES public.report_types(code),
  ADD CONSTRAINT report_type_events_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES public.admin_users(id),
  ADD CONSTRAINT rte_activation_op CHECK (((NOT ((NOT (from_status IS DISTINCT FROM 'candidate'::text)) AND (to_status = 'active'::text))) OR (actor_kind = 'operator'::text))),
  ADD CONSTRAINT rte_actor_chk CHECK (actor_kind = ANY (ARRAY['migration'::text, 'job'::text, 'operator'::text])),
  ADD CONSTRAINT rte_evidence CHECK (jsonb_nonempty(evidence)),
  ADD CONSTRAINT rte_op_only CHECK (((to_status <> ALL (ARRAY['retired'::text, 'rejected'::text])) OR (actor_kind = 'operator'::text))),
  ADD CONSTRAINT rte_operator_admin CHECK (((actor_kind <> 'operator'::text) OR (admin_id IS NOT NULL))),
  ADD CONSTRAINT rte_reason_len CHECK (length(btrim(reason)) >= 5),
  ADD CONSTRAINT rte_status_chk CHECK (to_status = ANY (ARRAY['candidate'::text, 'active'::text, 'paused'::text, 'retired'::text, 'rejected'::text]));
ALTER TABLE public.scenarios
  ADD CONSTRAINT scenarios_code_key UNIQUE (code),
  ADD CONSTRAINT scenarios_definition_len CHECK (length(btrim(definition_en)) >= 20),
  ADD CONSTRAINT scenarios_status_chk CHECK (status = ANY (ARRAY['active'::text, 'fading'::text, 'retired'::text]));
ALTER TABLE public.daily_briefings
  ADD CONSTRAINT daily_briefings_report_type_fkey FOREIGN KEY (report_type) REFERENCES public.report_types(code);

-- Live triggers
CREATE TRIGGER report_types_guard BEFORE INSERT OR DELETE OR UPDATE ON public.report_types FOR EACH ROW EXECUTE FUNCTION public.report_types_guard();
CREATE TRIGGER report_types_updated_at BEFORE UPDATE ON public.report_types FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER report_types_no_truncate BEFORE TRUNCATE ON public.report_types FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation();
CREATE TRIGGER rte_immutable BEFORE DELETE OR UPDATE ON public.report_type_events FOR EACH ROW EXECUTE FUNCTION public.reject_mutation();
CREATE TRIGGER report_type_events_no_truncate BEFORE TRUNCATE ON public.report_type_events FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation();
CREATE TRIGGER scenarios_guard BEFORE INSERT OR DELETE OR UPDATE ON public.scenarios FOR EACH ROW EXECUTE FUNCTION public.scenarios_guard();
CREATE TRIGGER scenarios_updated_at BEFORE UPDATE ON public.scenarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE CONSTRAINT TRIGGER scenarios_event_required AFTER INSERT OR UPDATE OF status ON public.scenarios DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.scenarios_event_required();
CREATE TRIGGER scenarios_no_truncate BEFORE TRUNCATE ON public.scenarios FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation();

-- A second published brief so the "daily_briefings untouched" check has more than one row.
INSERT INTO public.daily_briefings (id, conflict_day, report_type, title, sections, provenance)
  VALUES ('00000000-0000-0000-0000-0000000bb002', 222, 'egypt', 'SYNTHETIC archived egypt brief', '[]', 'contemporaneous');
RESET ROLE;
