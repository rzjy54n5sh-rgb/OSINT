-- Add to nai_scores
ALTER TABLE public.nai_scores
  ADD COLUMN IF NOT EXISTS pipeline_version TEXT DEFAULT 'legacy',
  ADD COLUMN IF NOT EXISTS model_used TEXT DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS article_count INTEGER DEFAULT 0;

-- Add to country_reports (content_json already has these fields but add fast-filter columns)
-- content_json already stores pipeline_version and generated_at

-- Create pipeline integrity view for admin panel
CREATE OR REPLACE VIEW public.pipeline_integrity AS
SELECT
  conflict_day,
  COUNT(*) AS countries,
  COUNT(*) FILTER (WHERE pipeline_version = '4.0') AS v4_rows,
  COUNT(*) FILTER (WHERE pipeline_version = 'legacy') AS legacy_rows,
  MIN(updated_at) AS first_updated,
  MAX(updated_at) AS last_updated
FROM public.nai_scores
GROUP BY conflict_day
ORDER BY conflict_day DESC;

-- Unique constraint on nai_scores (if not already present)
ALTER TABLE public.nai_scores
  DROP CONSTRAINT IF EXISTS nai_scores_country_day_unique;
ALTER TABLE public.nai_scores
  ADD CONSTRAINT nai_scores_country_day_unique
  UNIQUE (country_code, conflict_day);
