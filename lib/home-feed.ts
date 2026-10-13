/**
 * Home "Latest intelligence" scope filter (UX audit 2026-10-13, problem #3).
 *
 * Only the HOME tile is filtered. /feed, /warroom and every other view keep showing every collected
 * item, so nothing is hidden silently elsewhere.
 *
 * Rule, in order:
 *   1. `articles.content_json.scope.in_scope`, when it is a real boolean, decides: false = left off the
 *      home tile, true = shown (even for a source on the list below). No collector writes this flag yet
 *      (grep of .github/workflows/scripts, 2026-10-13); it is the hook for an editorial scope tag.
 *   2. With no scope flag, only the sources listed in HOME_FEED_EXCLUDED_SOURCES are left off.
 *      Everything else is shown, including state and party media (they are labelled, not hidden).
 */

/**
 * Telegram channels collected by collect_feeds.py (sources_registry.py: TELEGRAM_CHANNELS and the
 * Intel Slava RSS mirror in CONFLICT_MONITORS) whose registry region is Russia or Global and whose
 * posts mostly cover other wars. Matched on `articles.source_name`, case- and whitespace-insensitive.
 * Add a source here only with a reason; remove it once its items carry a scope flag.
 */
export const HOME_FEED_EXCLUDED_SOURCES: readonly { name: string; reason: string }[] = [
  {
    name: 'Intel Slava',
    reason: 'Telegram aggregator (registry source_type aggregator, region Russia); reposts every war, mostly Russia–Ukraine.',
  },
  {
    name: 'Intel Slava (OSINT)',
    reason: 'RSS mirror of the same Intel Slava Telegram channel (CONFLICT_MONITORS, region Global).',
  },
  {
    name: 'Our Wars Today',
    reason: 'Telegram aggregator (registry source_type aggregator, region Global); reposts conflicts worldwide.',
  },
  {
    name: 'Rybar (Russian)',
    reason: 'Russian-language Telegram milblog (registry region Russia); posts are mostly about the Russia–Ukraine war.',
  },
  {
    name: 'Rybar (English)',
    reason: 'English mirror of the Rybar Telegram milblog (registry region Russia); same coverage as the Russian channel.',
  },
];

const EXCLUDED = new Set(HOME_FEED_EXCLUDED_SOURCES.map((s) => normaliseSource(s.name)));

function normaliseSource(name: string | null | undefined): string {
  return (name ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

type ScopedArticle = { source_name: string | null; content_json: Record<string, unknown> | null };

/** content_json.scope.in_scope when it is a boolean; null when absent or malformed. */
export function articleScopeFlag(a: ScopedArticle): boolean | null {
  const scope = a.content_json?.scope;
  if (scope == null || typeof scope !== 'object') return null;
  const flag = (scope as Record<string, unknown>).in_scope;
  return typeof flag === 'boolean' ? flag : null;
}

/** true = the item may appear on the home "Latest intelligence" tile. */
export function isHomeFeedEligible(a: ScopedArticle): boolean {
  const flag = articleScopeFlag(a);
  if (flag !== null) return flag;
  return !EXCLUDED.has(normaliseSource(a.source_name));
}

/** Eligible items in their original order, at most `limit`. */
export function filterHomeFeed<T extends ScopedArticle>(articles: readonly T[], limit: number): T[] {
  const out: T[] = [];
  for (const a of articles) {
    if (out.length >= limit) break;
    if (isHomeFeedEligible(a)) out.push(a);
  }
  return out;
}

/** Rows the home page reads before filtering: enough that a burst of listed Telegram posts cannot empty the tile. */
export const HOME_FEED_FETCH_ROWS = 60;
