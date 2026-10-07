import type { Metadata } from 'next';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import MarketsClient from './MarketsClient';
import { buildIndicatorViews, type HistoryRow } from './market-views';

export const metadata: Metadata = {
  title: 'Markets & Shipping Indicators — MENA Intel Desk',
  description:
    'Latest conflict-sensitive market and shipping indicators with units, collection times and sources; trend charts never join different units.',
};

/** ISR (see app/page.tsx): market collector runs every 30 min; no per-visitor content. */
export const revalidate = 600;

const PAGE = 1000; // PostgREST max-rows on this project
const PAGES = 4; // up to 4,000 rows in parallel (~2,600 today)
const HISTORY_COLS = 'id, indicator, value, change_pct, unit, conflict_day, created_at, is_retrospective';

export default async function MarketsPage() {
  const supabase = createPublicClient();
  const currentDay = await getConflictDay();

  // Round trip 1 (all in parallel):
  //  - history pages, NEWEST FIRST by created_at (id tie-break), WITHOUT the long `source` text;
  //    the first row per indicator is its latest collection, the same value the home tiles show;
  //  - the (indicator, day) keys of reconstructed daily-close backfill rows.
  const [recon, ...pages] = await Promise.all([
    supabase.from('market_data').select('indicator, conflict_day').ilike('source', '%daily close%').limit(PAGE * PAGES),
    ...Array.from({ length: PAGES }, (_, p) =>
      supabase
        .from('market_data')
        .select(HISTORY_COLS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: true })
        .range(p * PAGE, p * PAGE + PAGE - 1),
    ),
  ]);
  const rows: HistoryRow[] = [];
  for (const pg of pages) {
    if (pg.error || !pg.data) break;
    rows.push(...(pg.data as HistoryRow[]));
    if (pg.data.length < PAGE) break;
  }
  if (rows.length >= PAGE * PAGES) {
    console.warn(`[markets] history truncated at ${rows.length} rows; oldest days are not charted`);
  }
  const reconKeys = new Set(
    ((recon.data ?? []) as { indicator: string | null; conflict_day: number | null }[]).map((r) => `${r.indicator}|${r.conflict_day}`),
  );

  // Round trip 2: `source` for the latest row of each indicator only (~25 rows).
  const latestIds: string[] = [];
  const seenIndicator = new Set<string>();
  for (const r of rows) {
    const k = r.indicator ?? 'OTHER';
    if (!seenIndicator.has(k)) {
      seenIndicator.add(k);
      latestIds.push(r.id);
    }
  }
  const sourceById = new Map<string, string | null>();
  if (latestIds.length > 0) {
    const { data } = await supabase.from('market_data').select('id, source').in('id', latestIds);
    for (const r of (data ?? []) as { id: string; source: string | null }[]) sourceById.set(r.id, r.source);
  }

  // Only the compact per-indicator views reach the client.
  const views = buildIndicatorViews(rows, reconKeys, sourceById);
  const marketDay = rows.reduce<number | null>((m, r) => (r.conflict_day != null && (m === null || r.conflict_day > m) ? r.conflict_day : m), null);

  return <MarketsClient views={views} marketDay={marketDay} currentDay={currentDay} />;
}
