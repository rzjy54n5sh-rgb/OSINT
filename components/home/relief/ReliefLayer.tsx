'use client';

import { useEffect, useRef, useState } from 'react';
import { HEIGHTFIELD_URL, NEUTRAL_STYLES, type ReliefLaneId, type ReliefLaneStyle } from './model';
import { ReliefPoster } from './ReliefPoster';

/**
 * Keeps the relief off the text rows at the top of the hero (the ticker row and, on phones, the
 * CorridorStrip header): fully transparent for the first 72 px, opaque from 128 px.
 */
export const RELIEF_TOP_FADE = 'linear-gradient(to bottom, transparent 0, transparent 72px, #000 128px)';

/**
 * The corridor relief inside the home hero (mounted by HeroScene after first paint and idle, so
 * nothing here is on the LCP path). Always renders the static poster; when `gl` is true it also
 * loads the raw-WebGL renderer and the committed heightfield (same origin, /relief/) and fades the
 * canvas in over the poster. Any failure (fetch, decode, context loss) leaves the poster showing.
 *
 * `lanes` comes from the server: reliefLaneStyles() of the same corridors view the CorridorStrip
 * renders (app/page.tsx), so the relief never colours a lane the strip prints as UNKNOWN. Nothing
 * here reads the corridor file or the visitor's clock.
 */
export function ReliefLayer({
  gl,
  reducedMotion,
  lanes = NEUTRAL_STYLES,
}: {
  gl: boolean;
  reducedMotion: boolean;
  /** Missing → every lane UNKNOWN (neutral, dashed). */
  lanes?: Record<ReliefLaneId, ReliefLaneStyle>;
}) {
  const [glState, setGlState] = useState<'off' | 'loading' | 'on'>(gl ? 'loading' : 'off');
  const [shown, setShown] = useState(reducedMotion);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lanesRef = useRef(lanes);
  const ctlRef = useRef<{ setStyles(s: Record<ReliefLaneId, ReliefLaneStyle>): void; destroy(): void } | undefined>(undefined);

  // Fade the poster in (instant with reduced motion).
  useEffect(() => {
    if (shown) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [shown]);

  useEffect(() => {
    lanesRef.current = lanes;
    ctlRef.current?.setStyles(lanes);
  }, [lanes]);

  useEffect(() => {
    if (!gl) return;
    let cancelled = false;
    const ac = new AbortController();
    const stop = () => {
      ctlRef.current?.destroy();
      ctlRef.current = undefined;
    };
    const fail = () => {
      stop();
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
        ctlRef.current = m.startRelief(canvasRef.current, {
          heights,
          styles: lanesRef.current,
          reducedMotion,
          onReady: () => !cancelled && setGlState('on'),
          onFail: fail,
        });
      })
      .catch(fail);
    return () => {
      cancelled = true;
      ac.abort();
      stop();
    };
  }, [gl, reducedMotion]);

  return (
    <div
      data-relief={glState === 'on' ? 'gl' : 'poster'}
      style={{
        position: 'absolute',
        inset: 0,
        direction: 'ltr',
        opacity: 0.6,
        WebkitMaskImage: RELIEF_TOP_FADE,
        maskImage: RELIEF_TOP_FADE,
      }}
    >
      <ReliefPoster styles={lanes} visible={shown && glState !== 'on'} fade={!reducedMotion} />
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
