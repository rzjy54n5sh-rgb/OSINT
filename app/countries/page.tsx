import { createClient, getConflictDay, getLatestDayFor } from '@/utils/supabase/server';
import type { NaiScore } from '@/types/supabase';
import CountriesClient from './CountriesClient';

export default async function CountriesPage() {
  // currentDay = calendar (DAY LOCK); naiDay = nai_scores' OWN latest day.
  // Querying nai_scores at the calendar day returns nothing while NAI is frozen, so the
  // grid shows the latest NAI day and labels it against the calendar day.
  const [supabase, currentDay, naiDay] = await Promise.all([
    createClient(),
    getConflictDay(),
    getLatestDayFor('nai_scores'),
  ]);

  let scores: NaiScore[] = [];
  if (naiDay != null) {
    const { data } = await supabase
      .from('nai_scores')
      .select('*')
      .eq('conflict_day', naiDay)
      .order('expressed_score', { ascending: false });
    scores = (data as NaiScore[]) ?? [];
  }

  return <CountriesClient initialScores={scores} naiDay={naiDay} currentDay={currentDay} />;
}
