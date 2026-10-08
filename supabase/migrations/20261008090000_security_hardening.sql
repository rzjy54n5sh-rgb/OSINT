-- =====================================================================================================
-- 20261008090000_security_hardening.sql — MENA Intel Desk, Supabase qmaszkkyukgiludcakjg (Postgres 17)
--
-- Database security hardening (security audit 2026-10-07 P1 #1, P2 #8/#9/#10/#14; verify_phase2 F5).
-- Principle: anon / authenticated keep ONLY the privileges the live app provably uses (code refs in
-- /tmp/claude-0/phase3_db/README.md §2). RLS stays on everywhere; grants are now the second gate.
--
--   §1  blanket: no INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for anon/authenticated
--       on any public table or view; no sequence privileges (setval on identity sequences)
--   §2  sensitive tables: no SELECT either, except the exact columns/rows the app reads
--   §3  paid columns (nai_scores_v2 latent/gap/category/sources, country_reports.content_json):
--       column-level SELECT + tier-checking SECURITY DEFINER RPCs viewer_nai_v2 / viewer_country_report
--   §4  report_documents: catalog columns only (storage_path / sha256 / bucket hidden)
--   §5  get_admin_role / admin_has_permission: no longer callable by authenticated (policies rewritten)
--   §6  anon-insert tables (subscribers, contact_inquiries, disputes): column-limited INSERT, CHECKs,
--       unique(lower(email))
--   §7  social_analysis / strategic_assessments: explicit service-only policy (advisor 0008)
--   §8  default privileges: future tables/sequences created by postgres in public are NOT auto-granted
--       to anon/authenticated (every migration must GRANT explicitly — recent migrations already do)
--
-- service_role and postgres are not touched by any statement below (verified by tests/).
-- The app code changes this requires are listed in README.md §3 and MUST ship together with (or
-- before) this migration — otherwise /nai, /countries, /, /warroom, /analytics lose War Posture data.
-- Idempotent: safe to re-run. Rollback: docs/security/2026-10-08-db-hardening-rollback.sql.
--
-- ONE TRANSACTION: the file carries its own BEGIN/COMMIT, so plain `psql -f` or an autocommit driver
-- cannot half-apply it (a failure after the §3 REVOKE but before the RPCs exist would blank War
-- Posture: the app gets 42501, not PGRST202, and does not fall back). Recommended:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/migrations/20261008090000_security_hardening.sql
-- (Under `psql --single-transaction` / a wrapping tool the inner BEGIN only raises a WARNING.)
-- =====================================================================================================

BEGIN;

SET LOCAL lock_timeout = '10s';

-- §0 preflight: refuse to run against a schema that does not look like the one this was written for.
DO $pre$
DECLARE missing text;
BEGIN
  SELECT string_agg(t, ', ') INTO missing
  FROM unnest(ARRAY['users','admin_users','admin_audit_log','api_keys','payments','subscriptions','subscribers',
                    'contact_inquiries','disputes','nai_scores_v2','country_reports','report_documents',
                    'tier_features','social_analysis','strategic_assessments']) AS t
  WHERE to_regclass('public.' || t) IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'security_hardening preflight: missing tables: %', missing;
  END IF;
  IF to_regprocedure('public.get_admin_role(uuid)') IS NULL
     OR to_regprocedure('public.admin_has_permission(public.admin_role[])') IS NULL THEN
    RAISE EXCEPTION 'security_hardening preflight: get_admin_role(uuid) / admin_has_permission(admin_role[]) not found';
  END IF;
END $pre$;

-- =====================================================================================================
-- §1 Blanket revoke of write / DDL-adjacent privileges from the API roles
-- =====================================================================================================
-- NOTE: a table-level REVOKE also removes the matching column-level grants (users' 5-column UPDATE is
-- re-granted in §2). ALL TABLES includes views.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
  ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
-- anon/authenticated held SELECT,UPDATE,USAGE on the identity sequences: UPDATE = setval(), which can
-- rewind report_type_events_id_seq / scenario_lifecycle_events_id_seq and break every later insert.
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated;

-- =====================================================================================================
-- §2 Sensitive / service-only tables: no direct SELECT for the API roles, then the exact re-grants
-- =====================================================================================================
REVOKE ALL ON
  public.admin_audit_log, public.admin_users, public.api_keys, public.payments, public.subscriptions,
  public.users, public.pipeline_runs, public.social_analysis, public.strategic_assessments,
  public.subscribers, public.contact_inquiries, public.disputes,
  public.user_events, public.user_notes, public.intel_alerts, public.report_type_events,
  public.v_report_documents_needed, public.v_story_counts_check
FROM PUBLIC, anon, authenticated;

-- users — own row only (RLS users_select_own / users_update_own).
--   SELECT: utils/supabase/server.ts:61 + utils/supabase/middleware.ts:53 select('*'); components/CommandHeader.tsx:85,
--           hooks/useViewerTier.ts:37 select('tier'); supabase/functions/_shared/middleware.ts:92 select('tier, is_suspended').
--   UPDATE: app/(platform)/account/AccountClient.tsx:43 (display_name, updated_at) — same 5 columns as before.
GRANT SELECT ON public.users TO authenticated;
GRANT UPDATE (avatar_url, display_name, preferred_currency, timezone, updated_at) ON public.users TO authenticated;

-- admin_users — a signed-in user may read only their OWN admin row, only these columns.
--   utils/supabase/server.ts:65 (role, is_active); components/CommandHeader.tsx:86 + hooks/useViewerTier.ts:38 (id);
--   supabase/functions/_shared/admin-middleware.ts:96 (id, user_id, email, display_name, role, is_active).
GRANT SELECT (id, user_id, email, display_name, role, is_active) ON public.admin_users TO authenticated;

-- api_keys — own keys, never key_hash / last_used_ip / revoke metadata.
--   app/(platform)/account/page.tsx:22. Key creation/revocation goes through the manage-api-keys Edge Function (service role).
GRANT SELECT (id, user_id, key_prefix, name, last_used_at, request_count, is_revoked, revoked_at, created_at)
  ON public.api_keys TO authenticated;

-- subscriptions — own row (RLS subs_select_own). app/(platform)/account/page.tsx:14 select('*').
GRANT SELECT ON public.subscriptions TO authenticated;

-- payments, admin_audit_log, pipeline_runs, social_analysis, strategic_assessments, user_events,
-- user_notes, intel_alerts, report_type_events: NO grant — only service_role (admin pages use
-- createAdminClient(); collectors/Edge Functions use the service key; the daily task is postgres).

-- =====================================================================================================
-- §3 Paid columns: column-level SELECT + tier-checking RPCs
-- =====================================================================================================
-- Column privileges are ignored while a table-level SELECT exists, so drop the table-level grant first.
REVOKE SELECT ON public.nai_scores_v2 FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, country_code, conflict_day, as_of, expressed_score, expressed_basis, confidence, method_version, created_at)
  ON public.nai_scores_v2 TO anon, authenticated;
