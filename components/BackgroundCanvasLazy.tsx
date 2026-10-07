'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';

/**
 * The WebGL particle background is decorative. It used to be imported statically by the root
 * layout, so three.js (~135 KB) was parsed and the WebGL context was created during hydration of
 * every page — the 3–6 s main-thread block on `/` in the audit. It now loads as its own chunk,
 * only once the browser is idle after load, and never for prefers-reduced-motion visitors.
 * It is `position: fixed` behind the content, so loading it late causes no layout shift.
 */
const BackgroundCanvas = dynamic(
  () => import('@/components/BackgroundCanvas').then((m) => m.BackgroundCanvas),
  { ssr: false },
);

export function BackgroundCanvasLazy() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    let cancelled = false;
    let idleId: number | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const start = () => {
      if (cancelled) return;
      if ('requestIdleCallback' in window) {
        idleId = window.requestIdleCallback(() => !cancelled && setReady(true), { timeout: 4000 });
      } else {
        timeoutId = setTimeout(() => !cancelled && setReady(true), 1500);
      }
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener('load', start);
      if (idleId !== undefined && 'cancelIdleCallback' in window) window.cancelIdleCallback(idleId);
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, []);

  return ready ? <BackgroundCanvas /> : null;
}
