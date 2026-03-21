'use client';

import { useEffect, useState } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { createClient } from '@/lib/supabase/client';
import type { MarketData } from '@/types/supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function MarketsPage() {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    void (async () => {
      try {
        const { data: d, error: e } = await supabase
          .from('market_data')
          .select('*')
          .order('conflict_day', { ascending: true });
        if (cancelled) return;
        if (e) setError(e);
        else setData((d as MarketData[]) ?? []);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err : new Error('Failed to load markets'));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const byIndicator = data.reduce<Record<string, MarketData[]>>((acc, row) => {
    const k = row.indicator ?? 'OTHER';
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="ECONOMIC INTELLIGENCE"
        description="Conflict-sensitive market indicators tracked daily. Brent crude, VIX, gold, and regional currency movements are the most direct economic signals of conflict escalation and de-escalation sentiment. Each indicator includes its trend across conflict days."
        note="This is not financial advice. Market data is sourced from public feeds and updated every 30 minutes. It represents the aggregate market assessment of conflict trajectory, not a prediction of future prices."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        ECONOMIC INTELLIGENCE
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        KEY INDICATORS — TREND BY CONFLICT DAY
      </p>
      {loading && (
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      )}
      {error && (
        <div className="font-mono text-xs py-8 border px-4" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
          [DATA UNAVAILABLE]
        </div>
      )}
      {!loading && !error && Object.keys(byIndicator).length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {!loading && !error && Object.keys(byIndicator).length > 0 && (
        <div className="grid md:grid-cols-2 gap-6">
          {Object.entries(byIndicator).map(([indicator, rows]) => {
            const unit = rows[0]?.unit ?? '';
            const chartRows = rows.map((r) => ({ day: r.conflict_day, value: r.value }));
            const chartData = chartRows.length === 1
              ? [chartRows[0], { day: (chartRows[0].day ?? 1) + 1, value: chartRows[0].value }]
              : chartRows;
            return (
              <OsintCard key={indicator}>
                <h2 className="font-display text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
                  {indicator}{unit ? ` — ${unit}` : ''}
                </h2>
                {unit && (
                  <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-muted)' }}>{unit}</p>
                )}
                <div className="flex gap-4 font-mono text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
                  <span>VALUE: {rows[rows.length - 1]?.value ?? '—'}</span>
                  {rows[rows.length - 1]?.change_pct != null && (
                    <span style={{ color: (rows[rows.length - 1].change_pct as number) >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
                      {rows[rows.length - 1].change_pct}%
                    </span>
                  )}
                </div>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} domain={['auto', 'auto']} />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--bg-card)',
                          border: '1px solid var(--border)',
                          borderRadius: 2,
                        }}
                      />
                      <Line type="monotone" dataKey="value" stroke="var(--accent-gold)" strokeWidth={1.5} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </OsintCard>
            );
          })}
        </div>
      )}
    </div>
  );
}
