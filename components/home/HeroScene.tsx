'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { hero3DDecision, isSoftwareRenderer, readHero3DEnv, type Hero3DWindowLike } from '@/lib/hero-3d';

/** three.js (~130 KB) is its own chunk, requested only when the scene is actually going to render. */
const HeroStarfield = dynamic(() => import('@/components/home/HeroStarfield').then((m) => m.HeroStarfield), {
  ssr: false,
});

/** Hardware WebGL only: software rasterisers (SwiftShader, llvmpipe) report a major performance caveat. */
function hasFastWebGL(): boolean {
  try {
    const c = document.createElement('canvas');
    const opts = { failIfMajorPerformanceCaveat: true } as const;
    const gl = (c.getContext('webgl2', opts) ?? c.getContext('webgl', opts)) as WebGLRenderingContext | null;
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
 * Home hero backdrop. The static layer (CSS gradient, `.hero-scene`) is server-rendered for everyone
 * and is the fallback. The WebGL particle field is added on top only when ALL of these hold:
 * no prefers-reduced-motion, no Save-Data, navigator.deviceMemory unknown or ≥ 4 GB, a hardware WebGL
 * context, the hero is on screen, the page has loaded and the main thread is idle.
 * Absolutely positioned behind the content with a fixed height, so it never shifts layout.
 * Only HomeDashboard renders this: data pages (/nai, /warroom, /scenarios, /countries/*, briefs,
 * trust pages) carry no 3D.
 */
export function HeroScene() {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Cheap checks first: a skipped visitor never creates a GL context or downloads three.js.
    if (!hero3DDecision(readHero3DEnv(window as unknown as Hero3DWindowLike)).render) return;

    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let io: IntersectionObserver | undefined;

    const decide = () => {
      if (cancelled) return;
      const env = { ...readHero3DEnv(window as unknown as Hero3DWindowLike), webgl: hasFastWebGL() };
      if (hero3DDecision(env).render) setReady(true);
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
    <div ref={ref} className="hero-scene" aria-hidden="true" data-hero-3d={ready ? 'on' : 'off'}>
      {ready && <HeroStarfield />}
    </div>
  );
}
