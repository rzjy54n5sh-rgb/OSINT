'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { PostureBoard } from '@/components/posture/PostureBoard';
import { useViewerTier } from '@/hooks/useViewerTier';
import { tierHasFeature, type TierFlags } from '@/lib/tier';
import { currentConflictDayUtc, type PostureBoard as Board } from '@/lib/posture';
import { isBoardPayload, parseDayParam, type SourceLabels } from '@/lib/posture-board';

/** Reads `?day=N` (1 … today; anything else = the latest board). Own Suspense boundary: the board stays server-rendered. */
function DayParam({ onDay }: { onDay: (day: number | null) => void }) {
  const raw = useSearchParams().get('day');
  useEffect(() => {
    onDay(parseDayParam(raw, currentConflictDayUtc()));
    // onDay is stable (state setter)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [raw]);
  return null;
}

function writeDay(day: number | null, mode: 'push' | 'replace') {
  const next = new URLSearchParams(window.location.search);
  if (day == null) next.delete('day');
  else next.set('day', String(day));
  const q = next.toString();
  const url = q ? `/nai?${q}` : '/nai';
  if (url === window.location.pathname + window.location.search) return; // no duplicate history entry
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', url);
}

/**
 * /nai is cached and rendered for an anonymous visitor. After hydration this loads, from
 * /api/viewer/posture (session re-checked server-side, never cached):
 *  - the latent band / gap / category when the signed-in visitor's tier unlocks them, and
 *  - a historical day when the URL carries `?day=N` (the day stepper sets it).
 * Anonymous visitors on the default day make no extra request. While a load runs the current board stays
 * (with a loading line); a failed or malformed response keeps it, puts the URL back to the board's day and
 * offers Retry, so the URL and the board never disagree.
 */
export function NaiViewer({ initial, labels: initialLabels, tierFlags }: { initial: Board; labels: SourceLabels; tierFlags: TierFlags }) {
  const tier = useViewerTier();
  const [dayParam, setDayParam] = useState<number | null>(null);
  const [view, setView] = useState<{ board: Board; labels: SourceLabels }>({ board: initial, labels: initialLabels });
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [pendingDay, setPendingDay] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const loaded = useRef<string>(`${initial.day}|base`);
  const shown = useRef<Board>(initial);

  const wantDay = dayParam ?? initial.day;
  const wantLatent = tierHasFeature(tier ?? null, 'nai_latent_score', tierFlags);
  const wantGap = tierHasFeature(tier ?? null, 'nai_gap_analysis', tierFlags);
  const tierUnlocksMore = (wantLatent && !initial.hasLatentAccess) || (wantGap && !initial.hasGapAccess);

  useEffect(() => {
    if (tier === undefined) return; // wait until the visitor's tier is known
    const key = `${wantDay}|${tierUnlocksMore ? 'tier' : 'base'}`;
    if (wantDay === initial.day && !tierUnlocksMore) {
      loaded.current = key;
      shown.current = initial;
      setView({ board: initial, labels: initialLabels });
      setStatus((st) => (st === 'error' ? st : 'idle'));
      return;
    }
    if (key === loaded.current) return;
    let cancelled = false;
    setStatus('loading');
    setPendingDay(wantDay);
    fetch(`/api/viewer/posture${wantDay != null ? `?day=${wantDay}` : ''}`, { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j: unknown) => {
        if (cancelled) return;
        if (!isBoardPayload(j)) throw new Error('malformed board');
        const { labels, ...board } = j;
        loaded.current = key;
        shown.current = board;
        setView({ board, labels: labels ?? {} });
        setStatus('idle');
      })
      .catch(() => {
        if (cancelled) return;
        setStatus('error');
        // Keep the URL on the day actually shown.
        const day = shown.current.day;
        loaded.current = `${day}|${tierUnlocksMore ? 'tier' : 'base'}`;
        writeDay(day === initial.day ? null : day, 'replace');
      });
    return () => {
      cancelled = true;
    };
  }, [tier, wantDay, tierUnlocksMore, initial, initialLabels, attempt]);

  const onDay = (day: number | null) => {
    if (status === 'error') setStatus('idle');
    writeDay(day, 'push');
  };
  const onRetry = () => {
    setStatus('idle');
    loaded.current = '';
    if (pendingDay != null && pendingDay !== shown.current.day) writeDay(pendingDay === initial.day ? null : pendingDay, 'push');
    else setAttempt((n) => n + 1);
  };

  return (
    <>
      <Suspense fallback={null}>
        <DayParam onDay={setDayParam} />
      </Suspense>
      <PostureBoard
        board={view.board}
        labels={view.labels}
        onDay={onDay}
        latestDay={initial.day}
        status={status}
        pendingDay={pendingDay}
        onRetry={onRetry}
      />
    </>
  );
}
