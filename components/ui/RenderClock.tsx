'use client';

import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';

/**
 * The server render time, shared with every client component that judges time-dependent copy
 * (DataAsOf: "publishes around 02:00 UTC" before a deadline, "Stale" after it).
 *
 * Why: a page rendered (and cached) at 03:59 UTC and hydrated at 04:01 UTC would otherwise render a
 * different verdict on the client than the HTML holds, a React hydration mismatch (#418). The root
 * layout passes `renderedAt = Date.now()` once per render; it travels in the RSC payload, so the server
 * HTML and the hydrating client both judge at the SAME instant on first paint. After mount every
 * consumer switches to the real clock (and re-checks each minute), so a cached page cannot keep showing a
 * verdict the clock has outgrown, and one page never contradicts itself.
 */
const RenderClockContext = createContext<number | null>(null);

export function RenderClockProvider({ renderedAt, children }: { renderedAt: number; children: ReactNode }) {
  return <RenderClockContext.Provider value={renderedAt}>{children}</RenderClockContext.Provider>;
}

/**
 * true while rendering on the server or hydrating server HTML; false for a plain client render (client
 * navigation, a section that mounts once its data loads). useSyncExternalStore uses the server snapshot
 * for both of the former, per component, so chunked/Suspense hydration is handled too.
 */
const noopSubscribe = () => () => {};
function useIsServerOrHydrating(): boolean {
  return useSyncExternalStore(noopSubscribe, () => false, () => true);
}

/** Re-check interval after mount. */
export const RENDER_CLOCK_TICK_MS = 60_000;

/** First-paint instant for a consumer (exported for tests). */
export function initialJudgeTime(renderedAt: number | null, override: number | undefined, hydrating: boolean, clock: () => number): number {
  if (override != null) return override;
  if (hydrating && renderedAt != null) return renderedAt;
  return clock();
}

/**
 * Milliseconds since epoch to judge freshness at: the server render time on first paint (hydration-safe),
 * then the real clock after mount, refreshed every minute. `override` (tests) pins it.
 */
export function useJudgeTime(override?: number): number {
  const renderedAt = useContext(RenderClockContext);
  const hydrating = useIsServerOrHydrating();
  const [now, setNow] = useState(() => initialJudgeTime(renderedAt, override, hydrating, Date.now));
  useEffect(() => {
    if (override != null) return;
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), RENDER_CLOCK_TICK_MS);
    return () => clearInterval(id);
  }, [override]);
  return now;
}
