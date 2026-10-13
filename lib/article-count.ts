/**
 * The "articles in the database" figure (header, home status line, War Room status bar).
 *
 * It used to be `select('*', { count: 'exact', head: true })` on every page view: a full COUNT(*)
 * over ~135k rows for a vanity number (UX audit 2026-10-13). It is now `count: 'estimated'`:
 * PostgREST returns the exact count while it is under its max-rows setting (1,000 on Supabase)
 * and the planner's estimate above that, so from 1,000 rows on the figure is shown as approximate.
 */

/** PostgREST max-rows on Supabase: below this `count=estimated` is still exact. */
export const ARTICLE_COUNT_EXACT_BELOW = 1000;

export function formatArticleCount(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n) || n < 0) return '—';
  const v = Math.round(n);
  if (v < ARTICLE_COUNT_EXACT_BELOW) return String(v);
  // A planner estimate is not precise to the unit: round to the nearest thousand.
  return `≈${(Math.round(v / 1000) * 1000).toLocaleString('en-US')}`;
}
