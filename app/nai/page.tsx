import { pageMetadata } from '@/lib/site';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { NaiViewer } from '@/components/nai/NaiViewer';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { getPostureBoard } from '@/lib/posture';

export const metadata: Metadata = pageMetadata({
  title: 'War Posture Map — MENA Intel Desk',
  description:
    "Each tracked government's stated position on continuing each war, per conflict, on one party-neutral scale (0 = immediate ceasefire, 100 = continue or escalate), with the verbatim statement, its date and an archived copy.",
  path: '/nai',
});

/**
 * ISR: posture rows change at most daily. This HTML is shared by the edge cache, so it is rendered for
 * an ANONYMOUS visitor (locked fields withheld server-side). NaiViewer loads the signed-in visitor's
 * tier view and any `?day=N` from /api/viewer/posture after hydration.
 *
 * Board: War Posture v2 (per conflict, viewer_posture_v2) when that migration is applied and has rows;
 * otherwise the v1 table (one blended number per country), labelled as such. Legacy nai_scores
 * (Days 1-35, retired method) is never used here.
 */
export const revalidate = 900;

export default async function NaiMapPage() {
  const supabase = createPublicClient();
  const currentDay = await getConflictDay();
  const { data: tierRows } = await supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  // Anonymous-visitor access only: this page is cached and served to everyone.
  const access = { latent: tierHasFeature(null, 'nai_latent_score', flags), gap: tierHasFeature(null, 'nai_gap_analysis', flags) };
  const board = await getPostureBoard(supabase, { access });
  const dataDay = board.schema === 'v1' ? board.latestDay : currentDay;

  return (
    <Suspense
      fallback={
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      }
    >
      <NaiViewer
        initial={board}
        tierFlags={flags}
        conflictDayBadge={
          <>
            <ConflictDayBadge />
            <DataAsOf section="WAR POSTURE" latestDay={dataDay} currentDay={currentDay} className="mt-2" />
          </>
        }
      />
    </Suspense>
  );
}
