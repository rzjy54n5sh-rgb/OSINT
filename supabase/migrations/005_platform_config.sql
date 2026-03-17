-- Migration 005: Runtime config + tier feature flags.
-- Depends on 001, 004 (update_updated_at, admin_users). Idempotent.

CREATE TABLE IF NOT EXISTS public.platform_config (
  key           TEXT PRIMARY KEY,
  value         JSONB NOT NULL,
  description   TEXT,
  is_sensitive  BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by    UUID REFERENCES public.admin_users(id)
);

DROP TRIGGER IF EXISTS platform_config_updated_at ON public.platform_config;
CREATE TRIGGER platform_config_updated_at
  BEFORE UPDATE ON public.platform_config
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.platform_config (key, value, description, is_sensitive) VALUES
  ('pipeline_cron', '"0 6 * * *"', 'Cron expression for daily pipeline', FALSE),
  ('conflict_start_date', '"2026-02-28"', 'Conflict start date for day calculation', FALSE),
  ('stripe_mode', '"test"', 'Stripe mode: test or live', FALSE),
  ('price_informed_usd', '9.00', 'Informed tier USD', FALSE),
  ('price_informed_aed', '35.00', 'Informed tier AED', FALSE),
  ('price_informed_egp', '450.00', 'Informed tier EGP', FALSE),
  ('price_pro_usd', '29.00', 'Pro tier USD', FALSE),
  ('price_pro_aed', '109.00', 'Pro tier AED', FALSE),
  ('price_pro_egp', '1450.00', 'Pro tier EGP', FALSE),
  ('price_report_usd', '4.99', 'One-time report USD', FALSE),
  ('price_report_aed', '19.00', 'One-time report AED', FALSE),
  ('price_report_egp', '249.00', 'One-time report EGP', FALSE),
  ('trial_days', '7', 'Trial days for subscription', FALSE),
  ('max_api_keys_per_user', '5', 'Max API keys per pro user', FALSE),
  ('dispute_rate_limit_per_day', '3', 'Disputes per user per day', FALSE),
  ('api_rate_limit_t2_per_hour', '500', 'API rate limit per hour for pro', FALSE),
  ('stripe_price_id_informed_usd', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_informed_aed', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_informed_egp', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_pro_usd', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_pro_aed', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_pro_egp', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_report_usd', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_report_aed', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_price_id_report_egp', '"price_PLACEHOLDER"', 'Stripe price ID', TRUE),
  ('stripe_webhook_secret', '"whsec_PLACEHOLDER"', 'Stripe webhook secret', TRUE)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.tier_features (
  feature_key     TEXT PRIMARY KEY,
  description     TEXT,
  free_access     BOOLEAN NOT NULL DEFAULT FALSE,
  informed_access BOOLEAN NOT NULL DEFAULT FALSE,
  pro_access      BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by      UUID REFERENCES public.admin_users(id)
);

DROP TRIGGER IF EXISTS tier_features_updated_at ON public.tier_features;
CREATE TRIGGER tier_features_updated_at
  BEFORE UPDATE ON public.tier_features
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.tier_features (feature_key, description, free_access, informed_access, pro_access) VALUES
  ('nai_expressed_score', 'NAI expressed score', TRUE, TRUE, TRUE),
  ('nai_latent_score', 'NAI latent score', FALSE, TRUE, TRUE),
  ('nai_gap_analysis', 'NAI gap analysis', FALSE, TRUE, TRUE),
  ('scenario_summary', 'Scenario summary', TRUE, TRUE, TRUE),
  ('scenario_detail', 'Scenario detail', FALSE, TRUE, TRUE),
  ('disinformation_partial', 'Disinformation partial', TRUE, TRUE, TRUE),
  ('disinformation_full', 'Disinformation full', FALSE, TRUE, TRUE),
  ('country_report_egy', 'Country report Egypt', FALSE, TRUE, TRUE),
  ('country_report_uae', 'Country report UAE', FALSE, TRUE, TRUE),
  ('country_report_other', 'Country report other', FALSE, FALSE, TRUE),
  ('general_intelligence_brief', 'General intelligence brief', FALSE, FALSE, TRUE),
  ('eschatology_report', 'Eschatology report', FALSE, FALSE, TRUE),
  ('business_report', 'Business report', FALSE, FALSE, TRUE),
  ('arabic_reports', 'Arabic reports', FALSE, FALSE, TRUE),
  ('docx_downloads', 'DOCX downloads', FALSE, FALSE, TRUE),
  ('api_access', 'API access', FALSE, FALSE, TRUE),
  ('polling_data', 'Polling data', FALSE, TRUE, TRUE),
  ('strategic_forecast', 'Strategic forecast', FALSE, TRUE, TRUE)
ON CONFLICT (feature_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.user_has_feature(p_user_id UUID, p_feature TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  u_tier public.user_tier;
  f record;
BEGIN
  SELECT tier INTO u_tier FROM public.users WHERE id = p_user_id;
  IF u_tier IS NULL THEN RETURN FALSE; END IF;
  SELECT free_access, informed_access, pro_access INTO f
  FROM public.tier_features WHERE feature_key = p_feature;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN (u_tier = 'free' AND f.free_access)
      OR (u_tier = 'informed' AND f.informed_access)
      OR (u_tier = 'professional' AND f.pro_access);
END;
$$;

ALTER TABLE public.platform_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "platform_config_public_read" ON public.platform_config;
CREATE POLICY "platform_config_public_read" ON public.platform_config FOR SELECT TO anon, authenticated
  USING (NOT is_sensitive);
DROP POLICY IF EXISTS "platform_config_service" ON public.platform_config;
CREATE POLICY "platform_config_service" ON public.platform_config FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.tier_features ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tier_features_public_read" ON public.tier_features;
CREATE POLICY "tier_features_public_read" ON public.tier_features FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "tier_features_service" ON public.tier_features;
CREATE POLICY "tier_features_service" ON public.tier_features FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT 'Migration 005 complete' AS status;
SELECT COUNT(*) AS config_keys FROM public.platform_config;
SELECT COUNT(*) AS feature_flags FROM public.tier_features;
