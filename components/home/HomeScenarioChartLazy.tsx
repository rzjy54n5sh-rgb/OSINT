'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import type { HomeScenarioRow } from '@/components/home/HomeScenarioChart';

const HomeScenarioChart = dynamic(() => import('@/components/home/HomeScenarioChart').then((m) => m.HomeScenarioChart), {
  ssr: false,
  loading: () => <div className="h-48" aria-hidden="true" />,
});

/**
 * Mounts the recharts chart (its own chunk: recharts + d3, ~370 KB minified) only when the
 * card is within 300 px of the viewport. Before that, and while the chunk loads, an empty box of the
 * chart's exact height (h-48) holds its place, so the page never shifts. recharts used to be parsed
 * during home hydration (~1.1 s of main thread in Lighthouse mobile, 2026-10-13).
 */
export function HomeScenarioChartLazy(props: { data: HomeScenarioRow[]; bAsRange: boolean; hasMeasuredE: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || show) return;
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShow(true);
          io.disconnect();
        }
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);

  return <div ref={ref}>{show ? <HomeScenarioChart {...props} /> : <div className="h-48" aria-hidden="true" />}</div>;
}
