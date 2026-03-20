import { Suspense } from 'react';
import { createClient } from '@/utils/supabase/server';
import { getUser, getSessionToken, getConflictDay } from '@/utils/supabase/server';
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
  const latestDay = await getConflictDay();
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
        conflictDayBadge={<ConflictDayBadge />}
      />
    </Suspense>
  );
}
