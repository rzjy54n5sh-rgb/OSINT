-- Migration 20261007100200: scenario_legacy_guard — scenario_probabilities becomes derived-only
--
-- NOT APPLIED by the author. Apply ONLY after the daily scenario writer (Claude scheduled task /
-- GitHub Action) writes scenario_runs + scenario_daily instead of scenario_probabilities.
-- From then on the physical table is written exclusively by the deferred sync trigger
-- scenario_daily_b_sync_legacy (20261007100000 section 10). Every current READER keeps working.
-- A direct write (which would carry no inputs — operator ruling "dont accept any invented claim")
-- fails loudly instead of silently diverging from the registry.
--
-- Rollback: DROP TRIGGER scenario_probabilities_derived_only ON public.scenario_probabilities;

SET client_min_messages = warning;
BEGIN;

CREATE OR REPLACE FUNCTION public.scenario_probabilities_derived_only()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF current_setting('app.scenario_sync', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'scenario_probabilities is derived from scenario_daily (registry). Write scenario_runs/scenario_daily via the market-anchored job, or use scenario_apply_output_override().'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'scenario_probabilities rows are never deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS scenario_probabilities_derived_only ON public.scenario_probabilities;
CREATE TRIGGER scenario_probabilities_derived_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.scenario_probabilities
  FOR EACH ROW EXECUTE FUNCTION public.scenario_probabilities_derived_only();
-- Row triggers do not see TRUNCATE.
REVOKE TRUNCATE ON public.scenario_probabilities FROM service_role, anon, authenticated;

COMMIT;
