-- =====================================================================================================
-- 20261013120100_candidate_guard_distinct_outlets.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg
--
-- intel_alerts_candidate_guard (20261007100500) required ">= 2 hosts registered as independent outlets" but
-- counted DISTINCT HOSTS. Once 20261013120000_outlet_registry_seed.sql registers several hosts per outlet
-- (bbc.com + bbc.co.uk, five cnn.com hosts, three naharnet.com hosts, sudantribune.com/.net), a scenario
-- candidate resting on ONE outlet passed. It also counted evidence the producer itself declared
-- party/state_aligned/unknown (e.g. Al Jazeera on a Qatar story, DECISION-002).
-- Fix: count DISTINCT registered outlets, only among evidence rows declared 'independent'.
-- Function body only; trigger and CHECK unchanged. Idempotent (CREATE OR REPLACE).
-- =====================================================================================================
BEGIN;
CREATE OR REPLACE FUNCTION public.intel_alerts_candidate_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
DECLARE v_outlets integer;
BEGIN
  -- fewer than 2 self-declared independent hosts is already rejected by intel_alerts_candidate_chk
  IF NEW.alert_kind = 'scenario_candidate' AND public.intel_independent_hosts(NEW.evidence) >= 2 THEN
    SELECT count(DISTINCT o.id) INTO v_outlets
      FROM jsonb_array_elements(NEW.evidence) x(el)
      JOIN public.outlet_aliases al ON al.alias_kind = 'host' AND al.alias = public.url_host(x.el ->> 'url')
      JOIN public.outlets o ON o.id = al.outlet_id AND o.party_status = 'independent'
     WHERE x.el ->> 'party_status' = 'independent';
    IF v_outlets < 2 THEN
      RAISE EXCEPTION 'scenario_candidate alert needs >= 2 distinct outlets registered as independent (found %)', v_outlets;
    END IF;
  END IF;
  RETURN NEW;
END $$;
COMMIT;
