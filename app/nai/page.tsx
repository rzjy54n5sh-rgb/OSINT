import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';
import { getUser, getSessionToken, getConflictDay, getLatestDayFor } from '@/utils/supabase/server';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { getNaiScores } from '@/lib/api/nai';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { NaiMapClient } from '@/components/nai/NaiMapClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import type { NaiScore } from '@/types';

export default async function NaiMapPage({
  searchParams,
}: {
  searchParams: Promise<{ day?: string }>;
}) {
  const params = await searchParams;
  const dayParam = params.day ? parseInt(params.day, 10) : null;
  // currentDay = calendar (DAY LOCK). latestNaiDay = nai_scores' OWN max day — the newest
  // day that actually has NAI rows. Defaulting to the calendar day would render an empty
  // map while nai_scores is frozen; defaulting to the NAI day is labelled via DataAsOf.
  const [currentDay, latestNaiDay] = await Promise.all([getConflictDay(), getLatestDayFor('nai_scores')]);
  const latestDay = latestNaiDay ?? currentDay;
  const conflictDay = Number.isFinite(dayParam) && dayParam != null ? dayParam : latestDay;

  const [user, token, supabase] = await Promise.all([
    getUser(),
    getSessionToken(),
    createClient(),
  ]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasLatentAccess = tierHasFeature(user?.tier, 'nai_latent_score', flags);
  const hasGapAccess = tierHasFeature(user?.tier, 'nai_gap_analysis', flags);

  let scores: NaiScore[] = [];
  try {
    const res = await getNaiScores(conflictDay, token ?? undefined);
    scores = (res?.data ?? []) as NaiScore[];
  } catch {
    scores = [];
  }

  return (
    <Suspense
      fallback={
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      }
    >
      <NaiMapClient
        scores={scores}
        conflictDay={conflictDay}
        latestDay={latestDay}
        hasLatentAccess={hasLatentAccess}
        hasGapAccess={hasGapAccess}
        conflictDayBadge={
          <>
            <ConflictDayBadge />
            <DataAsOf section="NAI" latestDay={latestNaiDay} currentDay={currentDay} className="mt-2" />
            {conflictDay !== latestDay && (
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
