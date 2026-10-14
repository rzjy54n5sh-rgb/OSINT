'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { hero3DDecision, heroReliefMode, isSoftwareRenderer, readHero3DEnv, type Hero3DWindowLike } from '@/lib/hero-3d';

/**
 * The corridor relief (poster + optional raw-WebGL scene) is its own chunk, requested only after the
 * page has loaded, the hero is on screen and the main thread is idle. No three.js.
 */
const ReliefLayer = dynamic(() => import('@/components/home/relief/ReliefLayer').then((m) => m.ReliefLayer), {
  ssr: false,
});

/** Hardware WebGL only: software rasterisers (SwiftShader, llvmpipe) report a major performance caveat. */
function hasFastWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const opts = { failIfMajorPerformanceCaveat: true } as const;
    const gl = (c.getContext('webgl', opts) ?? c.getContext('webgl2', opts)) as WebGLRenderingContext | null;
    if (!gl) return false;
    // The caveat flag does not reject SwiftShader in Chromium: check the renderer string too.
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return !isSoftwareRenderer(typeof renderer === 'string' ? renderer : null);
  } catch {
    return false;
  }
}

/**
 * Home hero backdrop: the one 3D touch (System artboard), a tilted relief of the Gulf → Hormuz →
 * Arabian Sea → Bab al-Mandeb → Red Sea → Suez corridor with each lane in its status colour.
 *
 * Layers, all absolutely positioned inside a fixed-height box (never shifts layout, CLS 0):
 *  1. CSS gradient (`.hero-scene`, server-rendered): everyone, from first paint.
 *  2. Static SVG relief: added after load + on screen + idle, for everyone except Save-Data.
 *  3. Raw-WebGL relief over it, only when lib/hero-3d.ts allows (no reduced motion, no Save-Data,
 *     ≥ 768 px, ≥ 4 cores, ≥ 4 GB or unknown, hardware WebGL — software renderers are rejected).
 * aria-hidden: the CorridorStrip prints every status as text. Only HomeDashboard renders this.
 */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<{ gl: boolean; reducedMotion: boolean } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Cheap checks first: a Save-Data visitor downloads nothing beyond the page.
    if (heroReliefMode(readHero3DEnv(window as unknown as Hero3DWindowLike)) === 'none') return;

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let io: IntersectionObserver | undefined;

    const decide = () => {
      if (cancelled) return;
      const env = readHero3DEnv(window as unknown as Hero3DWindowLike);
      // The WebGL probe runs last, and only for a visitor every cheap check already admits.
      const webgl = hero3DDecision(env).render ? hasFastWebGL() : false;
      const m = heroReliefMode({ ...env, webgl });
      if (m === 'none') return;
      setMode({ gl: m === 'gl', reducedMotion: env.reducedMotion });
    };
    const whenIdle = () => {
      if (cancelled) return;
      if ('requestIdleCallback' in window) idleId = window.requestIdleCallback(decide, { timeout: 4000 });
      else timeoutId = setTimeout(decide, 1500);
    };
    const whenVisible = () => {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io?.disconnect();
          whenIdle();
        }
      });
      io.observe(el);
    };
    if (document.readyState === 'complete') whenVisible();
    else window.addEventListener('load', whenVisible, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener('load', whenVisible);
      io?.disconnect();
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return (
    <div ref={ref} className="hero-scene" aria-hidden="true" data-hero-3d={mode?.gl ? 'on' : 'off'}>
      {mode && <ReliefLayer gl={mode.gl} reducedMotion={mode.reducedMotion} />}
    </div>
  );
}
