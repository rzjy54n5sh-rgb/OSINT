-- Scratch-only fixture for 20261012120000_reject_paused_report_types.sql. NEVER run on production.
-- Loaded AFTER: live-schema replica + security_hardening + trust_ledgers + brief_lineup_fixture.sql +
-- 20261012090000_brief_lineup_and_scenario_labels.sql (so egypt / uae / business are really 'paused' by the
-- real migration). The replica carries daily_briefings without its unique indexes; this adds the two that
-- production has (pg_get_indexdef / pg_get_constraintdef, read-only, 2026-10-12):
--   daily_briefings_day_type_uniq                              UNIQUE INDEX (conflict_day, report_type)
--   daily_briefings_conflict_day_report_type_country_code_key  UNIQUE (conflict_day, report_type, country_code)
-- and SYNTHETIC historical briefs of paused types generated 40 days ago (outside the 2-hour no-silent-edit
-- window, like every production egypt / uae / business brief), which corrections must still be able to fix.
SET ROLE postgres;

CREATE UNIQUE INDEX IF NOT EXISTS daily_briefings_day_type_uniq ON public.daily_briefings (conflict_day, report_type);
DO $c$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.daily_briefings'::regclass
                    AND conname = 'daily_briefings_conflict_day_report_type_country_code_key') THEN
    ALTER TABLE public.daily_briefings
      ADD CONSTRAINT daily_briefings_conflict_day_report_type_country_code_key UNIQUE (conflict_day, report_type, country_code);
  END IF;
END $c$;

-- Historical briefs (Day 100): three paused types + one active type; Day 101: an active type only. All outside
-- the edit window.
INSERT INTO public.daily_briefings (id, conflict_day, report_type, title, sections, provenance, generated_at) VALUES
  ('00000000-0000-0000-0000-0000000cc100', 100, 'egypt',    'SYNTHETIC old egypt brief',    '[]', 'contemporaneous', now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000cc101', 100, 'uae',      'SYNTHETIC old uae brief',      '[]', 'contemporaneous', now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000cc102', 100, 'business', 'SYNTHETIC old business brief', '[]', 'contemporaneous', now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000cc103', 100, 'general',  'SYNTHETIC old general brief',  '[]', 'contemporaneous', now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000cc104', 101, 'general',  'SYNTHETIC old general brief 101', '[]', 'contemporaneous', now() - interval '39 days')
ON CONFLICT DO NOTHING;
RESET ROLE;
