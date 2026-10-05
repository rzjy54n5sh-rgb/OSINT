import { createClient, getConflictDay } from '@/utils/supabase/server';
import type { MarketData } from '@/types/supabase';
import MarketsClient from './MarketsClient';

export default async function MarketsPage() {
  const [supabase, currentDay] = await Promise.all([createClient(), getConflictDay()]);

  // Newest-first, then reversed for the charts. The previous ascending query with no limit
  // is capped by PostgREST max-rows (Supabase default 1000), which silently keeps the OLDEST
  // rows and drops the newest — "VALUE" would then show old data as the current value.
  const { data } = await supabase
    .from('market_data')
    .select('*')
    .order('conflict_day', { ascending: false })
    .limit(1000);

  const marketData = ((data as MarketData[]) ?? []).slice().reverse();

  return <MarketsClient initialData={marketData} currentDay={currentDay} />;
}
