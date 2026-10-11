'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { PostureMapClient } from '@/components/posture/PostureMapClient';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';
import type { PostureBoard } from '@/lib/posture';

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
 * /nai is cached and rendered for an anonymous visitor. After hydration this loads, from
 * /api/viewer/posture (session re-checked server-side, never cached):
 *  - the latent band / gap / category when the signed-in visitor's tier unlocks them, and
 *  - a historical day when the URL carries `?day=N`.
 * Anonymous visitors on the default day make no extra request.
 */
export function NaiViewer({
  initial,
  tierFlags,
  conflictDayBadge,
}: {
  initial: PostureBoard;
  tierFlags: TierFlags;
  conflictDayBadge: ReactNode;
}) {
  const tier = useViewerTier();
  const [dayParam, setDayParam] = useState<number | null>(null);
  const [board, setBoard] = useState<PostureBoard>(initial);

  const wantDay = dayParam ?? initial.day;
  const wantLatent = tierHasFeature(tier ?? null, 'nai_latent_score', tierFlags);
  const wantGap = tierHasFeature(tier ?? null, 'nai_gap_analysis', tierFlags);
  const tierUnlocksMore = (wantLatent && !initial.hasLatentAccess) || (wantGap && !initial.hasGapAccess);

  useEffect(() => {
    if (tier === undefined) return; // wait until the visitor's tier is known
    if (wantDay === initial.day && !tierUnlocksMore) {
      setBoard(initial);
      return;
    }
    let cancelled = false;
    fetch(`/api/viewer/posture${wantDay != null ? `?day=${wantDay}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? (r.json() as Promise<PostureBoard | null>) : null))
      .then((j) => {
        if (cancelled || !j || !Array.isArray(j.rows)) return;
        setBoard(j);
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
      <PostureMapClient
        board={board}
        defaultDay={initial.day}
        conflictDayBadge={
          <>
            {conflictDayBadge}
            {initial.day != null && board.day !== initial.day && (
              <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }} translate="no">
                VIEWING HISTORICAL WAR POSTURE — DAY {board.day}
              </p>
            )}
          </>
        }
      />
    </>
  );
}
