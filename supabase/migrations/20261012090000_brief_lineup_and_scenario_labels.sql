-- =====================================================================================================
-- 20261012090000_brief_lineup_and_scenario_labels.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (PG 17)
--
-- Operator-approved changes (strategy agreed 2026-10-08, WS5a):
--
--   §1  Brief line-up (public.report_types)
--       + overnight            daily   "Overnight Brief" — what changed since the evening, before the Gulf day
--       + egypt_gulf_economy   daily   "Egypt & Gulf Economy Brief" — replaces separate egypt / uae / business
--       ~ eschatology          cadence daily -> WEEKLY, displayed as "Religion, Ideology & Mobilisation"
--       ~ business             displayed as "Economic Impact & Market Access" (archive)
--       ~ egypt, uae, business status active -> PAUSED (no new rows going forward). Retirement is operator-only
--         (report_type_transition with an admin id) and is left to the operator. Old rows are untouched:
--         daily_briefings is NOT modified by this migration, every published brief stays readable at its URL.
--       Every status change writes a report_type_events row (actor_kind 'migration').
--
--   §2  Scenario labels (public.scenarios display text only)
--       Each label now says what its market measures. The previous name / definition is kept in the new
--       columns former_name_en / former_definition_en (history is never silently rewritten).
--         A  Managed Exit       -> US announces blockade end or a deal
--         B  Prolonged War      -> None of A, C or D               (+ definition explains the Fréchet range)
--         C  Cascade            -> Bab el-Mandeb closed while Hormuz is shut
--         D  Escalation Spiral  -> US or Israeli strike on Iran (ceasefire breaks)
--         E  UAE Direct Strike  -> Iran targets the UAE
--       NOT touched: scenario_probabilities (Hard Ban), scenario_daily, scenario_runs, codes, lifecycle columns.
--
--   §3  Grants (explicit; security_hardening revokes default privileges, nothing is relied on implicitly)
--   §4  Post-condition asserts
--
-- Idempotent: re-running is a no-op (ON CONFLICT DO NOTHING, guarded UPDATEs, events only for rows that
-- actually changed, ADD COLUMN IF NOT EXISTS). ONE TRANSACTION (own BEGIN/COMMIT). Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261012090000_brief_lineup_and_scenario_labels.sql
-- Depends on 20261007100000_scenario_registry.sql and 20261007100300_report_registry.sql (both applied).
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight --------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regclass('public.report_types') IS NULL OR to_regclass('public.report_type_events') IS NULL
     OR to_regclass('public.scenarios') IS NULL OR to_regclass('public.daily_briefings') IS NULL THEN
    RAISE EXCEPTION 'preflight: report_types / report_type_events / scenarios / daily_briefings missing';
  END IF;
  IF (SELECT count(*) FROM public.report_types WHERE code IN ('general', 'eschatology', 'business', 'egypt', 'uae')) <> 5 THEN
    RAISE EXCEPTION 'preflight: expected report types general, eschatology, business, egypt, uae';
  END IF;
  IF (SELECT count(*) FROM public.scenarios WHERE code IN ('A', 'B', 'C', 'D', 'E')) <> 5 THEN
    RAISE EXCEPTION 'preflight: expected scenarios A-E';
  END IF;
END $pre$;

-- §1 brief line-up ---------------------------------------------------------------------------------
-- report_types_guard lets only a lifecycle transaction insert a non-candidate type or change a status.
-- This migration is that transaction (operator-approved line-up); the flag is switched off again below.
DO $on$ BEGIN PERFORM set_config('app.lifecycle_txn', 'on', true); END $on$;

INSERT INTO public.report_types
  (code, name_en, scope, cadence, backfill_cadence, status, origin, activation_rule, display_order, proposal_evidence)
