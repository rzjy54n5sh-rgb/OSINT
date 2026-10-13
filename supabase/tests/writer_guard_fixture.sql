-- Scratch-only fixture for 20261013121000_writer_guard.sql. NEVER run on production.
-- Loaded AFTER: live-schema replica + security_hardening + trust_ledgers + brief_lineup_fixture.sql +
-- 20261012090000_brief_lineup (egypt / uae / business paused) + reject_paused_report_types_fixture.sql +
-- 20261012120000_reject_paused_report_types.sql.
-- 1. Installs production's provenance trigger on daily_briefings (the replica lacks it), copied verbatim from
--    pg_get_functiondef on production (read-only, 2026-10-13), so daily_briefings carries exactly the four
--    production triggers: daily_briefings_no_silent_edit (ALWAYS), daily_briefings_provenance,
--    daily_briefings_reject_inactive_type, + the writer guard once the migration is applied.
-- 2. Creates wg_dump.db / wg_dump.cr; run_writer_guard_tests.sh \copy-loads the production dump into them
--    (49 daily_briefings rows of Days 219-228 and all 25 country_reports rows, exported read-only with
--    SELECT to_jsonb(b)::text FROM daily_briefings b WHERE conflict_day BETWEEN 219 AND 228 /
--    SELECT to_jsonb(c)::text FROM country_reports c), then runs writer_guard_load.sql.
SET ROLE postgres;

CREATE OR REPLACE FUNCTION public.conflict_day_cutoff(p_day integer)
RETURNS timestamptz LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = '' AS $$
  SELECT ((date '2026-02-28' + p_day)::timestamp AT TIME ZONE 'UTC') + interval '6 hours'
$$;
CREATE OR REPLACE FUNCTION public.provenance_for(p_day integer, p_recorded timestamp with time zone)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  SELECT CASE WHEN p_recorded < public.conflict_day_cutoff(p_day) THEN 'contemporaneous' ELSE 'reconstructed' END
$function$;

CREATE OR REPLACE FUNCTION public.daily_briefings_provenance()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE v_by_clock text;
BEGIN
  v_by_clock := public.provenance_for(NEW.conflict_day, now());
  -- a writer using the new quality vocabulary states provenance through it
  IF NEW.provenance IS NULL AND NEW.quality IN ('contemporaneous', 'reconstructed') THEN
    NEW.provenance := NEW.quality;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.provenance IS NULL THEN
      NEW.provenance := v_by_clock;
    ELSIF NEW.provenance = 'contemporaneous' AND v_by_clock = 'reconstructed' THEN
      RAISE EXCEPTION 'Day % brief written after its day cannot be labelled contemporaneous', NEW.conflict_day;
    END IF;
  ELSE
    IF NEW.provenance IS NULL THEN NEW.provenance := OLD.provenance; END IF;
    IF OLD.provenance = 'reconstructed' AND NEW.provenance = 'contemporaneous' THEN
      RAISE EXCEPTION 'a reconstructed brief cannot be relabelled contemporaneous';
    END IF;
    IF NEW.conflict_day <> OLD.conflict_day AND NEW.provenance = 'contemporaneous' AND v_by_clock = 'reconstructed' THEN
      RAISE EXCEPTION 'moving a brief to another day makes it reconstructed';
    END IF;
  END IF;
  -- keep the new quality vocabulary consistent with provenance
  IF NEW.quality IN ('contemporaneous', 'reconstructed') AND NEW.quality <> NEW.provenance THEN
    RAISE EXCEPTION 'quality % contradicts provenance %', NEW.quality, NEW.provenance;
  END IF;
  RETURN NEW;
END $function$;
DROP TRIGGER IF EXISTS daily_briefings_provenance ON public.daily_briefings;
CREATE TRIGGER daily_briefings_provenance BEFORE INSERT OR UPDATE ON public.daily_briefings
  FOR EACH ROW EXECUTE FUNCTION public.daily_briefings_provenance();

CREATE SCHEMA IF NOT EXISTS wg_dump;
CREATE TABLE IF NOT EXISTS wg_dump.db (j jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS wg_dump.cr (j jsonb NOT NULL);
GRANT USAGE ON SCHEMA wg_dump TO PUBLIC;
GRANT SELECT ON wg_dump.db, wg_dump.cr TO PUBLIC;
RESET ROLE;
