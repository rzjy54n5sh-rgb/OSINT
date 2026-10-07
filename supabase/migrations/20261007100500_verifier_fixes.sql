-- Migration 20261007100500: verifier_fixes — closes the FAILs found by the independent verifier (Wave 2). NOT APPLIED.
-- Apply after 20261007100000..100400 (and 100350). Each block names the verifier test it closes.
-- Scratch-tested on PostgreSQL 17.11 + 16 (see docs/adr/2026-10-07-dynamic-model-verification.md).

SET client_min_messages = warning;
BEGIN;

-- ---------------------------------------------------------------------------
-- F1 (A13) + F2 (A14, A15): a scenario_daily row must belong to its run (same day, method, override),
-- and an operator-override row must reproduce its OUTPUT override record exactly (day, group, value).
-- F14b (A07c): no write path, not even an import, may record a future conflict day.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_daily_linkage_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r public.scenario_runs%ROWTYPE; o public.scenario_overrides%ROWTYPE; v_code text; v_group text;
BEGIN
  IF NEW.conflict_day > public.get_current_conflict_day() THEN
    RAISE EXCEPTION 'conflict_day % is in the future (today is Day %)', NEW.conflict_day, public.get_current_conflict_day();
  END IF;
  IF NEW.run_id IS NOT NULL THEN
    SELECT * INTO r FROM public.scenario_runs WHERE id = NEW.run_id;
    IF r.conflict_day <> NEW.conflict_day OR r.method_version <> NEW.method_version
       OR r.override_id IS DISTINCT FROM NEW.override_id THEN
      RAISE EXCEPTION 'scenario_daily row (day %, %) does not match its run % (day %, %)',
        NEW.conflict_day, NEW.method_version, NEW.run_id, r.conflict_day, r.method_version;
    END IF;
  END IF;
  IF NEW.method_version = 'operator-override' THEN
    SELECT * INTO o FROM public.scenario_overrides WHERE id = NEW.override_id;
    SELECT s.code, s.group_code INTO v_code, v_group FROM public.scenarios s WHERE s.id = NEW.scenario_id;
    IF o.kind <> 'output' OR o.valid_from_day <> NEW.conflict_day OR o.group_code <> v_group
       OR (o.payload #>> ARRAY['values', v_code])::numeric IS DISTINCT FROM NEW.probability THEN
      RAISE EXCEPTION 'operator-override row for % day % does not match output override % (kind %, day %, group %, value %)',
        v_code, NEW.conflict_day, o.id, o.kind, o.valid_from_day, o.group_code, o.payload #>> ARRAY['values', v_code];
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenario_daily_linkage ON public.scenario_daily;
CREATE TRIGGER scenario_daily_linkage BEFORE INSERT ON public.scenario_daily
  FOR EACH ROW EXECUTE FUNCTION public.scenario_daily_linkage_guard();

CREATE OR REPLACE FUNCTION public.scenario_runs_future_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.conflict_day > public.get_current_conflict_day() THEN
    RAISE EXCEPTION 'conflict_day % is in the future (today is Day %)', NEW.conflict_day, public.get_current_conflict_day();
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenario_runs_future ON public.scenario_runs;
CREATE TRIGGER scenario_runs_future BEFORE INSERT ON public.scenario_runs
  FOR EACH ROW EXECUTE FUNCTION public.scenario_runs_future_guard();

-- ---------------------------------------------------------------------------
-- F14c (A07, A07b): the import flags only re-record rows that are ALREADY published in the legacy table,
-- with exactly that row's updated_at. Setting app.registry_import in a SQL session can no longer backdate
-- an arbitrary run/row (postgres and service_role can both call set_config()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_recorded_at_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF coalesce(current_setting('app.registry_import', true), '') = 'on'
     OR coalesce(current_setting('app.legacy_import', true), '') = 'on' THEN
    IF NOT EXISTS (SELECT 1 FROM public.scenario_probabilities sp
                    WHERE sp.conflict_day = NEW.conflict_day AND sp.updated_at = NEW.recorded_at) THEN
      RAISE EXCEPTION 'import of Day % with recorded_at % does not reproduce a published scenario_probabilities row; recorded_at is not backdatable',
        NEW.conflict_day, NEW.recorded_at;
    END IF;
  ELSE
    NEW.recorded_at := now();
  END IF;
  IF NEW.conflict_day > public.get_current_conflict_day() THEN
    RAISE EXCEPTION 'conflict_day % is in the future (today is Day %)', NEW.conflict_day, public.get_current_conflict_day();
  END IF;
  IF NEW.provenance IS NULL THEN
    NEW.provenance := public.provenance_for(NEW.conflict_day, NEW.recorded_at);
  END IF;
  RETURN NEW;
END $$;

-- ---------------------------------------------------------------------------
-- F3 (L09b): the daily job must not silently undo an operator output override.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.scenario_publish_run(uuid);
CREATE OR REPLACE FUNCTION public.scenario_publish_run(p_run_id uuid, p_supersede_override boolean DEFAULT false)
RETURNS integer LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_day integer; v_verdict text; v_n integer;
BEGIN
  SELECT conflict_day, verdict INTO v_day, v_verdict FROM public.scenario_runs WHERE id = p_run_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'run % not found', p_run_id; END IF;
  IF v_verdict = 'KEEP_FROZEN' THEN RAISE EXCEPTION 'run % is KEEP_FROZEN', p_run_id; END IF;
  IF NOT p_supersede_override AND EXISTS (
       SELECT 1 FROM public.scenario_daily d
        WHERE d.conflict_day = v_day AND d.is_published AND d.method_version = 'operator-override'
          AND d.scenario_id IN (SELECT scenario_id FROM public.scenario_daily WHERE run_id = p_run_id)) THEN
    RAISE EXCEPTION 'day % carries an operator output override; pass p_supersede_override => true (operator decision) to replace it', v_day;
  END IF;
  UPDATE public.scenario_daily d SET is_published = false
   WHERE d.conflict_day = v_day AND d.is_published AND d.run_id IS DISTINCT FROM p_run_id
     AND d.scenario_id IN (SELECT scenario_id FROM public.scenario_daily WHERE run_id = p_run_id);
  UPDATE public.scenario_daily SET is_published = true WHERE run_id = p_run_id AND NOT is_published;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;
REVOKE EXECUTE ON FUNCTION public.scenario_publish_run(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scenario_publish_run(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- F4 (L06c): a job transition is evaluated as of the latest data only. A tick for an old day
-- (re-run, backfill) must not fade a scenario that already has later published readings.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenario_transition_staleness_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.actor_kind = 'job' AND EXISTS (
       SELECT 1 FROM public.scenario_daily d
        WHERE d.scenario_id = NEW.scenario_id AND d.is_published AND d.conflict_day > NEW.conflict_day) THEN
    RAISE EXCEPTION 'job transition for scenario % as of Day % is stale: later published readings exist', NEW.scenario_id, NEW.conflict_day;
  END IF;
  IF EXISTS (SELECT 1 FROM public.scenario_lifecycle_events e
              WHERE e.scenario_id = NEW.scenario_id AND e.conflict_day > NEW.conflict_day AND e.reason_code <> 'imported') THEN
    RAISE EXCEPTION 'lifecycle event for scenario % as of Day % predates an existing later event', NEW.scenario_id, NEW.conflict_day;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS sle_staleness ON public.scenario_lifecycle_events;
CREATE TRIGGER sle_staleness BEFORE INSERT ON public.scenario_lifecycle_events
  FOR EACH ROW EXECUTE FUNCTION public.scenario_transition_staleness_guard();

-- the tick skips (instead of aborting on) scenarios with later readings
CREATE OR REPLACE FUNCTION public.scenario_lifecycle_tick(p_as_of_day integer, p_job text)
RETURNS TABLE (code text, from_status text, to_status text, reason_code text)
LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE r record; v_streak integer; v_resolved boolean; v_latest numeric;
BEGIN
  FOR r IN
    SELECT s.id, s.code, s.status, g.fade_threshold_pct AS thr, g.fade_consecutive_days AS req
      FROM public.scenarios s JOIN public.scenario_groups g ON g.code = s.group_code
     WHERE s.status IN ('active', 'fading') AND s.born_day <= p_as_of_day
       AND NOT EXISTS (SELECT 1 FROM public.scenario_daily d WHERE d.scenario_id = s.id AND d.is_published AND d.conflict_day > p_as_of_day)
       AND NOT EXISTS (SELECT 1 FROM public.scenario_lifecycle_events e WHERE e.scenario_id = s.id AND e.conflict_day > p_as_of_day AND e.reason_code <> 'imported')
     ORDER BY s.code
  LOOP
    v_streak   := public.scenario_days_below_threshold(r.id, p_as_of_day);
    v_resolved := public.scenario_condition_resolved(r.id);
    v_latest   := (SELECT sd.probability FROM public.scenario_daily sd WHERE sd.scenario_id = r.id AND sd.is_published AND sd.conflict_day = p_as_of_day);
    IF r.status = 'active' AND v_resolved THEN
      PERFORM public.scenario_transition(r.id, 'fading', 'condition_resolved', 'job', p_job, NULL, 'Defining market/condition resolved',
        jsonb_build_object('scenario_markets', (SELECT jsonb_agg(jsonb_build_object('id', m.id, 'url', m.url, 'resolved_outcome', m.resolved_outcome,
          'resolved_at', m.resolved_at, 'resolution_source_url', m.resolution_source_url)) FROM public.scenario_markets m
          WHERE m.scenario_id = r.id AND m.role = 'defining_condition' AND m.resolved_at IS NOT NULL)), p_as_of_day);
      code := r.code; from_status := 'active'; to_status := 'fading'; reason_code := 'condition_resolved'; RETURN NEXT;
    ELSIF r.status = 'active' AND v_streak >= r.req THEN
      PERFORM public.scenario_transition(r.id, 'fading', 'threshold_streak', 'job', p_job, NULL,
        format('Below %s%% for %s consecutive days', r.thr, v_streak),
        (SELECT jsonb_agg(jsonb_build_object('conflict_day', sd.conflict_day, 'probability', sd.probability, 'scenario_daily_id', sd.id, 'method', sd.method_label) ORDER BY sd.conflict_day)
           FROM public.scenario_daily sd WHERE sd.scenario_id = r.id AND sd.is_published AND sd.conflict_day > p_as_of_day - v_streak AND sd.conflict_day <= p_as_of_day),
        p_as_of_day);
      code := r.code; from_status := 'active'; to_status := 'fading'; reason_code := 'threshold_streak'; RETURN NEXT;
    ELSIF r.status = 'fading' AND NOT v_resolved AND v_latest IS NOT NULL AND v_latest >= r.thr THEN
      PERFORM public.scenario_transition(r.id, 'active', 'recovered', 'job', p_job, NULL, format('Recovered to %s%% (threshold %s%%)', v_latest, r.thr),
        (SELECT jsonb_agg(jsonb_build_object('conflict_day', sd.conflict_day, 'probability', sd.probability, 'scenario_daily_id', sd.id))
           FROM public.scenario_daily sd WHERE sd.scenario_id = r.id AND sd.is_published AND sd.conflict_day = p_as_of_day), p_as_of_day);
      code := r.code; from_status := 'fading'; to_status := 'active'; reason_code := 'recovered'; RETURN NEXT;
    END IF;
  END LOOP;
END $$;
REVOKE EXECUTE ON FUNCTION public.scenario_lifecycle_tick(integer, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scenario_lifecycle_tick(integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- F14a (A11b): every scenarios status change must be accompanied by a lifecycle event in the same
-- transaction (the GUC flag alone is not a boundary for SQL-capable roles such as postgres/service_role).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenarios_event_required()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.origin = 'legacy_fixed' THEN RETURN NULL; END IF;     -- registry seed (event written by the seed)
  IF TG_OP = 'UPDATE' AND NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NULL; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.scenario_lifecycle_events e
                  WHERE e.scenario_id = NEW.id AND e.to_status = NEW.status AND e.created_at = now()) THEN
    RAISE EXCEPTION 'status of scenario % changed to % without a lifecycle event in the same transaction', NEW.code, NEW.status;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS scenarios_event_required ON public.scenarios;
CREATE CONSTRAINT TRIGGER scenarios_event_required AFTER INSERT OR UPDATE OF status ON public.scenarios
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.scenarios_event_required();

-- ---------------------------------------------------------------------------
-- F5 (L11) + F6 (L08h): exclusive-group membership may only change (birth or retirement of a member)
-- (a) never on/before an already-published day, and (b) not while the legacy A-D table is still the
-- read source (phase 1): the legacy shape cannot show a new member and drops every day after a
-- legacy member retires (verified: Day 222 never reached scenario_probabilities).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.scenarios_exclusive_membership_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_kind text; v_last integer; v_phase1 boolean;
BEGIN
  SELECT kind INTO v_kind FROM public.scenario_groups WHERE code = NEW.group_code;
  IF v_kind <> 'exclusive' THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' AND NEW.origin = 'legacy_fixed' THEN RETURN NEW; END IF;          -- registry seed
  IF TG_OP = 'UPDATE' AND NOT (NEW.status = 'retired' AND OLD.status <> 'retired') THEN RETURN NEW; END IF;
  v_phase1 := EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'scenario_daily_b_sync_legacy' AND tgrelid = 'public.scenario_daily'::regclass);
  IF v_phase1 THEN
    RAISE EXCEPTION 'exclusive-group membership change (% %) refused in phase 1: move readers off scenario_probabilities first (ADR phase 2)',
      NEW.code, CASE WHEN TG_OP = 'INSERT' THEN 'birth' ELSE 'retirement' END;
  END IF;
  SELECT max(d.conflict_day) INTO v_last FROM public.scenario_daily d JOIN public.scenarios s ON s.id = d.scenario_id
   WHERE s.group_code = NEW.group_code AND d.is_published;
  IF TG_OP = 'INSERT' AND NEW.born_day <= coalesce(v_last, 0) THEN
    RAISE EXCEPTION 'born_day % is not after the last published day % of group %', NEW.born_day, v_last, NEW.group_code;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS scenarios_exclusive_membership ON public.scenarios;
CREATE TRIGGER scenarios_exclusive_membership BEFORE INSERT OR UPDATE OF status ON public.scenarios
  FOR EACH ROW EXECUTE FUNCTION public.scenarios_exclusive_membership_guard();

-- ---------------------------------------------------------------------------
-- F9 (W10): approving a detected scenario must create the registry entry (no banner without a scenario).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detected_scenarios_approval_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved'
     AND current_setting('app.lifecycle_txn', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'approve candidates with scenario_promote_candidate() so the registry entry is created' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS detected_scenarios_approval_guard ON public.detected_scenarios;
CREATE TRIGGER detected_scenarios_approval_guard BEFORE UPDATE OF status ON public.detected_scenarios
  FOR EACH ROW EXECUTE FUNCTION public.detected_scenarios_approval_guard();

-- promote_candidate: keep app.lifecycle_txn on across the detected_scenarios UPDATE
CREATE OR REPLACE FUNCTION public.scenario_promote_candidate(
  p_detected_id uuid, p_code text, p_group_code text, p_name_en text, p_definition_en text, p_born_day integer,
  p_origin text, p_evidence jsonb, p_admin_id uuid, p_name_ar text DEFAULT NULL, p_definition_ar text DEFAULT NULL,
  p_display_order integer DEFAULT 100)
RETURNS uuid LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_status public.scenario_detection_status; v_id uuid;
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
  INSERT INTO public.scenarios (code, group_code, name_en, name_ar, definition_en, definition_ar, status, origin, born_day, detected_scenario_id, display_order)
  VALUES (p_code, p_group_code, p_name_en, p_name_ar, p_definition_en, p_definition_ar, 'active', p_origin, p_born_day, p_detected_id, p_display_order)
  RETURNING id INTO v_id;
  UPDATE public.detected_scenarios
     SET status = 'approved', approved_by = p_admin_id, approved_at = now(),
         new_actor = coalesce(new_actor, p_evidence ->> 'new_actor'), new_instrument = coalesce(new_instrument, p_evidence ->> 'new_instrument')
   WHERE id = p_detected_id;
  PERFORM set_config('app.lifecycle_txn', 'off', true);
  INSERT INTO public.scenario_lifecycle_events (scenario_id, conflict_day, from_status, to_status, reason_code, actor_kind, actor, admin_id, reason, evidence)
  VALUES (v_id, p_born_day, NULL, 'active', 'born', 'operator', 'admin', p_admin_id, format('Approved candidate %s (%s)', p_code, p_origin), p_evidence);
  RETURN v_id;
END $$;
REVOKE EXECUTE ON FUNCTION public.scenario_promote_candidate(uuid, text, text, text, text, integer, text, jsonb, uuid, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.scenario_promote_candidate(uuid, text, text, text, text, integer, text, jsonb, uuid, text, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- F7 (W07): admin-sources may still delete an article_sources row; the outlet keeps its own basis.
-- ---------------------------------------------------------------------------
ALTER TABLE public.outlets DROP CONSTRAINT IF EXISTS outlets_article_source_id_fkey;
ALTER TABLE public.outlets ADD CONSTRAINT outlets_article_source_id_fkey
  FOREIGN KEY (article_source_id) REFERENCES public.article_sources(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- F8 (W08) + F12 (A19): snapshots are checked when written, not re-checked on a merge after an
-- article timestamp correction; a non-unknown party label must equal the outlet registry.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.story_articles_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE a record; v_party text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'story_articles rows are never deleted (reassign on merge)' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT ar.source_name, ar.published_at INTO a FROM public.articles ar WHERE ar.id = NEW.article_id;
    IF NEW.outlet_name IS DISTINCT FROM a.source_name OR NEW.published_at IS DISTINCT FROM a.published_at THEN
      RAISE EXCEPTION 'story_articles snapshot (outlet_name/published_at) must equal articles row %', NEW.article_id;
    END IF;
    IF NEW.party_status <> 'unknown' AND NEW.outlet_id IS NOT NULL THEN   -- missing outlet: rejected by story_articles_party_chk
      SELECT o.party_status INTO v_party FROM public.outlets o WHERE o.id = NEW.outlet_id;
      IF v_party IS DISTINCT FROM NEW.party_status THEN
        RAISE EXCEPTION 'party_status % contradicts outlet registry (%)', NEW.party_status, v_party;
      END IF;
    END IF;
  ELSE
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

-- ---------------------------------------------------------------------------
-- F11 (A18): a stated location must be named inside the quoted words (first component of geo_place,
-- e.g. 'Hodeidah' of 'Hodeidah, Yemen').
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.stories_geo_place_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF NEW.geo_article_id IS NOT NULL AND strpos(lower(NEW.geo_quote), lower(btrim(split_part(NEW.geo_place, ',', 1)))) = 0 THEN
    RAISE EXCEPTION 'geo_quote "%" does not name geo_place "%"', NEW.geo_quote, NEW.geo_place;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stories_geo_place ON public.stories;
CREATE TRIGGER stories_geo_place BEFORE INSERT OR UPDATE OF geo_place, geo_quote, geo_article_id ON public.stories
  FOR EACH ROW EXECUTE FUNCTION public.stories_geo_place_guard();

-- ---------------------------------------------------------------------------
-- F13 (A20): candidate alerts count only hosts that the outlet registry classifies independent.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.intel_alerts_candidate_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_hosts integer;
BEGIN
  -- fewer than 2 self-declared independent hosts is already rejected by intel_alerts_candidate_chk
  IF NEW.alert_kind = 'scenario_candidate' AND public.intel_independent_hosts(NEW.evidence) >= 2 THEN
    SELECT count(DISTINCT public.url_host(x.el ->> 'url')) INTO v_hosts
      FROM jsonb_array_elements(NEW.evidence) x(el)
      JOIN public.outlet_aliases al ON al.alias_kind = 'host' AND al.alias = public.url_host(x.el ->> 'url')
      JOIN public.outlets o ON o.id = al.outlet_id AND o.party_status = 'independent';
    IF v_hosts < 2 THEN
      RAISE EXCEPTION 'scenario_candidate alert needs >= 2 hosts registered as independent outlets (found %)', v_hosts;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS intel_alerts_candidate ON public.intel_alerts;
CREATE TRIGGER intel_alerts_candidate BEFORE INSERT ON public.intel_alerts
  FOR EACH ROW EXECUTE FUNCTION public.intel_alerts_candidate_guard();

-- ---------------------------------------------------------------------------
-- F15 (P/MAINTAIN, PG17) + F16 (duplicate policy) + F18 (TRUNCATE by the owner role)
-- ---------------------------------------------------------------------------
REVOKE MAINTAIN ON public.scenario_probabilities, public.detected_scenarios, public.daily_briefings, public.articles FROM anon, authenticated;
-- production already has daily_briefings_authenticated_select (added 2026-10-06); 100300's copy is then redundant
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.daily_briefings'::regclass AND polname = 'daily_briefings_authenticated_select') THEN
    DROP POLICY IF EXISTS daily_briefings_authenticated_read ON public.daily_briefings;
  END IF;
END $$;
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['scenario_groups','scenario_methods','scenarios','scenario_markets','scenario_overrides','scenario_runs',
                           'scenario_daily','scenario_lifecycle_events','report_types','report_type_events','report_documents',
                           'outlets','outlet_aliases','topics','topic_daily','stories','story_articles','story_topics','intel_alerts',
                           'scenario_probabilities']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_no_truncate', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE TRUNCATE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION public.reject_mutation()', t || '_no_truncate', t);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- F19 (L07b): expose "unmeasured" explicitly (E has no qualifying market) instead of a bare NULL.
-- ---------------------------------------------------------------------------
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
       (s.status = 'fading') AS awaiting_retirement_confirmation,
       (SELECT CASE WHEN sd.id IS NULL THEN 'no_reading' WHEN sd.probability IS NULL THEN 'unmeasured' ELSE 'measured' END
          FROM (SELECT 1) one LEFT JOIN public.scenario_daily sd
            ON sd.scenario_id = s.id AND sd.is_published AND sd.conflict_day = asof.d) AS measurement_state
  FROM public.scenarios s
  JOIN public.scenario_groups g ON g.code = s.group_code
  CROSS JOIN asof;
GRANT SELECT ON public.v_scenario_lifecycle TO anon, authenticated, service_role;

COMMIT;