-- NOT granted: latent_low, latent_high, latent_basis, gap, gap_size, category (nai_latent_score /
-- nai_gap_analysis = informed tier) and sources (its feeds='L' entries carry the latent evidence claims;
-- lib/nai-v2.ts:204 hides them from tiers without nai_latent_score).

REVOKE SELECT ON public.country_reports FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, country_code, country_name, nai_score, nai_category, conflict_day, updated_at)
  ON public.country_reports TO anon, authenticated;
-- NOT granted: content_json (the paid narrative: country_report_egy / _uae / _other).

-- Viewer tier, exactly as utils/supabase/server.ts getUser() + lib/tier.ts tierHasFeature() compute it:
-- no session -> free; active admin_users row -> professional; else users.tier (missing profile -> free).
-- A request made with the service_role key is treated as professional. Any JWT whose role claim is not
-- 'authenticated' is free. viewer_has_feature fails closed: an unknown / NULL tier gets nothing.
-- Internal helpers: SECURITY INVOKER, not executable by the API roles (only the definer RPCs call them).
CREATE OR REPLACE FUNCTION public.viewer_tier()
RETURNS public.user_tier
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT CASE
    WHEN auth.role() = 'service_role' THEN 'professional'::public.user_tier
    -- only an 'authenticated' JWT may carry a paid tier: a signed token with a sub but no / another
    -- role claim runs as anon in PostgREST and must get the anonymous (free) view.
    WHEN auth.role() IS DISTINCT FROM 'authenticated' THEN 'free'::public.user_tier
    WHEN auth.uid() IS NULL THEN 'free'::public.user_tier
    WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = auth.uid()) THEN 'free'::public.user_tier
    WHEN EXISTS (SELECT 1 FROM public.admin_users a WHERE a.user_id = auth.uid() AND a.is_active) THEN 'professional'::public.user_tier
    ELSE (SELECT u.tier FROM public.users u WHERE u.id = auth.uid())
  END
