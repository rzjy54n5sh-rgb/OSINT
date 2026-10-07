-- Timeline lazy-load (components/timeline/TimelineDayBlock.tsx) reads, per conflict day,
--   select title, source_name, url from articles
--   where conflict_day = $1 [and sentiment = ...] order by published_at desc limit 5
-- Without a matching index this scans the day's rows and can hit statement_timeout (57014).
-- Not applied by the PR; apply via the Supabase SQL editor / migration runner.
CREATE INDEX IF NOT EXISTS articles_conflict_day_published_at_idx
  ON public.articles (conflict_day, published_at DESC);
