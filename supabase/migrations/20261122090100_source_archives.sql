-- source_archives: append-only record of Wayback Machine snapshots of every URL the desk cites.
--
-- Why: the Claude daily build runs in a cloud sandbox whose egress cannot reach web.archive.org/save
-- (measured 2026-11-22: HTTP 000 from the sandbox, 302 -> snapshot from a residential IP), so every new
-- citation since early November has archive_url NULL. The GitHub Actions job archive-sources.yml runs after
-- the daily build, asks the Wayback Machine to save each URL cited that day, and records here exactly what
-- Wayback returned. A snapshot_url is only ever the Location the Wayback Machine itself returned (never
-- built by hand), in line with "dont accept any invented claim".
--
-- Append-only: no UPDATE / DELETE for anyone but the table owner; a retry is a new row.

CREATE TABLE IF NOT EXISTS public.source_archives (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url           text NOT NULL,
  snapshot_url  text,
  status        text NOT NULL,
  http_status   integer,
  detail        text,
  cited_in      text NOT NULL,            -- e.g. 'daily_briefings:268:general' or 'posture_evidence:<id>'
  conflict_day  integer NOT NULL,
  requested_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT source_archives_status_chk   CHECK (status IN ('saved', 'failed', 'skipped')),
  CONSTRAINT source_archives_url_chk      CHECK (url ~ '^https?://'),
  CONSTRAINT source_archives_snapshot_chk CHECK (
       (status = 'saved'  AND snapshot_url IS NOT NULL AND snapshot_url ~ '^https://web\.archive\.org/web/[0-9]{14}/')
    OR (status <> 'saved' AND snapshot_url IS NULL)),
  CONSTRAINT source_archives_day_chk      CHECK (conflict_day >= 1)
);

CREATE INDEX IF NOT EXISTS source_archives_url_idx ON public.source_archives (url, requested_at DESC);
CREATE INDEX IF NOT EXISTS source_archives_day_idx ON public.source_archives (conflict_day);

COMMENT ON TABLE public.source_archives IS
  'Append-only Wayback Machine snapshots of cited URLs, written by .github/workflows/archive-sources.yml. snapshot_url is the Location header Wayback returned, never constructed.';

ALTER TABLE public.source_archives ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.source_archives FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.source_archives TO anon, authenticated;
GRANT SELECT, INSERT ON public.source_archives TO service_role;
REVOKE UPDATE, DELETE, TRUNCATE ON public.source_archives FROM service_role;

DROP POLICY IF EXISTS source_archives_public_read ON public.source_archives;
CREATE POLICY source_archives_public_read ON public.source_archives
  FOR SELECT TO anon, authenticated USING (status = 'saved');
