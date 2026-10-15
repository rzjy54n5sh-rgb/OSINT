-- Scratch-only: copies the production dump (wg_dump.db / wg_dump.cr, loaded by run_writer_guard_tests.sh) into
-- public.daily_briefings / public.country_reports as EXISTING rows, BEFORE the writer guard is applied — the same
-- position production is in. NEVER run on production.
-- Synthetic replica rows of Days 219-228 are moved to Day + 10000 first (they would collide with the real ones on
-- (conflict_day, report_type)); synthetic country_reports are replaced by the 25 real rows. Triggers are switched
-- off only for this load and restored to their production state (no_silent_edit ALWAYS, the others ORIGIN).
SET ROLE postgres;
BEGIN;
ALTER TABLE public.daily_briefings DISABLE TRIGGER daily_briefings_no_silent_edit;
ALTER TABLE public.daily_briefings DISABLE TRIGGER daily_briefings_provenance;
ALTER TABLE public.daily_briefings DISABLE TRIGGER daily_briefings_reject_inactive_type;
UPDATE public.daily_briefings SET conflict_day = conflict_day + 10000      -- move synthetic rows out of the way
 WHERE conflict_day BETWEEN 219 AND 228                                    -- (kept: report_documents references one)
   AND id NOT IN (SELECT (j->>'id')::uuid FROM wg_dump.db);
INSERT INTO public.daily_briefings
SELECT (jsonb_populate_record(NULL::public.daily_briefings, j)).* FROM wg_dump.db;
ALTER TABLE public.daily_briefings ENABLE ALWAYS TRIGGER daily_briefings_no_silent_edit;
ALTER TABLE public.daily_briefings ENABLE TRIGGER daily_briefings_provenance;
ALTER TABLE public.daily_briefings ENABLE TRIGGER daily_briefings_reject_inactive_type;
DELETE FROM public.country_reports;
INSERT INTO public.country_reports
SELECT (jsonb_populate_record(NULL::public.country_reports, j)).* FROM wg_dump.cr;
COMMIT;
RESET ROLE;
