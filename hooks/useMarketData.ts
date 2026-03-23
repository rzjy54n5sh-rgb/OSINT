'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { MarketData } from '@/types/supabase';

export interface KeyMetric {
  label: string;
  value: string;
  change: string;
  up: boolean;
}

/**
 * Fetches the latest market_data rows (highest conflict_day) and maps
 * key indicators to a display-ready format for the homepage metrics strip.
 */
export function useMarketData(): { metrics: KeyMetric[]; loading: boolean } {
  const [metrics, setMetrics] = useState<KeyMetric[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        // Get the latest conflict_day's data
        const { data, error } = await supabase
          .from('market_data')
          .select('indicator, value, change_pct, unit, conflict_day')
          .order('conflict_day', { ascending: false })
          .limit(50);
        if (cancelled) return;
        if (error || !data || data.length === 0) {
          setMetrics([]);
          setLoading(false);
          return;
        }
        const rows = data as MarketData[];
        // Use only the latest conflict day
        const latestDay = rows[0].conflict_day;
        const latest = rows.filter((r) => r.conflict_day === latestDay);

        // Find key indicators (pick latest row per indicator)
        const seen = new Map<string, MarketData>();
        for (const r of latest) {
          const key = (r.indicator ?? '').toLowerCase();
          if (!seen.has(key)) seen.set(key, r);
        }

        const out: KeyMetric[] = [];

        // Brent
        const brent = seen.get('brent crude oil');
        if (brent) {
          out.push({
            label: 'BRENT',
            value: `$${brent.value?.toFixed(2) ?? '--'}`,
            change: brent.change_pct != null ? `${brent.change_pct >= 0 ? '+' : ''}${brent.change_pct.toFixed(1)}%` : '--',
            up: (brent.change_pct ?? 0) >= 0,
          });
        }

        // Gold
        const gold = seen.get('gold');
        if (gold) {
          out.push({
            label: 'GOLD',
            value: `$${gold.value?.toFixed(0) ?? '--'}`,
            change: gold.change_pct != null ? `${gold.change_pct >= 0 ? '+' : ''}${gold.change_pct.toFixed(1)}%` : '--',
            up: (gold.change_pct ?? 0) >= 0,
          });
        }

        // VIX
        const vix = seen.get('vix (fear index)');
        if (vix) {
          out.push({
            label: 'VIX',
            value: vix.value?.toFixed(1) ?? '--',
            change: vix.change_pct != null ? `${vix.change_pct >= 0 ? '+' : ''}${vix.change_pct.toFixed(1)}%` : '--',
            up: (vix.change_pct ?? 0) < 0, // VIX down is good
          });
        }

        // S&P 500
        const sp = seen.get('s&p 500');
        if (sp) {
          out.push({
            label: 'S&P 500',
            value: sp.value?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '--',
            change: sp.change_pct != null ? `${sp.change_pct >= 0 ? '+' : ''}${sp.change_pct.toFixed(1)}%` : '--',
            up: (sp.change_pct ?? 0) >= 0,
          });
        }

        // If we don't have 4 metrics, pad with what's available
        if (out.length === 0) {
          // Fallback: show first 4 unique indicators
          const fallback = Array.from(seen.values()).slice(0, 4);
          for (const r of fallback) {
            out.push({
              label: (r.indicator ?? 'N/A').toUpperCase(),
              value: r.value != null ? String(r.value) : '--',
              change: r.change_pct != null ? `${r.change_pct >= 0 ? '+' : ''}${r.change_pct.toFixed(1)}%` : '--',
              up: (r.change_pct ?? 0) >= 0,
            });
          }
        }

        setMetrics(out);
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

  return { metrics, loading };
}
