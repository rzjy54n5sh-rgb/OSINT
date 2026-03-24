import { createClient, getConflictDay } from '@/utils/supabase/server';
import type { NaiScore } from '@/types/supabase';
import CountriesClient from './CountriesClient';

export default async function CountriesPage() {
  const [supabase, conflictDay] = await Promise.all([
    createClient(),
    getConflictDay(),
  ]);

  const { data } = await supabase
    .from('nai_scores')
    .select('*')
    .eq('conflict_day', conflictDay)
    .order('expressed_score', { ascending: false });

  const scores = (data as NaiScore[]) ?? [];

  return <CountriesClient initialScores={scores} conflictDay={conflictDay} />;
}
