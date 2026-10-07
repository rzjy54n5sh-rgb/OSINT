import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { NaiViewer } from '@/components/nai/NaiViewer';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { getNaiV2Day, getNaiV2DayRange, type NaiV2View } from '@/lib/nai-v2';

export const metadata: Metadata = {
  title: 'War Posture Map (NAI) — MENA Intel Desk',
  description:
    "Each tracked state's official war posture and its society's posture on one party-neutral scale (0 = immediate ceasefire, 100 = continue or escalate), with sources.",
};

/**
 * ISR: War Posture rows are written at most once a day. This HTML is shared by the edge cache,
 * so it is rendered for an ANONYMOUS visitor at the latest day: locked fields (latent band, gap,
 * category per tier_features) are withheld here, server-side, exactly as before for a logged-out
 * visitor. NaiViewer loads the signed-in visitor's tier view and any `?day=N` from
 * /api/viewer/nai after hydration (reading searchParams/cookies here would make the page
 * dynamic and uncacheable).
 */
export const revalidate = 900;

export default async function NaiMapPage() {
  const supabase = createPublicClient();
  const currentDay = await getConflictDay();

  // currentDay = calendar (DAY LOCK). latestDay = nai_scores_v2's OWN max day for the
  // war-posture-v1 method. Legacy nai_scores (Days 1-35, retired method) is NEVER used here
  // as a fallback: if v2 has no rows the page shows the honest empty state.
  const [{ firstDay, latestDay }, { data: tierRows }] = await Promise.all([
    getNaiV2DayRange(supabase),
    supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access'),
  ]);
  const conflictDay = latestDay ?? currentDay;

  const flags = buildTierFlags(tierRows ?? []);
  // Anonymous-visitor access only: this page is cached and served to everyone.
  const hasLatentAccess = tierHasFeature(null, 'nai_latent_score', flags);
  const hasGapAccess = tierHasFeature(null, 'nai_gap_analysis', flags);

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
      <NaiViewer
        initial={{ rows, conflictDay, hasLatentAccess, hasGapAccess }}
        latestDay={latestDay}
        firstDay={firstDay}
        tierFlags={flags}
        conflictDayBadge={
          <>
            <ConflictDayBadge />
            <DataAsOf section="NAI WAR POSTURE" latestDay={latestDay} currentDay={currentDay} className="mt-2" />
          </>
        }
      />
    </Suspense>
  );
}
