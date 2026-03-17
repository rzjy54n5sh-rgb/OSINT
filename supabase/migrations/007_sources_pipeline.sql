-- Migration 007: RSS source registry + pipeline run audit log.
-- Depends on 001, 004 (update_updated_at, admin_users). Idempotent.

DO $$ BEGIN
  CREATE TYPE public.source_language AS ENUM ('en','ar','fa','he','fr','de','ru','tr');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.source_category AS ENUM ('general','iran','gulf','egypt','uae','israel','lebanon','iraq','yemen','global','market','social');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.source_health AS ENUM ('active','failing','timeout','blocked','disabled');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.pipeline_stage AS ENUM ('fetch','analysis','db_write','reports','scenario_detection','full');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE public.pipeline_run_status AS ENUM ('running','completed','failed','partial','skipped');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.article_sources (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name                     TEXT NOT NULL UNIQUE,
  display_name             TEXT NOT NULL,
  url                      TEXT NOT NULL,
  rss_url                  TEXT,
  language                 public.source_language NOT NULL DEFAULT 'en',
  category                 public.source_category NOT NULL DEFAULT 'general',
  is_party_source          BOOLEAN NOT NULL DEFAULT FALSE,
  party_affiliation        TEXT,
  neutrality_note          TEXT,
  is_active                BOOLEAN NOT NULL DEFAULT TRUE,
  health_status            public.source_health NOT NULL DEFAULT 'active',
  last_fetch_at            TIMESTAMPTZ,
  last_success_at          TIMESTAMPTZ,
  last_error               TEXT,
  consecutive_failures     INTEGER NOT NULL DEFAULT 0,
  total_articles_fetched   BIGINT NOT NULL DEFAULT 0,
  fetch_interval_minutes   INTEGER NOT NULL DEFAULT 60,
  requires_user_agent      BOOLEAN NOT NULL DEFAULT FALSE,
  custom_user_agent        TEXT,
  use_google_news_proxy    BOOLEAN NOT NULL DEFAULT FALSE,
  added_by                 UUID REFERENCES public.admin_users(id),
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS article_sources_updated_at ON public.article_sources;
CREATE TRIGGER article_sources_updated_at
  BEFORE UPDATE ON public.article_sources
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

INSERT INTO public.article_sources (name, display_name, url, language, category, is_party_source, party_affiliation, use_google_news_proxy) VALUES
  ('reuters', 'Reuters', 'https://www.reuters.com', 'en', 'general', FALSE, NULL, FALSE),
  ('ap', 'Associated Press', 'https://apnews.com', 'en', 'general', FALSE, NULL, FALSE),
  ('afp', 'AFP', 'https://www.afp.com', 'en', 'general', FALSE, NULL, FALSE),
  ('cnn', 'CNN', 'https://edition.cnn.com', 'en', 'general', FALSE, NULL, FALSE),
  ('aljazeera_en', 'Al Jazeera English', 'https://www.aljazeera.com', 'en', 'gulf', FALSE, NULL, FALSE),
  ('aljazeera_ar', 'Al Jazeera Arabic', 'https://www.aljazeera.net', 'ar', 'gulf', FALSE, NULL, FALSE),
  ('presstv', 'PressTV', 'https://www.presstv.ir', 'en', 'iran', TRUE, 'Iran State Media', FALSE),
  ('irna', 'IRNA', 'https://en.irna.ir', 'fa', 'iran', TRUE, 'Iran State Media', FALSE),
  ('fars', 'Fars News Agency', 'https://www.farsnews.ir', 'fa', 'iran', TRUE, 'IRGC-affiliated', FALSE),
  ('centcom', 'CENTCOM', 'https://www.centcom.mil', 'en', 'general', TRUE, 'US Military', FALSE),
  ('idf', 'IDF Spokesperson', 'https://www.idf.il', 'en', 'israel', TRUE, 'Israeli Military', FALSE),
  ('almonitor', 'Al-Monitor', 'https://www.al-monitor.com', 'en', 'general', FALSE, NULL, FALSE),
  ('mee', 'Middle East Eye', 'https://www.middleeasteye.net', 'en', 'general', FALSE, NULL, FALSE),
  ('haaretz', 'Haaretz', 'https://www.haaretz.com', 'en', 'israel', FALSE, NULL, FALSE),
  ('thenationalnews', 'The National', 'https://www.thenationalnews.com', 'en', 'uae', FALSE, NULL, FALSE),
  ('egyptindependent', 'Egypt Independent', 'https://www.egyptindependent.com', 'en', 'egypt', FALSE, NULL, FALSE),
  ('ahramonline', 'Ahram Online', 'https://english.ahram.org.eg', 'en', 'egypt', FALSE, NULL, FALSE),
  ('orientsxxi', 'Orient XXI', 'https://orientxxi.info', 'fr', 'general', FALSE, NULL, FALSE),
  ('bbc_middleeast', 'BBC Middle East', 'https://www.bbc.com/news/world/middle_east', 'en', 'general', FALSE, NULL, FALSE),
  ('guardian', 'The Guardian', 'https://www.theguardian.com', 'en', 'general', FALSE, NULL, FALSE),
  ('wsj', 'Wall Street Journal', 'https://www.wsj.com', 'en', 'market', FALSE, NULL, TRUE),
  ('ft', 'Financial Times', 'https://www.ft.com', 'en', 'market', FALSE, NULL, TRUE),
  ('netblocks', 'NetBlocks', 'https://netblocks.org', 'en', 'iran', FALSE, NULL, FALSE),
  ('hrw', 'Human Rights Watch', 'https://www.hrw.org', 'en', 'general', FALSE, NULL, FALSE),
  ('kpler', 'Kpler', 'https://www.kpler.com', 'en', 'market', FALSE, NULL, FALSE),
  ('vortexa', 'Vortexa', 'https://www.vortexa.com', 'en', 'market', FALSE, NULL, FALSE)
ON CONFLICT (name) DO NOTHING;

UPDATE public.article_sources SET use_google_news_proxy = TRUE WHERE name IN ('wsj', 'ft');
UPDATE public.article_sources SET neutrality_note = 'Treat claims as party position; require independent corroboration for CONFIRMED status.' WHERE is_party_source = TRUE;

CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_date             DATE NOT NULL,
  conflict_day         INTEGER NOT NULL,
  stage                public.pipeline_stage NOT NULL DEFAULT 'full',
  status               public.pipeline_run_status NOT NULL DEFAULT 'running',
  triggered_by         TEXT NOT NULL DEFAULT 'cron',
  triggered_by_user     UUID REFERENCES public.admin_users(id),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  duration_seconds     INTEGER,
  stages_completed     JSONB DEFAULT '[]',
  countries_processed  INTEGER DEFAULT 0,
  articles_ingested    INTEGER DEFAULT 0,
  articles_deduplicated INTEGER DEFAULT 0,
  sources_checked      INTEGER DEFAULT 0,
  sources_failing      INTEGER DEFAULT 0,
  error_message        TEXT,
  error_stage          public.pipeline_stage,
  error_details        JSONB,
  claude_calls         INTEGER DEFAULT 0,
  perplexity_calls     INTEGER DEFAULT 0,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.pipeline_calc_duration()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL AND (OLD.completed_at IS NULL OR OLD.completed_at IS NULL) THEN
    NEW.duration_seconds := EXTRACT(EPOCH FROM (NEW.completed_at - NEW.started_at))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipeline_runs_calc_duration ON public.pipeline_runs;
CREATE TRIGGER pipeline_runs_calc_duration
  BEFORE UPDATE ON public.pipeline_runs
  FOR EACH ROW EXECUTE FUNCTION public.pipeline_calc_duration();

CREATE INDEX IF NOT EXISTS idx_article_sources_language ON public.article_sources(language);
CREATE INDEX IF NOT EXISTS idx_article_sources_category ON public.article_sources(category);
CREATE INDEX IF NOT EXISTS idx_article_sources_health ON public.article_sources(health_status);
CREATE INDEX IF NOT EXISTS idx_article_sources_is_active ON public.article_sources(is_active);
CREATE INDEX IF NOT EXISTS idx_article_sources_party ON public.article_sources(is_party_source) WHERE is_party_source = TRUE;
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_run_date ON public.pipeline_runs(run_date DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON public.pipeline_runs(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_conflict_day ON public.pipeline_runs(conflict_day);

ALTER TABLE public.article_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "article_sources_public_read" ON public.article_sources;
CREATE POLICY "article_sources_public_read" ON public.article_sources FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "article_sources_service" ON public.article_sources;
CREATE POLICY "article_sources_service" ON public.article_sources FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pipeline_runs_service" ON public.pipeline_runs;
CREATE POLICY "pipeline_runs_service" ON public.pipeline_runs FOR ALL TO service_role USING (true) WITH CHECK (true);

SELECT 'Migration 007 complete' AS status;
SELECT COUNT(*) AS sources FROM public.article_sources;