VALUES
  ('overnight', 'Overnight Brief', 'general', 'daily', 'none', 'active', 'operator', '{"metric":"always"}'::jsonb, 5,
   '[{"kind":"operator_decision","actor":"Omar","at":"2026-10-08","decision":"Brief line-up: add Overnight (what changed since the evening, before the Gulf day); collection cut-off 01:30 UTC, routine 01:45 UTC"}]'::jsonb),
  ('egypt_gulf_economy', 'Egypt & Gulf Economy Brief', 'thematic', 'daily', 'none', 'active', 'operator', '{"metric":"always"}'::jsonb, 18,
   '[{"kind":"operator_decision","actor":"Omar","at":"2026-10-08","decision":"Brief line-up: one Egypt & Gulf Economy brief replaces the separate egypt, uae and business briefs going forward"}]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- Birth events for the two new types (once).
INSERT INTO public.report_type_events (report_type, conflict_day, from_status, to_status, actor_kind, actor, reason, evidence)
SELECT v.code, ((now() AT TIME ZONE 'UTC')::date - date '2026-02-28') + 1, NULL, 'active', 'migration',
       '20261012090000_brief_lineup_and_scenario_labels', v.reason,
       '[{"kind":"operator_decision","actor":"Omar","at":"2026-10-08","ref":"strategy agreed 2026-10-08 (WS5a)"}]'::jsonb
  FROM (VALUES ('overnight', 'New daily type in the operator-approved line-up (2026-10-08)'),
               ('egypt_gulf_economy', 'New daily type replacing egypt, uae and business going forward (2026-10-08)')) v(code, reason)
 WHERE NOT EXISTS (SELECT 1 FROM public.report_type_events e
                    WHERE e.report_type = v.code AND e.to_status = 'active'
                      AND e.actor = '20261012090000_brief_lineup_and_scenario_labels');

-- Renames / cadence (display only; codes and URLs unchanged).
UPDATE public.report_types SET name_en = 'Religion, Ideology & Mobilisation', cadence = 'weekly'
 WHERE code = 'eschatology' AND (name_en, cadence) IS DISTINCT FROM ('Religion, Ideology & Mobilisation', 'weekly');
UPDATE public.report_types SET name_en = 'Economic Impact & Market Access'
 WHERE code = 'business' AND name_en IS DISTINCT FROM 'Economic Impact & Market Access';

-- Display order: overnight, general, weekly digest, horn, egypt & gulf economy, religion (weekly), then archive.
UPDATE public.report_types r SET display_order = v.ord
  FROM (VALUES ('overnight', 5), ('general', 10), ('general_weekly', 15), ('horn', 16), ('egypt_gulf_economy', 18),
               ('eschatology', 40), ('egypt', 60), ('uae', 61), ('business', 62)) v(code, ord)
 WHERE r.code = v.code AND r.display_order IS DISTINCT FROM v.ord;

-- Pause egypt / uae / business (only while active; paused or operator-retired rows are left alone).
WITH paused AS (
  UPDATE public.report_types SET status = 'paused'
   WHERE code IN ('egypt', 'uae', 'business') AND status = 'active'
  RETURNING code
)
INSERT INTO public.report_type_events (report_type, conflict_day, from_status, to_status, actor_kind, actor, reason, evidence)
SELECT p.code, ((now() AT TIME ZONE 'UTC')::date - date '2026-02-28') + 1, 'active', 'paused', 'migration',
       '20261012090000_brief_lineup_and_scenario_labels',
       'Replaced by egypt_gulf_economy going forward (operator-approved line-up 2026-10-08); existing briefs stay published',
       '[{"kind":"operator_decision","actor":"Omar","at":"2026-10-08","ref":"strategy agreed 2026-10-08 (WS5a)"}]'::jsonb
  FROM paused p;

DO $off$ BEGIN PERFORM set_config('app.lifecycle_txn', 'off', true); END $off$;

-- §2 scenario display labels -------------------------------------------------------------------------
ALTER TABLE public.scenarios ADD COLUMN IF NOT EXISTS former_name_en text;
ALTER TABLE public.scenarios ADD COLUMN IF NOT EXISTS former_definition_en text;
COMMENT ON COLUMN public.scenarios.former_name_en IS
  'Display name before migration 20261012090000 (labels renamed to say what each market measures, operator-approved 2026-10-08).';
COMMENT ON COLUMN public.scenarios.former_definition_en IS
  'definition_en before migration 20261012090000, kept when the definition text was changed (B only).';

-- Rename only from the exact previous label, so a later operator rename is never overwritten.
UPDATE public.scenarios s SET former_name_en = s.name_en, name_en = v.new_name
  FROM (VALUES ('A', 'Managed Exit',      'US announces blockade end or a deal'),
               ('B', 'Prolonged War',     'None of A, C or D'),
               ('C', 'Cascade',           'Bab el-Mandeb closed while Hormuz is shut'),
               ('D', 'Escalation Spiral', 'US or Israeli strike on Iran (ceasefire breaks)'),
               ('E', 'UAE Direct Strike', 'Iran targets the UAE')) v(code, old_name, new_name)
 WHERE s.code = v.code AND s.name_en = v.old_name;

-- B's definition described a state ("status quo continues") that the residual does not measure.
UPDATE public.scenarios
   SET former_definition_en = definition_en,
       definition_en = 'None of the A, C or D events happens within the method horizon. No market measures this directly. '
                    || 'Because A, C and D can happen in the same window, its probability lies between 100 - (A + C + D) and '
                    || '100 - the largest of A, C and D (Fréchet bounds); the method''s residual 100 - A - C - D is the low end '
                    || 'of that range, and the site shows the range.'
 WHERE code = 'B' AND definition_en NOT LIKE 'None of the A, C or D events%';

-- §3 grants (explicit) -------------------------------------------------------------------------------
REVOKE ALL ON public.report_types, public.report_type_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.report_types TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.report_types, public.report_type_events TO service_role;
REVOKE DELETE, TRUNCATE ON public.report_types, public.report_type_events FROM service_role;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.scenarios FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.scenarios TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.scenarios TO service_role;
REVOKE DELETE, TRUNCATE ON public.scenarios FROM service_role;

-- §4 post-conditions ---------------------------------------------------------------------------------
DO $post$
DECLARE v_bad text;
BEGIN
  SELECT string_agg(code, ', ') INTO v_bad FROM (VALUES ('overnight'), ('egypt_gulf_economy')) n(code)
   WHERE NOT EXISTS (SELECT 1 FROM public.report_types r WHERE r.code = n.code AND r.status = 'active' AND r.cadence = 'daily');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'post: new type(s) not active/daily: %', v_bad; END IF;

  IF NOT EXISTS (SELECT 1 FROM public.report_types WHERE code = 'eschatology' AND cadence = 'weekly'
                   AND name_en = 'Religion, Ideology & Mobilisation') THEN
    RAISE EXCEPTION 'post: eschatology not weekly / renamed';
  END IF;

  SELECT string_agg(code, ', ') INTO v_bad FROM public.report_types
   WHERE code IN ('egypt', 'uae', 'business') AND status NOT IN ('paused', 'retired');
  IF v_bad IS NOT NULL THEN RAISE EXCEPTION 'post: still active: %', v_bad; END IF;

  IF has_table_privilege('anon', 'public.report_type_events', 'SELECT')
     OR has_table_privilege('anon', 'public.scenarios', 'UPDATE')
     OR NOT has_column_privilege('anon', 'public.scenarios', 'former_name_en', 'SELECT')
     OR NOT has_table_privilege('anon', 'public.report_types', 'SELECT') THEN
    RAISE EXCEPTION 'post: grants not as intended';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.scenarios WHERE code = 'B' AND definition_en LIKE '%Fréchet%') THEN
    RAISE EXCEPTION 'post: B definition not updated';
  END IF;
END $post$;

COMMIT;
