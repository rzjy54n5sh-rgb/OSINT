import type { Metadata } from 'next';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { getNaiV2Day, getNaiV2DayRange, type NaiV2View } from '@/lib/nai-v2';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import CountriesClient from './CountriesClient';

/**
 * ISR: War Posture rows change at most daily. The shared, edge-cached HTML is built at ANONYMOUS
 * access (ruling 2026-10-07: latent band / gap / category are informed-tier on the list too);
 * CountriesClient loads a subscriber's rows from /api/viewer/nai after hydration.
 */
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
  const [{ latestDay: naiDay }, { data: tierRows }] = await Promise.all([
    getNaiV2DayRange(supabase),
    supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access'),
  ]);
  const flags = buildTierFlags(tierRows ?? []);
  const anonAccess = {
    latent: tierHasFeature(null, 'nai_latent_score', flags),
    gap: tierHasFeature(null, 'nai_gap_analysis', flags),
  };

  const scores: NaiV2View[] = naiDay != null ? await getNaiV2Day(supabase, naiDay, anonAccess) : [];

  return (
    <CountriesClient
      initialScores={scores}
      naiDay={naiDay}
      currentDay={currentDay}
      tierFlags={flags}
      anonAccess={anonAccess}
    />
  );
}
