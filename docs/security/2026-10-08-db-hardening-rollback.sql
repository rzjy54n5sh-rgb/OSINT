-- ROLLBACK for 20261008090000_security_hardening.sql — restores the 2026-10-07 live privilege state
-- exactly (ACL fingerprint verified equal on scratch). Run as postgres in one transaction.
-- NOT reverted (harmless, intentionally kept): CHECK constraints that were already present NOT VALID on live
-- and got VALIDATED (subscribers_len_chk, contact_inquiries_len_chk, disputes_len_chk); the pre-existing
-- subscribers_email_lower_key index.
-- Carries its own BEGIN/COMMIT so it cannot half-apply under autocommit:
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f docs/security/2026-10-08-db-hardening-rollback.sql
BEGIN;
SET LOCAL lock_timeout = '10s';

-- 1. RPCs / helpers
DROP FUNCTION IF EXISTS public.viewer_nai_v2(integer, text, integer, boolean, text);
DROP FUNCTION IF EXISTS public.viewer_country_report(text);
DROP FUNCTION IF EXISTS public.viewer_has_feature(text);
DROP FUNCTION IF EXISTS public.viewer_tier();

-- 2. Policies back to the live definitions
DROP POLICY IF EXISTS admin_users_select_own ON public.admin_users;
DROP POLICY IF EXISTS admin_users_select_own_or_super ON public.admin_users;
DROP POLICY IF EXISTS admin_users_write_super ON public.admin_users;
DROP POLICY IF EXISTS audit_select_own_or_super ON public.admin_audit_log;
CREATE POLICY admin_users_select_own_or_super ON public.admin_users AS PERMISSIVE FOR SELECT TO authenticated USING (((user_id = auth.uid()) OR (get_admin_role() = 'SUPER_ADMIN'::admin_role)));
CREATE POLICY admin_users_write_super ON public.admin_users AS PERMISSIVE FOR ALL TO authenticated USING ((get_admin_role() = 'SUPER_ADMIN'::admin_role)) WITH CHECK ((get_admin_role() = 'SUPER_ADMIN'::admin_role));
CREATE POLICY audit_select_own_or_super ON public.admin_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING (((admin_id = ( SELECT admin_users.id FROM admin_users WHERE (admin_users.user_id = auth.uid()) LIMIT 1)) OR (get_admin_role() = 'SUPER_ADMIN'::admin_role)));
DROP POLICY IF EXISTS "Anyone can subscribe" ON public.subscribers;
DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON public.contact_inquiries;
DROP POLICY IF EXISTS "Anyone can submit a dispute" ON public.disputes;
CREATE POLICY "Anyone can subscribe" ON public.subscribers AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can submit an inquiry" ON public.contact_inquiries AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "Anyone can submit a dispute" ON public.disputes AS PERMISSIVE FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS social_analysis_service_all ON public.social_analysis;
DROP POLICY IF EXISTS strategic_assessments_service_all ON public.strategic_assessments;

-- 3. Function EXECUTE back
GRANT EXECUTE ON FUNCTION public.get_admin_role(uuid), public.admin_has_permission(public.admin_role[]) TO authenticated;

-- 4. Constraints added by the migration
ALTER TABLE public.subscribers       DROP CONSTRAINT IF EXISTS subscribers_email_format_chk;
ALTER TABLE public.subscribers       DROP CONSTRAINT IF EXISTS subscribers_source_format_chk;
ALTER TABLE public.contact_inquiries DROP CONSTRAINT IF EXISTS contact_inquiries_content_chk;
ALTER TABLE public.disputes          DROP CONSTRAINT IF EXISTS disputes_content_chk;

-- 5. Table / column / sequence grants back to the live ACL (clear column grants first: a table-level
--    REVOKE also clears column privileges)
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,UPDATE ON public.admin_audit_log,public.admin_users,public.api_keys,public.article_sources,public.contact_inquiries,public.country_reports,public.disinfo_claims,public.disputes,public.eschatology_tracker,public.market_data,public.nai_scores,public.payments,public.pipeline_runs,public.platform_alerts,public.platform_config,public.social_analysis,public.social_trends,public.strategic_assessments,public.subscribers,public.subscriptions,public.tier_features,public.users TO anon;
GRANT MAINTAIN,REFERENCES,SELECT,TRIGGER ON public.nai_scores_v2 TO anon;
GRANT SELECT ON public.articles,public.daily_briefings,public.detected_scenarios,public.outlet_aliases,public.outlets,public.report_documents,public.report_types,public.scenario_daily,public.scenario_groups,public.scenario_lifecycle_events,public.scenario_markets,public.scenario_methods,public.scenario_overrides,public.scenario_probabilities,public.scenario_runs,public.scenarios,public.stories,public.story_articles,public.story_topics,public.topic_daily,public.topics,public.v_briefing_catalog,public.v_scenario_lifecycle,public.v_scenario_probabilities_compat,public.v_story_board TO anon;
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER ON public.users TO authenticated;
GRANT UPDATE (avatar_url, display_name, preferred_currency, timezone, updated_at) ON public.users TO authenticated;
GRANT DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,UPDATE ON public.admin_audit_log,public.admin_users,public.api_keys,public.article_sources,public.contact_inquiries,public.country_reports,public.disinfo_claims,public.disputes,public.eschatology_tracker,public.market_data,public.nai_scores,public.payments,public.pipeline_runs,public.platform_alerts,public.platform_config,public.social_analysis,public.social_trends,public.strategic_assessments,public.subscribers,public.subscriptions,public.tier_features TO authenticated;
GRANT MAINTAIN,REFERENCES,SELECT,TRIGGER ON public.nai_scores_v2 TO authenticated;
GRANT SELECT ON public.articles,public.daily_briefings,public.detected_scenarios,public.outlet_aliases,public.outlets,public.report_documents,public.report_types,public.scenario_daily,public.scenario_groups,public.scenario_lifecycle_events,public.scenario_markets,public.scenario_methods,public.scenario_overrides,public.scenario_probabilities,public.scenario_runs,public.scenarios,public.stories,public.story_articles,public.story_topics,public.topic_daily,public.topics,public.v_briefing_catalog,public.v_scenario_lifecycle,public.v_scenario_probabilities_compat,public.v_story_board TO authenticated;
GRANT SELECT,UPDATE,USAGE ON public.report_type_events_id_seq,public.scenario_lifecycle_events_id_seq TO anon, authenticated;

-- 6. Default privileges back to Supabase's
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES    TO anon, authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;

NOTIFY pgrst, 'reload schema';  -- delivered at COMMIT

COMMIT;