$fn$;

CREATE OR REPLACE FUNCTION public.viewer_has_feature(p_feature text)
RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $fn$
  SELECT COALESCE((
    SELECT CASE public.viewer_tier()
             WHEN 'free'::public.user_tier     THEN f.free_access
             WHEN 'informed'::public.user_tier THEN f.informed_access
             WHEN 'professional'::public.user_tier THEN f.pro_access
             ELSE false  -- unknown / NULL tier: fail closed
           END
      FROM public.tier_features f
     WHERE f.feature_key = p_feature), false)
$fn$;

REVOKE ALL ON FUNCTION public.viewer_tier(), public.viewer_has_feature(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.viewer_tier(), public.viewer_has_feature(text) TO service_role;

-- War Posture rows at the caller's tier. Same redaction rules as lib/nai-v2.ts toNaiV2View():
--   latent_low/high/basis + L-feeding sources need nai_latent_score; gap/gap_size need nai_gap_analysis;
--   category is shown with nai_gap_analysis OR when it is UNSCORABLE (a data-quality statement).
-- Filters: p_day (one day), p_country (one country), ordered by conflict_day DESC (p_ascending=false)
-- then country_code; p_limit capped at 5000.
CREATE OR REPLACE FUNCTION public.viewer_nai_v2(
  p_day        integer DEFAULT NULL,
  p_country    text    DEFAULT NULL,
  p_limit      integer DEFAULT 1000,
  p_ascending  boolean DEFAULT false,
  p_method     text    DEFAULT 'war-posture-v1')
RETURNS TABLE (
  id uuid, country_code text, conflict_day integer, as_of date,
  expressed_score integer, expressed_basis text,
  latent_low integer, latent_high integer, latent_basis text,
  confidence text, sources jsonb,
  gap numeric, gap_size numeric, category text,
  method_version text, created_at timestamptz,
  latent_access boolean, gap_access boolean, hidden_latent_source_count integer)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  WITH acc AS (
    SELECT public.viewer_has_feature('nai_latent_score') AS l,
           public.viewer_has_feature('nai_gap_analysis') AS g
  )
  SELECT n.id, n.country_code, n.conflict_day, n.as_of,
         n.expressed_score, n.expressed_basis,
         CASE WHEN acc.l THEN n.latent_low END,
         CASE WHEN acc.l THEN n.latent_high END,
         CASE WHEN acc.l THEN n.latent_basis END,
         n.confidence,
         CASE WHEN acc.l THEN n.sources
              ELSE COALESCE((SELECT jsonb_agg(x.el ORDER BY x.ord)
                               FROM jsonb_array_elements(n.sources) WITH ORDINALITY AS x(el, ord)
                              WHERE (x.el ->> 'feeds') IS DISTINCT FROM 'L'), '[]'::jsonb)
         END,
         CASE WHEN acc.g THEN n.gap END,
         CASE WHEN acc.g THEN n.gap_size END,
         CASE WHEN acc.g OR n.category = 'UNSCORABLE' THEN n.category END,
         n.method_version, n.created_at,
         acc.l, acc.g,
         CASE WHEN acc.l THEN 0
              ELSE (SELECT count(*)::integer FROM jsonb_array_elements(n.sources) AS y(el) WHERE (y.el ->> 'feeds') = 'L')
         END
    FROM public.nai_scores_v2 n
   CROSS JOIN acc
   WHERE n.method_version = p_method
     AND (p_day IS NULL OR n.conflict_day = p_day)
     AND (p_country IS NULL OR n.country_code = upper(btrim(p_country)))
   ORDER BY CASE WHEN p_ascending THEN n.conflict_day END ASC,
            CASE WHEN NOT p_ascending THEN n.conflict_day END DESC,
            n.country_code
   LIMIT LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 5000)
