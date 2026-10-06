import { createClient, getConflictDay } from '@/utils/supabase/server';
import { getNaiV2Day, getNaiV2DayRange, type NaiV2View } from '@/lib/nai-v2';
import CountriesClient from './CountriesClient';

export default async function CountriesPage() {
  // currentDay = calendar (DAY LOCK); naiDay = nai_scores_v2's OWN latest day (War Posture).
  // Legacy nai_scores (Days 1-35, retired method) is never shown here as current NAI.
  const [supabase, currentDay] = await Promise.all([createClient(), getConflictDay()]);
  const { latestDay: naiDay } = await getNaiV2DayRange(supabase);

  // This page has historically shown expressed, latent and category to every tier; that
  // visibility is kept unchanged (paywall parity with /nai is a separate decision).
  const scores: NaiV2View[] = naiDay != null ? await getNaiV2Day(supabase, naiDay, { latent: true, gap: true }) : [];

  return <CountriesClient initialScores={scores} naiDay={naiDay} currentDay={currentDay} />;
}
