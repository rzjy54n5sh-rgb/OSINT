'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { getCorridors } from '@/lib/corridors';
import { HEIGHTFIELD_URL, reliefLaneStyles } from './model';
import { ReliefPoster } from './ReliefPoster';

/**
 * The corridor relief inside the home hero (mounted by HeroScene after first paint and idle, so
 * nothing here is on the LCP path). Always renders the static poster; when `gl` is true it also
 * loads the raw-WebGL renderer and the committed heightfield (same origin, /relief/) and fades the
 * canvas in over the poster. Any failure (fetch, decode, context loss) leaves the poster showing.
 *
 * Lane status: lib/corridors.ts over data/chokepoints/latest.json, evaluated now. Not current
 * (stale or withheld) → every lane UNKNOWN, neutral and dashed, exactly as the CorridorStrip prints it.
 * A wrong visitor clock can only push the view to stale/withheld (neutral), never to a status the
 * strip does not show.
 */
export function ReliefLayer({ gl, reducedMotion }: { gl: boolean; reducedMotion: boolean }) {
  const styles = useMemo(() => reliefLaneStyles(getCorridors(new Date())), []);
  const [glState, setGlState] = useState<'off' | 'loading' | 'on'>(gl ? 'loading' : 'off');
  const [shown, setShown] = useState(reducedMotion);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Fade the poster in (instant with reduced motion).
  useEffect(() => {
    if (shown) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [shown]);

  useEffect(() => {
    if (!gl) return;
    let cancelled = false;
    let ctl: { destroy(): void } | undefined;
    const ac = new AbortController();
    const fail = () => {
      if (!cancelled) setGlState('off');
    };
    Promise.all([
      import('./relief-gl'),
      fetch(HEIGHTFIELD_URL, { signal: ac.signal }).then((r) => {
        if (!r.ok) throw new Error(`heightfield ${r.status}`);
        return r.arrayBuffer();
      }),
    ])
      .then(async ([m, buf]) => {
        const heights = await m.decodeHeightfield(buf);
        if (cancelled || !canvasRef.current) return;
        ctl = m.startRelief(canvasRef.current, {
          heights,
          styles,
          reducedMotion,
          onReady: () => !cancelled && setGlState('on'),
          onFail: fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      ac.abort();
      ctl?.destroy();
    };
  }, [gl, styles, reducedMotion]);

  return (
    <div data-relief={glState === 'on' ? 'gl' : 'poster'} style={{ position: 'absolute', inset: 0, direction: 'ltr', opacity: 0.6 }}>
      <ReliefPoster styles={styles} visible={shown && glState !== 'on'} fade={!reducedMotion} />
      {glState !== 'off' && (
        <canvas
          ref={canvasRef}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            display: 'block',
            opacity: glState === 'on' ? 1 : 0,
            transition: 'opacity 1.2s ease',
          }}
        />
      )}
    </div>
  );
}