$fn$;

-- Latest country report per country (or one country) with content_json only when the caller's tier
-- has the country's feature — same mapping as app/api/viewer/country/[code]/route.ts:36-41.
CREATE OR REPLACE FUNCTION public.viewer_country_report(p_code text DEFAULT NULL)
RETURNS TABLE (
  country_code text, country_name text, conflict_day integer, updated_at timestamptz,
  has_access boolean, content_json jsonb)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $fn$
  SELECT DISTINCT ON (r.country_code)
         r.country_code, r.country_name, r.conflict_day, r.updated_at,
         a.ok,
         CASE WHEN a.ok THEN r.content_json END
    FROM public.country_reports r
   CROSS JOIN LATERAL (
     SELECT public.viewer_has_feature(
              CASE WHEN r.country_code = 'EG' THEN 'country_report_egy'
                   WHEN r.country_code IN ('AE', 'ARE', 'UAE') THEN 'country_report_uae'
                   ELSE 'country_report_other' END) AS ok
   ) a
   WHERE p_code IS NULL OR r.country_code = upper(btrim(p_code))
   ORDER BY r.country_code, r.conflict_day DESC NULLS LAST
$fn$;

REVOKE ALL ON FUNCTION public.viewer_nai_v2(integer, text, integer, boolean, text),
                       public.viewer_country_report(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.viewer_nai_v2(integer, text, integer, boolean, text),
                          public.viewer_country_report(text) TO anon, authenticated, service_role;
COMMENT ON FUNCTION public.viewer_nai_v2(integer, text, integer, boolean, text) IS
  'Tier-gated read of nai_scores_v2 for the calling JWT (anon = free). Paid columns are NULL and L-sources removed unless tier_features allows. SECURITY DEFINER by design: anon/authenticated have no column privilege on the paid columns.';
COMMENT ON FUNCTION public.viewer_country_report(text) IS
  'Tier-gated read of country_reports for the calling JWT (anon = free): content_json only when the country''s country_report_* feature is unlocked. SECURITY DEFINER by design.';

-- =====================================================================================================
-- §4 report_documents: catalog fields only (no storage_bucket / storage_path / sha256 / generator /
--    validation / mime_type). The kept columns are exactly what v_briefing_catalog (security_invoker,
--    granted to anon) reads. No app page reads report_documents directly (grep, README §2).
-- =====================================================================================================
REVOKE SELECT ON public.report_documents FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, briefing_id, lang, format, version, bytes, source_updated_at, is_current)
  ON public.report_documents TO anon, authenticated;

-- =====================================================================================================
-- §5 get_admin_role(uuid) / admin_has_permission(admin_role[]) — not callable by signed-in users.
--    The only callers were three RLS policies; RLS evaluates functions with the CALLER's privileges, so
--    they are rewritten first. Admin pages/actions use createAdminClient() (service role) and the
--    admin-* Edge Functions authenticate with an own-row admin_users read — neither needs these.
-- =====================================================================================================
DROP POLICY IF EXISTS admin_users_select_own_or_super ON public.admin_users;
DROP POLICY IF EXISTS admin_users_write_super        ON public.admin_users;
DROP POLICY IF EXISTS admin_users_select_own         ON public.admin_users;
CREATE POLICY admin_users_select_own ON public.admin_users
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
DROP POLICY IF EXISTS audit_select_own_or_super ON public.admin_audit_log;  -- authenticated has no grant any more (§2)

