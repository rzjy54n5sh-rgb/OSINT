-- =====================================================================================================
-- 20261012120000_reject_paused_report_types.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (PG 17)
--
-- 20261012090000_brief_lineup_and_scenario_labels.sql set report_types.status = 'paused' for egypt, uae and
-- business ("no new rows going forward"), but daily_briefings only has a plain FK to report_types(code), so a
-- writer can still insert a brand-new brief of a paused type. This adds the missing guard:
--
--   daily_briefings_reject_inactive_type  BEFORE INSERT OR UPDATE OF report_type, FOR EACH ROW
--     A NEW brief (a new (conflict_day, report_type)) may only be created for a report type whose
--     report_types.status = 'active'. 'candidate' (not yet activated by the operator), 'paused', 'retired'
--     and 'rejected' types are refused with check_violation (PostgREST: HTTP 400) and a HINT.
--     Re-pointing an existing brief to an inactive type (UPDATE that changes report_type) is refused too.
--
-- What is NOT affected
--   * Existing rows of paused types (egypt / uae / business, Days 1-227) are not touched by this migration and
--     stay updatable: an UPDATE that does not change report_type passes (UPDATE OF report_type does not even
--     fire unless report_type is in the SET list; when it is — PostgREST upsert sets every column — an
--     unchanged value returns at once).
--   * The corrections flow (20261009090000_trust_ledgers.sql: SET LOCAL app.correction_id, then
--     INSERT ... ON CONFLICT (conflict_day, report_type) DO UPDATE, or a plain UPDATE) on an OLD paused-type row.
--     A BEFORE INSERT row trigger fires BEFORE ON CONFLICT detects the conflict, so a naive "type is paused ->
--     raise" would break that upsert. The INSERT branch therefore allows the row when a brief with the same
--     (conflict_day, report_type) ALREADY EXISTS: daily_briefings_day_type_uniq (UNIQUE (conflict_day,
--     report_type)) guarantees such an INSERT can never add a row — it becomes the DO UPDATE (whose BEFORE
--     UPDATE triggers, incl. no-silent-edit, then run), a DO NOTHING, or a unique_violation. The same holds for
--     ON CONFLICT on the 3-column key (conflict_day, report_type, country_code): it is no arbiter for the
--     2-column index, so a duplicate still ends in unique_violation, never a new row.
--   * A report_type that does not exist in report_types passes this trigger and fails on
--     daily_briefings_report_type_fkey exactly as before (FKs are checked after BEFORE triggers).
--   * report_types, report_type_events, daily_briefings rows: no data is written by this migration.
--
-- Status values come from report_types_status_chk on production (read-only, 2026-10-12):
--   CHECK (status = ANY (ARRAY['candidate','active','paused','retired','rejected']))
--   live: overnight, general, general_weekly, horn, egypt_gulf_economy, eschatology = active;
--         egypt, uae, business = paused.
--
-- Security: SECURITY INVOKER + SET search_path TO '' (same as daily_briefings_no_silent_edit /
-- report_types_guard); not callable through the API (EXECUTE revoked from PUBLIC, anon, authenticated).
--
-- Idempotent (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS). ONE TRANSACTION. Apply with:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261012120000_reject_paused_report_types.sql
-- Depends on 20261007100300_report_registry.sql (report_types, daily_briefings_day_type_uniq) — applied.
-- Tested: supabase/tests/run_reject_paused_report_types_tests.sh (scratch cluster only).
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight --------------------------------------------------------------------------------------
DO $pre$
BEGIN
  IF to_regclass('public.report_types') IS NULL OR to_regclass('public.daily_briefings') IS NULL THEN
    RAISE EXCEPTION 'preflight: public.report_types / public.daily_briefings missing';
  END IF;
  -- The INSERT branch relies on UNIQUE (conflict_day, report_type); refuse to install without it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indrelid = 'public.daily_briefings'::regclass AND i.indisunique AND i.indisvalid AND i.indpred IS NULL
       AND i.indnatts = 2
       AND ARRAY(SELECT a.attname::text FROM unnest(i.indkey) WITH ORDINALITY k(attnum, ord)
                   JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum ORDER BY k.ord)
           = ARRAY['conflict_day', 'report_type']) THEN
    RAISE EXCEPTION 'preflight: daily_briefings has no valid UNIQUE (conflict_day, report_type) index (daily_briefings_day_type_uniq)';
  END IF;
END $pre$;

-- §1 guard function --------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daily_briefings_reject_inactive_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $f$
DECLARE
  v_status text;
