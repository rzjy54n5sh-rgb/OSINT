-- Migration 008: Indexes + RLS on existing tables + helper.
-- Does NOT recreate: nai_scores, country_reports, scenario_probabilities,
-- disinformation_tracker, disputes, subscribers, contact_inquiries. Idempotent.

-- Indexes on existing tables
CREATE INDEX IF NOT EXISTS idx_nai_scores_conflict_day_desc ON public.nai_scores(conflict_day DESC);
CREATE INDEX IF NOT EXISTS idx_nai_scores_country_code ON public.nai_scores(country_code);
CREATE INDEX IF NOT EXISTS idx_nai_scores_country_conflict ON public.nai_scores(country_code, conflict_day DESC);
CREATE INDEX IF NOT EXISTS idx_nai_scores_updated_at ON public.nai_scores(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_country_reports_conflict_day_desc ON public.country_reports(conflict_day DESC);
CREATE INDEX IF NOT EXISTS idx_country_reports_country_code ON public.country_reports(country_code);
CREATE INDEX IF NOT EXISTS idx_country_reports_country_conflict ON public.country_reports(country_code, conflict_day DESC);
CREATE INDEX IF NOT EXISTS idx_country_reports_updated_at ON public.country_reports(updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_scenario_probabilities_conflict_day_desc ON public.scenario_probabilities(conflict_day DESC);
CREATE INDEX IF NOT EXISTS idx_scenario_probabilities_updated_at ON public.scenario_probabilities(updated_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'disinformation_tracker') THEN
    CREATE INDEX IF NOT EXISTS idx_disinformation_tracker_conflict_day ON public.disinformation_tracker(conflict_day DESC);
    CREATE INDEX IF NOT EXISTS idx_disinformation_tracker_status ON public.disinformation_tracker(status);
    CREATE INDEX IF NOT EXISTS idx_disinformation_tracker_created_at ON public.disinformation_tracker(created_at DESC);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_disputes_article_id ON public.disputes(article_id);
CREATE INDEX IF NOT EXISTS idx_disputes_submitted_at ON public.disputes(submitted_at DESC);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscribers') THEN
    CREATE INDEX IF NOT EXISTS idx_subscribers_email ON public.subscribers(email);
  END IF;
END $$;

-- Add updated_at to nai_scores and country_reports if missing (for trigger)
ALTER TABLE public.nai_scores ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.country_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

DROP TRIGGER IF EXISTS nai_scores_updated_at ON public.nai_scores;
CREATE TRIGGER nai_scores_updated_at
  BEFORE UPDATE ON public.nai_scores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS country_reports_updated_at ON public.country_reports;
CREATE TRIGGER country_reports_updated_at
  BEFORE UPDATE ON public.country_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Unique constraints (ignore if already exist)
DO $$ BEGIN
  ALTER TABLE public.nai_scores ADD CONSTRAINT nai_scores_country_conflict_day_key UNIQUE (country_code, conflict_day);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.country_reports ADD CONSTRAINT country_reports_country_conflict_day_key UNIQUE (country_code, conflict_day);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  ALTER TABLE public.scenario_probabilities ADD CONSTRAINT scenario_probabilities_conflict_day_key UNIQUE (conflict_day);
EXCEPTION WHEN duplicate_object OR unique_violation OR OTHERS THEN NULL;
END $$;

-- RLS on existing tables
ALTER TABLE public.nai_scores ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "nai_scores_public_select" ON public.nai_scores;
CREATE POLICY "nai_scores_public_select" ON public.nai_scores FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "nai_scores_service" ON public.nai_scores;
CREATE POLICY "nai_scores_service" ON public.nai_scores FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.country_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "country_reports_public_select" ON public.country_reports;
CREATE POLICY "country_reports_public_select" ON public.country_reports FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "country_reports_service" ON public.country_reports;
CREATE POLICY "country_reports_service" ON public.country_reports FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.scenario_probabilities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "scenario_probabilities_public_select" ON public.scenario_probabilities;
CREATE POLICY "scenario_probabilities_public_select" ON public.scenario_probabilities FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "scenario_probabilities_service" ON public.scenario_probabilities;
CREATE POLICY "scenario_probabilities_service" ON public.scenario_probabilities FOR ALL TO service_role USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'disinformation_tracker') THEN
    ALTER TABLE public.disinformation_tracker ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "disinformation_tracker_public_select" ON public.disinformation_tracker;
    CREATE POLICY "disinformation_tracker_public_select" ON public.disinformation_tracker FOR SELECT TO anon, authenticated USING (true);
    DROP POLICY IF EXISTS "disinformation_tracker_service" ON public.disinformation_tracker;
    CREATE POLICY "disinformation_tracker_service" ON public.disinformation_tracker FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Anyone can submit a dispute" ON public.disputes;
DROP POLICY IF EXISTS "Service role reads disputes" ON public.disputes;
DROP POLICY IF EXISTS "disputes_anon_insert" ON public.disputes;
DROP POLICY IF EXISTS "disputes_service" ON public.disputes;
CREATE POLICY "disputes_anon_insert" ON public.disputes FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "disputes_service" ON public.disputes FOR SELECT TO service_role USING (true);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'subscribers') THEN
    ALTER TABLE public.subscribers ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Anyone can subscribe" ON public.subscribers;
    DROP POLICY IF EXISTS "Service role reads subscribers" ON public.subscribers;
    DROP POLICY IF EXISTS "subscribers_anon_insert" ON public.subscribers;
    DROP POLICY IF EXISTS "subscribers_service" ON public.subscribers;
    CREATE POLICY "subscribers_anon_insert" ON public.subscribers FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "subscribers_service" ON public.subscribers FOR SELECT TO service_role USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'contact_inquiries') THEN
    ALTER TABLE public.contact_inquiries ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS "Anyone can submit an inquiry" ON public.contact_inquiries;
    DROP POLICY IF EXISTS "Service role reads inquiries" ON public.contact_inquiries;
    DROP POLICY IF EXISTS "contact_inquiries_anon_insert" ON public.contact_inquiries;
    DROP POLICY IF EXISTS "contact_inquiries_service" ON public.contact_inquiries;
    CREATE POLICY "contact_inquiries_anon_insert" ON public.contact_inquiries FOR INSERT TO anon WITH CHECK (true);
    CREATE POLICY "contact_inquiries_service" ON public.contact_inquiries FOR SELECT TO service_role USING (true);
  END IF;
END $$;

-- Helper: current conflict day from fixed start date
CREATE OR REPLACE FUNCTION public.get_current_conflict_day()
RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT (CURRENT_DATE - DATE '2026-02-28')::INTEGER + 1;
$$;

SELECT 'Migration 008 complete' AS status;
SELECT public.get_current_conflict_day() AS current_conflict_day;