REVOKE EXECUTE ON FUNCTION public.get_admin_role(uuid)                    FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_has_permission(public.admin_role[]) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_admin_role(uuid), public.admin_has_permission(public.admin_role[]) TO service_role;

-- =====================================================================================================
-- §6 Anon-insert tables: column-limited INSERT, shape CHECKs, unique(lower(email))
-- =====================================================================================================
-- Inserts are made with the browser client: anon when signed out, authenticated when signed in. The live
-- INSERT policies were TO anon only, so a signed-in visitor's contact form / dispute / subscribe failed
-- with 42501. Policies now cover both roles; column grants stop callers setting id/active/timestamps.
GRANT INSERT (email, source)                                        ON public.subscribers       TO anon, authenticated; -- components/EmailCapture.tsx:21
GRANT INSERT (name, email, organization, inquiry_type, message)     ON public.contact_inquiries TO anon, authenticated; -- app/contact/page.tsx:32
GRANT INSERT (article_id, article_url, claim_text, source_url)      ON public.disputes          TO anon, authenticated; -- components/ReactionBar.tsx:39

DROP POLICY IF EXISTS "Anyone can subscribe"         ON public.subscribers;
DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON public.contact_inquiries;
DROP POLICY IF EXISTS "Anyone can submit a dispute"  ON public.disputes;
CREATE POLICY "Anyone can subscribe"         ON public.subscribers       AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can submit an inquiry" ON public.contact_inquiries AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);
CREATE POLICY "Anyone can submit a dispute"  ON public.disputes          AS PERMISSIVE FOR INSERT TO anon, authenticated WITH CHECK (true);

-- Case-insensitive uniqueness (live already has subscribers_email_lower_key; created only if missing).
CREATE UNIQUE INDEX IF NOT EXISTS subscribers_email_lower_key ON public.subscribers (lower(email));

-- CHECKs: added NOT VALID (no table scan under lock), then VALIDATEd only when no existing row violates
-- them; otherwise left NOT VALID (still enforced for new rows) and the violation count is reported.
DO $chk$
DECLARE
  c record;
  n bigint;
BEGIN
  FOR c IN
    SELECT * FROM (VALUES
      ('subscribers', 'subscribers_len_chk',
       '(COALESCE(length(email), 0) <= 320) AND (COALESCE(length(source), 0) <= 100)'),
      ('subscribers', 'subscribers_email_format_chk',
       $$email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'$$),
      ('subscribers', 'subscribers_source_format_chk',
       $$source IS NULL OR source ~ '^[a-z0-9_-]{1,50}$'$$),
      ('contact_inquiries', 'contact_inquiries_len_chk',
       '(COALESCE(length(name), 0) <= 200) AND (COALESCE(length(email), 0) <= 320) AND (COALESCE(length(organization), 0) <= 200) AND (COALESCE(length(inquiry_type), 0) <= 50) AND (COALESCE(length(message), 0) <= 5000)'),
      ('contact_inquiries', 'contact_inquiries_content_chk',
       $$length(btrim(name)) > 0 AND length(btrim(message)) > 0 AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' AND inquiry_type IN ('subscription', 'media', 'research', 'technical', 'other')$$),
      ('disputes', 'disputes_len_chk',
       '(COALESCE(length(article_id), 0) <= 100) AND (COALESCE(length(article_url), 0) <= 2048) AND (COALESCE(length(claim_text), 0) <= 5000) AND (COALESCE(length(source_url), 0) <= 2048)'),
      ('disputes', 'disputes_content_chk',
       $$length(btrim(article_id)) > 0 AND length(btrim(claim_text)) > 0 AND source_url ~* '^https?://[^[:space:]]+$' AND (article_url IS NULL OR article_url ~* '^https?://[^[:space:]]+$')$$)
    ) AS v(tbl, con, expr)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_constraint
                    WHERE conrelid = format('public.%I', c.tbl)::regclass AND conname = c.con) THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', c.tbl, c.con, c.expr);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint
                WHERE conrelid = format('public.%I', c.tbl)::regclass AND conname = c.con AND NOT convalidated) THEN
      EXECUTE format('SELECT count(*) FROM public.%I WHERE NOT coalesce((%s), false)', c.tbl, c.expr) INTO n;
      IF n = 0 THEN
        EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', c.tbl, c.con);
      ELSE
        RAISE NOTICE 'security_hardening: %.% left NOT VALID — % existing row(s) violate it', c.tbl, c.con, n;
      END IF;
    END IF;
  END LOOP;