BEGIN
  IF NEW.report_type IS NULL THEN
    RETURN NEW;                                   -- NOT NULL constraint reports it
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.report_type IS NOT DISTINCT FROM OLD.report_type
     AND NEW.conflict_day IS NOT DISTINCT FROM OLD.conflict_day THEN
    RETURN NEW;                                   -- same (conflict_day, report_type): not a new brief
  END IF;

  SELECT rt.status INTO v_status FROM public.report_types rt WHERE rt.code = NEW.report_type;
  IF NOT FOUND THEN
    RETURN NEW;                                   -- unknown type: daily_briefings_report_type_fkey raises as before
  END IF;
  IF v_status = 'active' THEN
    RETURN NEW;
  END IF;

  -- BEFORE INSERT fires before ON CONFLICT is resolved. If (conflict_day, report_type) already exists, this
  -- INSERT cannot create a row (UNIQUE daily_briefings_day_type_uniq): it is an ON CONFLICT DO UPDATE / DO
  -- NOTHING on an existing (historical) brief — e.g. a logged correction — or it fails with unique_violation.
  IF TG_OP = 'INSERT' AND EXISTS (
       SELECT 1 FROM public.daily_briefings b
        WHERE b.conflict_day = NEW.conflict_day AND b.report_type = NEW.report_type) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'daily_briefings: report type "%" is % — %',
    NEW.report_type, v_status,
    CASE WHEN TG_OP = 'INSERT' THEN format('no new briefs of this type (Day %s).', NEW.conflict_day)
         ELSE format('a brief cannot be re-pointed to it or moved to Day %s (brief %s, Day %s).', NEW.conflict_day, OLD.id, OLD.conflict_day) END
    USING ERRCODE = 'check_violation',
          DETAIL = CASE WHEN TG_OP = 'INSERT'
                        THEN 'A new brief may only be created for a report type whose report_types.status = ''active''.'
                        ELSE format('Re-pointing brief %s from "%s" to an inactive report type is not allowed.', OLD.id, OLD.report_type) END,
          HINT = 'Write it under an active type (SELECT code FROM public.report_types WHERE status = ''active''; '
              || 'egypt / uae / business were replaced by egypt_gulf_economy on 2026-10-12), or have the operator '
              || 'reactivate the type with public.report_type_transition(). Existing briefs of paused types stay '
              || 'readable and correctable (UPDATE / upsert of an existing (conflict_day, report_type) is allowed).';
END $f$;

COMMENT ON FUNCTION public.daily_briefings_reject_inactive_type() IS
  'BEFORE INSERT OR UPDATE OF report_type on daily_briefings (20261012120000). Refuses a NEW (conflict_day, report_type) '
  'brief, or re-pointing a brief, to a report type whose report_types.status <> ''active'' (candidate / paused / retired / '
  'rejected). An INSERT whose (conflict_day, report_type) already exists is let through (it can only resolve to ON CONFLICT '
  'DO UPDATE / DO NOTHING or a unique_violation), so corrections of historical paused-type briefs keep working. '
  'Unknown types fall through to the FK.';

-- §2 trigger ---------------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS daily_briefings_reject_inactive_type ON public.daily_briefings;
CREATE TRIGGER daily_briefings_reject_inactive_type
  BEFORE INSERT OR UPDATE OF report_type, conflict_day ON public.daily_briefings
  FOR EACH ROW EXECUTE FUNCTION public.daily_briefings_reject_inactive_type();

-- §3 grants: trigger functions are not callable through the API -------------------------------------
REVOKE ALL ON FUNCTION public.daily_briefings_reject_inactive_type() FROM PUBLIC, anon, authenticated;

-- §4 post-conditions -------------------------------------------------------------------------------
DO $post$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t
     WHERE t.tgrelid = 'public.daily_briefings'::regclass AND t.tgname = 'daily_briefings_reject_inactive_type'
       AND t.tgenabled = 'O' AND NOT t.tgisinternal
       AND t.tgfoid = 'public.daily_briefings_reject_inactive_type()'::regprocedure) THEN
    RAISE EXCEPTION 'post: trigger daily_briefings_reject_inactive_type missing or disabled';
  END IF;
  IF has_function_privilege('anon', 'public.daily_briefings_reject_inactive_type()', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.daily_briefings_reject_inactive_type()', 'EXECUTE') THEN
    RAISE EXCEPTION 'post: daily_briefings_reject_inactive_type() is executable by anon/authenticated';
  END IF;
END $post$;

COMMIT;
