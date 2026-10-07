'use client';

import { useEffect, useState } from 'react';
import { EMPTY_FRESHNESS, fetchDataFreshness, type DataFreshness } from '@/lib/data-freshness';

/**
 * Real per-table data freshness (daily_briefings, articles, scenario_probabilities).
 * It no longer reads the archived `nai_scores` table.
 *
 * Exported API is backwards compatible: `{ lastNaiUpdate, stale }` still exist.
 * `lastNaiUpdate` is a deprecated alias of `lastUpdateAt` (newest article timestamp).
 * New fields: see DataFreshness (staleReasons, pipelineActive, lastUpdateAt, ...).
 */
export function useDataFreshness(): DataFreshness & { lastNaiUpdate: string | null } {
  const [f, setF] = useState<DataFreshness>(EMPTY_FRESHNESS);

  useEffect(() => {
    let cancelled = false;
    void fetchDataFreshness().then((r) => {
      if (!cancelled) setF(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { ...f, lastNaiUpdate: f.lastUpdateAt };
}
