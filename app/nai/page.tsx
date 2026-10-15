import { pageMetadata } from '@/lib/site';
import { Suspense } from 'react';
import type { Metadata } from 'next';
import { createPublicClient } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { NaiViewer } from '@/components/nai/NaiViewer';
import { getPostureBoard } from '@/lib/posture';
import { postureSourceLabels } from '@/lib/posture-outlets';

export const metadata: Metadata = pageMetadata({
  title: 'War Posture — MENA Intel Desk',
  description:
    "Each tracked government's stated position on continuing each war, per conflict, on one party-neutral scale (0 = immediate ceasefire, 100 = continue or escalate), with the verbatim statement, its date and an archived copy where one exists.",
  path: '/nai',
});

/**
 * ISR: posture rows change at most daily. This HTML is shared by the edge cache, so it is rendered for
 * an ANONYMOUS visitor (locked fields withheld server-side). NaiViewer loads the signed-in visitor's
 * tier view and any `?day=N` from /api/viewer/posture after hydration.
 *
 * Board: War Posture v2 (per conflict, viewer_posture_v2) when that migration is applied and has rows;
 * otherwise the v1 table (one blended number per country), labelled as such. Legacy nai_scores
 * (Days 1-35, retired method) is never used here. Outlet names come from outlet_aliases / outlets.
 */
export const revalidate = 900;

export default async function NaiPage() {
  const supabase = createPublicClient();
  const { data: tierRows } = await supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  // Anonymous-visitor access only: this page is cached and served to everyone.
  const access = { latent: tierHasFeature(null, 'nai_latent_score', flags), gap: tierHasFeature(null, 'nai_gap_analysis', flags) };
  const board = await getPostureBoard(supabase, { access, withDays: true });
  const labels = await postureSourceLabels(board);

  return (
    <Suspense fallback={<p style={{ padding: 24, color: 'var(--muted)' }}>Loading War Posture…</p>}>
      <NaiViewer initial={board} labels={labels} tierFlags={flags} />
    </Suspense>
  );
}
