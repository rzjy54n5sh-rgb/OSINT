import { createClient } from '@/utils/supabase/server';
import type { MarketData } from '@/types/supabase';
import MarketsClient from './MarketsClient';

export default async function MarketsPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from('market_data')
    .select('*')
    .order('conflict_day', { ascending: true });

  const marketData = (data as MarketData[]) ?? [];

  return <MarketsClient initialData={marketData} />;
}
