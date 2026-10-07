import type { Metadata } from 'next';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { getNaiV2Day, getNaiV2DayRange, type NaiV2View } from '@/lib/nai-v2';
import CountriesClient from './CountriesClient';

/** ISR: War Posture rows change at most daily; same view for every tier (see note below). */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Countries — War Posture by Country — MENA Intel Desk',
  description:
    'War Posture for the 25 tracked countries, including the Horn of Africa & Red Sea theatre, with cited sources and daily country reports.',
};

export default async function CountriesPage() {
  // currentDay = calendar (DAY LOCK); naiDay = nai_scores_v2's OWN latest day (War Posture).
  // Legacy nai_scores (Days 1-35, retired method) is never shown here as current NAI.
  const supabase = createPublicClient();
  const currentDay = await getConflictDay();
  const { latestDay: naiDay } = await getNaiV2DayRange(supabase);

  // This page has historically shown expressed, latent and category to every tier; that
  // visibility is kept unchanged (paywall parity with /nai is a separate decision).
  const scores: NaiV2View[] = naiDay != null ? await getNaiV2Day(supabase, naiDay, { latent: true, gap: true }) : [];

  return <CountriesClient initialScores={scores} naiDay={naiDay} currentDay={currentDay} />;
}
