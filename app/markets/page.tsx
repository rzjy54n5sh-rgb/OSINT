'use client';

import { useEffect, useState } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { createClient } from '@/lib/supabase/client';
import type { MarketData } from '@/types/supabase';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function MarketsPage() {
  const [data, setData] = useState<MarketData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase
      .from('market_data')
      .select('*')
      .order('conflict_day', { ascending: true })
      .then(({ data: d, error: e }) => {
        setLoading(false);
        if (e) setError(e);
        else setData((d as MarketData[]) ?? []);
      });
  }, []);

  const byIndicator = data.reduce<Record<string, MarketData[]>>((acc, row) => {
    const k = row.indicator ?? 'OTHER';
    if (!acc[k]) acc[k] = [];
    acc[k].push(row);
    return acc;
  }, {});

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
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
          {Object.entries(byIndicator).map(([indicator, rows]) => (
            <OsintCard key={indicator}>
              <h2 className="font-display text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
                {indicator}
              </h2>
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
                  <LineChart
                    data={rows.map((r) => ({ day: r.conflict_day, value: r.value }))}
                  >
                    <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
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
          ))}
        </div>
      )}
    </div>
  );
}
