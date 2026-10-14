'use client';

import { useEffect, useRef, useState } from 'react';
import { HEIGHTFIELD_URL, NEUTRAL_STYLES, type ReliefLaneId, type ReliefLaneStyle } from './model';
import { ReliefPoster } from './ReliefPoster';

/**
 * Keeps the relief off the text rows at the top of the hero (the ticker row and, on phones, the
 * CorridorStrip header): fully transparent for the first 72 px, opaque from 128 px.
 */
export const RELIEF_TOP_FADE = 'linear-gradient(to bottom, transparent 0, transparent 72px, #000 128px)';

type Lanes = Record<ReliefLaneId, ReliefLaneStyle>;
type GlModule = typeof import('./relief-gl');
export type ReliefController = ReturnType<GlModule['startRelief']>;

/**
 * Loads the renderer and the heightfield, then starts the relief with the CURRENT lanes (read when
 * it starts, so a prop change while loading is not lost) and the reduced-motion flag passed through.
 * The browser pieces are injected, so tests run it with a stub renderer.
 */
export async function startReliefGl(d: {
  load: () => Promise<Pick<GlModule, 'decodeHeightfield' | 'startRelief'>>;
  fetchHeightfield: () => Promise<ArrayBuffer>;
  canvas: () => HTMLCanvasElement | null;
  lanes: () => Lanes;
  reducedMotion: boolean;
  isCancelled: () => boolean;
  onReady: () => void;
  onFail: () => void;
}): Promise<ReliefController | undefined> {
  const [m, buf] = await Promise.all([d.load(), d.fetchHeightfield()]);
  const heights = await m.decodeHeightfield(buf);
  const canvas = d.canvas();
  if (d.isCancelled() || !canvas) return undefined;
  return m.startRelief(canvas, {
    heights,
    styles: d.lanes(),
    reducedMotion: d.reducedMotion,
    onReady: d.onReady,
    onFail: d.onFail,
  });
}

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
  // Latest lanes for a renderer that starts later (set during render, so it is never one prop behind).
  const lanesRef = useRef(lanes);
  lanesRef.current = lanes;
  const ctlRef = useRef<ReliefController | undefined>(undefined);

  // Fade the poster in (instant with reduced motion).
  useEffect(() => {
    if (shown) return;
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, [shown]);

  useEffect(() => {
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
    startReliefGl({
      load: () => import('./relief-gl'),
      fetchHeightfield: () =>
        fetch(HEIGHTFIELD_URL, { signal: ac.signal }).then((r) => {
          if (!r.ok) throw new Error(`heightfield ${r.status}`);
          return r.arrayBuffer();
        }),
      canvas: () => canvasRef.current,
      lanes: () => lanesRef.current,
      reducedMotion,
      isCancelled: () => cancelled,
      onReady: () => !cancelled && setGlState('on'),
      onFail: fail,
    })
      .then((ctl) => {
        if (cancelled) ctl?.destroy();
        else ctlRef.current = ctl;
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
