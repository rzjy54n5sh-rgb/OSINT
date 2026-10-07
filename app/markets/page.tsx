import { createClient, getConflictDay } from '@/utils/supabase/server';
import type { MarketData } from '@/types/supabase';
import MarketsClient from './MarketsClient';

const PAGE = 1000; // PostgREST max-rows on this project
const MAX_PAGES = 6; // ~6,000 rows: the whole table today (~3,000) with headroom

export default async function MarketsPage() {
  const [supabase, currentDay] = await Promise.all([createClient(), getConflictDay()]);

  // Newest FIRST by created_at (id as a stable tie-break), paginated past the 1000-row cap so the
  // charts keep their full history. Ordering by created_at — not conflict_day — means the first row
  // seen per indicator is the latest collection, the same value the home tiles show (never an
  // older same-day row).
  const rows: MarketData[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from('market_data')
      .select('id, indicator, value, change_pct, unit, source, conflict_day, created_at, is_retrospective')
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error || !data) break;
    rows.push(...(data as MarketData[]));
    if (data.length < PAGE) break;
  }

  return <MarketsClient initialData={rows} currentDay={currentDay} />;
}
