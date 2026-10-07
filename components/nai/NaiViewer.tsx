'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { NaiMapClient } from '@/components/nai/NaiMapClient';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';
import type { NaiV2View } from '@/lib/nai-v2';

type NaiState = {
  rows: NaiV2View[];
  conflictDay: number;
  hasLatentAccess: boolean;
  hasGapAccess: boolean;
};

/** Reads `?day=N`. Its own Suspense boundary keeps the map/sidebar server-rendered. */
function DayParam({ onDay }: { onDay: (day: number | null) => void }) {
  const raw = useSearchParams().get('day');
  useEffect(() => {
    const n = raw ? parseInt(raw, 10) : NaN;
    onDay(Number.isFinite(n) && n > 0 ? n : null);
    // onDay is stable (state setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  return null;
}

/**
 * /nai is cached and rendered for an anonymous visitor at the latest War Posture day. After
 * hydration this loads, from /api/viewer/nai (session re-checked server-side, never cached):
 *  - the latent band / gap / category when the signed-in visitor's tier unlocks them, and
 *  - a historical day when the URL carries `?day=N`.
 * Anonymous visitors on the latest day make no extra request.
 */
export function NaiViewer({
  initial,
  latestDay,
  firstDay,
  tierFlags,
  conflictDayBadge,
}: {
  initial: NaiState;
  latestDay: number | null;
  firstDay: number | null;
  tierFlags: TierFlags;
  conflictDayBadge: ReactNode;
}) {
  const tier = useViewerTier();
  const [dayParam, setDayParam] = useState<number | null>(null);
  const [state, setState] = useState<NaiState>(initial);

  const wantDay = dayParam ?? latestDay ?? initial.conflictDay;
  const wantLatent = tierHasFeature(tier ?? null, 'nai_latent_score', tierFlags);
  const wantGap = tierHasFeature(tier ?? null, 'nai_gap_analysis', tierFlags);
  const tierUnlocksMore = (wantLatent && !initial.hasLatentAccess) || (wantGap && !initial.hasGapAccess);

  useEffect(() => {
    if (tier === undefined) return; // wait until the visitor's tier is known
    if (wantDay === initial.conflictDay && !tierUnlocksMore) {
      setState(initial);
      return;
    }
    let cancelled = false;
    fetch(`/api/viewer/nai?day=${wantDay}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<(NaiState & { rows: NaiV2View[] }) | null>) : null))
      .then((j: (NaiState & { rows: NaiV2View[] }) | null) => {
        if (cancelled || !j || !Array.isArray(j.rows)) return;
        setState({
          rows: j.rows,
          conflictDay: j.conflictDay,
          hasLatentAccess: !!j.hasLatentAccess,
          hasGapAccess: !!j.hasGapAccess,
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tier, wantDay, tierUnlocksMore, initial]);

  return (
    <>
      <Suspense fallback={null}>
        <DayParam onDay={setDayParam} />
      </Suspense>
      <NaiMapClient
        rows={state.rows}
        conflictDay={state.conflictDay}
        latestDay={latestDay}
        firstDay={firstDay}
        hasLatentAccess={state.hasLatentAccess}
        hasGapAccess={state.hasGapAccess}
        conflictDayBadge={
          <>
            {conflictDayBadge}
            {latestDay != null && state.conflictDay !== latestDay && (
              <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }} translate="no">
                VIEWING HISTORICAL NAI — DAY {state.conflictDay}
              </p>
            )}
          </>
        }
      />
    </>
  );
}
