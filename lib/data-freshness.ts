/**
 * Real per-table data freshness — the single source for the header "DATA STALE" badge,
 * the "LAST UPDATE" clock and any "pipeline active" signal.
 *
 * Nothing here reads the visitor's clock as a data timestamp, and nothing reads the archived
 * `nai_scores` table. Each signal comes from the table that actually feeds the page:
 *   - daily_briefings.conflict_day  (+ generated_at for the "last update" time)
 *   - articles.published_at
 *   - scenario_probabilities.conflict_day
 */
import { createClient } from '@/lib/supabase/client';
import { currentConflictDay } from '@/lib/conflict-calendar';

/** Briefs / scenarios are stale when they lag the calendar conflict day by more than this many days. */
export const BRIEF_STALE_DAYS = 1;
/**
 * Articles are stale when the newest published_at is older than this many hours.
 * 12h, not 6h: the scheduled GitHub Actions "hourly" feeds cron only fires every ~4-7h in practice,
 * so a 6h threshold flags normal gaps as stale.
 */
export const ARTICLE_STALE_HOURS = 12;

export interface DataFreshness {
  /** false until the first successful read. */
  loaded: boolean;
  latestBriefingDay: number | null;
  latestBriefingGeneratedAt: string | null;
  latestArticleAt: string | null;
  latestScenarioDay: number | null;
  /** ISO timestamp of the newest article (articles.published_at) — the real "last update". */
  lastUpdateAt: string | null;
  briefingsStale: boolean;
  articlesStale: boolean;
  scenariosStale: boolean;
  /** Human-readable reasons, e.g. "Articles: newest item 9h old". Empty when fresh. */
  staleReasons: string[];
  stale: boolean;
  /** Article ingestion looks alive (newest article within ARTICLE_STALE_HOURS). */
  pipelineActive: boolean;
}

export const EMPTY_FRESHNESS: DataFreshness = {
  loaded: false,
  latestBriefingDay: null,
  latestBriefingGeneratedAt: null,
  latestArticleAt: null,
  latestScenarioDay: null,
  lastUpdateAt: null,
  briefingsStale: false,
  articlesStale: false,
  scenariosStale: false,
  staleReasons: [],
  stale: false,
  pipelineActive: false,
};

/** Pure: derive stale flags from raw maxima. Exported for tests. */
export function computeFreshness(
  raw: {
    latestBriefingDay: number | null;
    latestBriefingGeneratedAt: string | null;
    latestArticleAt: string | null;
    latestScenarioDay: number | null;
  },
  now: Date = new Date()
): DataFreshness {
  const today = currentConflictDay(now);
  const reasons: string[] = [];

  const briefingsStale = raw.latestBriefingDay == null || today - raw.latestBriefingDay > BRIEF_STALE_DAYS;
  if (briefingsStale) {
    reasons.push(
      raw.latestBriefingDay == null
        ? 'Briefings: none found'
        : `Briefings: latest is Day ${raw.latestBriefingDay} (today is Day ${today})`
    );
  }

  const scenariosStale = raw.latestScenarioDay == null || today - raw.latestScenarioDay > BRIEF_STALE_DAYS;
  if (scenariosStale) {
    reasons.push(
      raw.latestScenarioDay == null
        ? 'Scenarios: none found'
        : `Scenarios: latest is Day ${raw.latestScenarioDay} (today is Day ${today})`
    );
  }

  const articleMs = raw.latestArticleAt ? new Date(raw.latestArticleAt).getTime() : NaN;
  const articleAgeH = Number.isFinite(articleMs) ? (now.getTime() - articleMs) / 36e5 : Infinity;
  const articlesStale = articleAgeH > ARTICLE_STALE_HOURS;
  if (articlesStale) {
    reasons.push(
      Number.isFinite(articleAgeH)
        ? `Articles: newest item is ${Math.floor(articleAgeH)}h old`
        : 'Articles: none found'
    );
  }

  // LAST UPDATE = newest article only (briefs still feed the stale reasons above).
  const lastMs = raw.latestArticleAt ? new Date(raw.latestArticleAt).getTime() : NaN;
  const lastUpdateAt =
    Number.isFinite(lastMs) && lastMs <= now.getTime() + 5 * 60 * 1000 ? new Date(lastMs).toISOString() : null;

  return {
    loaded: true,
    ...raw,
    lastUpdateAt,
    briefingsStale,
    articlesStale,
    scenariosStale,
    staleReasons: reasons,
    stale: briefingsStale || articlesStale || scenariosStale,
    pipelineActive: !articlesStale,
  };
}

/** "14:20 UTC", or "06 Oct 14:20 UTC" when the stamp is not from today (UTC). */
export function formatUtcStamp(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return '--:-- UTC';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '--:-- UTC';
  const hm = d.toISOString().slice(11, 16);
  if (d.toISOString().slice(0, 10) === now.toISOString().slice(0, 10)) return `${hm} UTC`;
  const day = d.toISOString().slice(8, 10);
  const mon = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
  return `${day} ${mon} ${hm} UTC`;
}

const CACHE_MS = 60_000;
let cache: { at: number; promise: Promise<DataFreshness> } | null = null;

/** Fetches (and caches for 60 s, shared by every hook instance) the real per-table maxima. */
export function fetchDataFreshness(): Promise<DataFreshness> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.promise;
  const promise = (async (): Promise<DataFreshness> => {
    const supabase = createClient();
    const [briefRes, articleRes, scenarioRes] = await Promise.all([
      supabase
        .from('daily_briefings')
        .select('conflict_day, generated_at')
        .order('conflict_day', { ascending: false })
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('articles')
        .select('published_at')
        .not('published_at', 'is', null)
        .lte('published_at', new Date(Date.now() + 5 * 60 * 1000).toISOString())
        .order('published_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('scenario_probabilities')
        .select('conflict_day')
        .order('conflict_day', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    // If every read failed (no env, offline) do not fabricate a freshness verdict.
    if (briefRes.error && articleRes.error && scenarioRes.error) return EMPTY_FRESHNESS;
    return computeFreshness({
      latestBriefingDay: (briefRes.data?.conflict_day as number | undefined) ?? null,
      latestBriefingGeneratedAt: (briefRes.data?.generated_at as string | undefined) ?? null,
      latestArticleAt: (articleRes.data?.published_at as string | undefined) ?? null,
      latestScenarioDay: (scenarioRes.data?.conflict_day as number | undefined) ?? null,
    });
  })().catch(() => EMPTY_FRESHNESS);
  cache = { at: Date.now(), promise };
  return promise;
}