END $chk$;

-- =====================================================================================================
-- §7 social_analysis / strategic_assessments: RLS on with no policy (deny-all) — make the intent explicit
--    (resolves advisor 0008 rls_enabled_no_policy). Grants were removed in §2.
-- =====================================================================================================
DROP POLICY IF EXISTS social_analysis_service_all       ON public.social_analysis;
DROP POLICY IF EXISTS strategic_assessments_service_all ON public.strategic_assessments;
CREATE POLICY social_analysis_service_all       ON public.social_analysis       AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY strategic_assessments_service_all ON public.strategic_assessments AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true);

-- =====================================================================================================
-- §8 Default privileges: objects postgres creates in public later are not auto-granted to the API roles.
--    (Supabase's supabase_admin defaults are outside postgres' control and unchanged.)
-- =====================================================================================================
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES    FROM anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon, authenticated;

-- =====================================================================================================
-- §9 Post-condition asserts (abort the whole migration if any fails)
-- =====================================================================================================
DO $post$
DECLARE bad text;
BEGIN
  -- no TABLE-level write / maintain privilege left for the API roles on any public relation
  -- (has_table_privilege ignores column grants: the 3 column-level INSERTs and users' UPDATE columns are intended)
  SELECT string_agg(DISTINCT c.relname || ':' || r.rolname || ':' || p.priv, ', ') INTO bad
    FROM pg_class c JOIN pg_namespace ns ON ns.oid = c.relnamespace
    CROSS JOIN (VALUES ('anon'), ('authenticated')) r(rolname)
    CROSS JOIN (VALUES ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) p(priv)
   WHERE ns.nspname = 'public' AND c.relkind IN ('r', 'v', 'm', 'p')
     AND has_table_privilege(r.rolname, c.oid, p.priv);
  IF bad IS NOT NULL THEN RAISE EXCEPTION 'security_hardening post-check: table privileges remain: %', bad; END IF;

  IF has_column_privilege('anon', 'public.nai_scores_v2', 'latent_low', 'SELECT')
     OR has_column_privilege('authenticated', 'public.nai_scores_v2', 'category', 'SELECT')
     OR has_column_privilege('anon', 'public.nai_scores_v2', 'sources', 'SELECT')
     OR has_column_privilege('anon', 'public.country_reports', 'content_json', 'SELECT')
     OR has_column_privilege('authenticated', 'public.country_reports', 'content_json', 'SELECT')
     OR has_column_privilege('anon', 'public.report_documents', 'storage_path', 'SELECT')
     OR has_column_privilege('authenticated', 'public.api_keys', 'key_hash', 'SELECT')
     OR has_table_privilege('anon', 'public.users', 'SELECT')
     OR has_table_privilege('authenticated', 'public.payments', 'SELECT')
     OR has_function_privilege('authenticated', 'public.get_admin_role(uuid)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.admin_has_permission(public.admin_role[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.viewer_has_feature(text)', 'EXECUTE')
     OR NOT has_function_privilege('anon', 'public.viewer_nai_v2(integer,text,integer,boolean,text)', 'EXECUTE')
     OR NOT has_table_privilege('service_role', 'public.nai_scores_v2', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.payments', 'INSERT')
  THEN
    RAISE EXCEPTION 'security_hardening post-check: privilege matrix not as intended';
  END IF;
END $post$;

-- PostgREST: pick up the new RPCs immediately (Supabase also reloads on DDL via its event trigger).
-- NOTIFY is delivered when the transaction commits.
NOTIFY pgrst, 'reload schema';

COMMIT;
