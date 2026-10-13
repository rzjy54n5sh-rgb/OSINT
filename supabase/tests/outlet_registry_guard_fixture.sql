-- Production intel_alerts candidate guard, verbatim from qmaszkkyukgiludcakjg (pg_get_functiondef /
-- pg_get_constraintdef / pg_get_triggerdef, read 2026-10-13), for outlet_registry_guard_test.sql (scratch only).
SET client_min_messages = warning;
CREATE OR REPLACE FUNCTION public.intel_evidence_valid(ev jsonb)
 RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $function$
  SELECT jsonb_typeof(ev) = 'array' AND jsonb_array_length(ev) >= 1
     AND NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(ev) x(el)
        WHERE NOT coalesce((jsonb_typeof(x.el) = 'object'
          AND (x.el ->> 'url') ~* '^https?://[^[:space:]]+$'
          AND length(btrim(coalesce(x.el ->> 'outlet', ''))) > 0
          AND length(btrim(coalesce(x.el ->> 'published_at', ''))) > 0
          AND (x.el ->> 'party_status') IN ('party', 'state_aligned', 'independent', 'unknown')), false))
$function$;
CREATE OR REPLACE FUNCTION public.intel_independent_hosts(ev jsonb)
 RETURNS integer LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO ''
AS $function$
  SELECT count(DISTINCT public.url_host(x.el ->> 'url'))::integer
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(ev) = 'array' THEN ev ELSE '[]'::jsonb END) x(el)
   WHERE x.el ->> 'party_status' = 'independent'
$function$;
CREATE OR REPLACE FUNCTION public.intel_alerts_candidate_guard()
 RETURNS trigger LANGUAGE plpgsql SET search_path TO ''
AS $function$
DECLARE v_hosts integer;
BEGIN
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
END $function$;
ALTER TABLE public.intel_alerts ADD CONSTRAINT intel_alerts_candidate_chk CHECK (((alert_kind <> 'scenario_candidate'::text) OR (intel_independent_hosts(evidence) >= 2)));
ALTER TABLE public.intel_alerts ADD CONSTRAINT intel_alerts_evidence_chk CHECK (intel_evidence_valid(evidence));
CREATE TRIGGER intel_alerts_candidate BEFORE INSERT ON public.intel_alerts FOR EACH ROW EXECUTE FUNCTION intel_alerts_candidate_guard();
