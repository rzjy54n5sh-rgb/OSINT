import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createClient } from '@/utils/supabase/server';
import { getUser, getConflictDay } from '@/utils/supabase/server';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { NaiMapClient } from '@/components/nai/NaiMapClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { getNaiV2Day, getNaiV2DayRange, type NaiV2View } from '@/lib/nai-v2';

export const metadata: Metadata = {
  title: 'War Posture Map (NAI) — MENA Intel Desk',
  description:
    "Each tracked state's official war posture and its society's posture on one party-neutral scale (0 = immediate ceasefire, 100 = continue or escalate), with sources.",
};

export default async function NaiMapPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const dayParam = params.day ? parseInt(params.day, 10) : null;

  const [user, supabase, currentDay] = await Promise.all([getUser(), createClient(), getConflictDay()]);

  // currentDay = calendar (DAY LOCK). latestDay = nai_scores_v2's OWN max day for the
  // war-posture-v1 method. Legacy nai_scores (Days 1-35, retired method) is NEVER used here
  // as a fallback: if v2 has no rows the page shows the honest empty state.
  const { firstDay, latestDay } = await getNaiV2DayRange(supabase);
  const conflictDay =
    dayParam != null && Number.isFinite(dayParam) && dayParam > 0 ? dayParam : (latestDay ?? currentDay);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasLatentAccess = tierHasFeature(user?.tier, 'nai_latent_score', flags);
  const hasGapAccess = tierHasFeature(user?.tier, 'nai_gap_analysis', flags);

  // Tier gating is applied here, server-side, so locked fields never reach the client payload.
  const rows: NaiV2View[] =
    latestDay != null ? await getNaiV2Day(supabase, conflictDay, { latent: hasLatentAccess, gap: hasGapAccess }) : [];

  return (
    <Suspense
      fallback={
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      }
    >
      <NaiMapClient
        rows={rows}
        conflictDay={conflictDay}
        latestDay={latestDay}
        firstDay={firstDay}
        hasLatentAccess={hasLatentAccess}
        hasGapAccess={hasGapAccess}
        conflictDayBadge={
          <>
            <ConflictDayBadge />
            <DataAsOf section="NAI WAR POSTURE" latestDay={latestDay} currentDay={currentDay} className="mt-2" />
            {latestDay != null && conflictDay !== latestDay && (
              <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }} translate="no">
                VIEWING HISTORICAL NAI — DAY {conflictDay}
              </p>
            )}
          </>
        }
      />
    </Suspense>
  );
}
