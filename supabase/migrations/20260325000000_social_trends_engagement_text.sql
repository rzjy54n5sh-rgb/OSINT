-- social_trends.engagement_estimate must be TEXT — collect_social.py writes "LOW (21/100)" etc.
-- Fixes: invalid input syntax for type bigint: "LOW (21/100)"

CREATE TABLE IF NOT EXISTS public.social_trends (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  region              TEXT,
  country             TEXT,
  platform            TEXT,
  trend               TEXT,
  sentiment           TEXT,
  engagement_estimate TEXT,
  conflict_day        INTEGER,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- If table existed with wrong column type, fix it
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'social_trends' AND column_name = 'engagement_estimate'
  ) THEN
    BEGIN
      ALTER TABLE public.social_trends
        ALTER COLUMN engagement_estimate TYPE TEXT
        USING engagement_estimate::text;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- Column may already be TEXT
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_social_trends_conflict_day ON public.social_trends(conflict_day DESC);
CREATE INDEX IF NOT EXISTS idx_social_trends_country ON public.social_trends(country) WHERE country IS NOT NULL;

ALTER TABLE public.social_trends ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "social_trends_public_select" ON public.social_trends;
CREATE POLICY "social_trends_public_select" ON public.social_trends FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "social_trends_service" ON public.social_trends;
CREATE POLICY "social_trends_service" ON public.social_trends FOR ALL TO service_role USING (true) WITH CHECK (true);
