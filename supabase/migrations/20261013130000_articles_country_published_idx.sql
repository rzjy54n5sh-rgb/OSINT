-- War Room per-country feed (perf/batch-1) orders articles by published_at within one country.
-- Only articles_published_at_idx (published_at DESC) existed, so the anon read (3 s statement timeout)
-- did a sequential scan of the whole table (verifier EXPLAIN 2026-10-13: Seq Scan, 121,339 rows removed,
-- 35–900 ms, occasional 500 timeouts on "Load more"). Additive index; no data change.
BEGIN;
SET LOCAL lock_timeout = '10s';
CREATE INDEX IF NOT EXISTS articles_country_published_at_idx
  ON public.articles (country, published_at DESC);
COMMIT;
