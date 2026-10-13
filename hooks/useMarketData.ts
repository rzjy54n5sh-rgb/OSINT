'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MarketData } from '@/types/supabase';
import { buildHomeMarketMetrics, MARKET_LATEST_COLUMNS, MARKET_LATEST_ROWS, type HomeMarketMetric } from '@/lib/market-latest';

export type KeyMetric = HomeMarketMetric;

/**
 * Client fallback for the homepage metrics strip (used only when the server payload has no tiles).
 * Same read and the same rule as app/page.tsx and the War Room: the newest market_data row per
 * indicator by created_at (lib/market-latest.ts), one rounding rule, each tile with its own timestamp.
 */
export function useMarketData(): { metrics: KeyMetric[]; loading: boolean; latestDay: number | null } {
  const [metrics, setMetrics] = useState<KeyMetric[]>([]);
  const [latestDay, setLatestDay] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data, error } = await supabase
          .from('market_data')
          .select(MARKET_LATEST_COLUMNS)
          .order('created_at', { ascending: false })
          .order('id', { ascending: true })
          .limit(MARKET_LATEST_ROWS);
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setMetrics([]);
          return;
        }
        const built = buildHomeMarketMetrics(data as MarketData[]);
        setMetrics(built.metrics);
        setLatestDay(built.latestDay);
      } catch {
        if (!cancelled) setMetrics([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { metrics, loading, latestDay };
}
