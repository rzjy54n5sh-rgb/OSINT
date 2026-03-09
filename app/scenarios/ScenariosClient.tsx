'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';

const SCENARIOS = ['A', 'B', 'C', 'D'] as const;

export function ScenariosClient() {
  const [data, setData] = useState<{ conflict_day: number; scenario_a: number; scenario_b: number; scenario_c: number; scenario_d: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const run = async () => {
      try {
        const { data: d } = await supabase
          .from('scenario_probabilities')
          .select('*')
          .order('conflict_day', { ascending: true })
          .limit(50);
        setData((d ?? []) as typeof data);
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, []);

  if (loading) {
    return (
      <div className="mt-6 h-64 animate-pulse rounded-lg border border-[var(--border)] bg-bg-card" />
    );
  }

  if (data.length === 0) {
    return (
      <div className="mt-8 rounded-lg border border-[var(--border)] bg-bg-card p-12 text-center">
        <p className="font-mono text-sm uppercase tracking-wider text-text-muted">
          Awaiting data feed...
        </p>
        <p className="mt-2 text-sm text-text-secondary">Scenario probabilities (A/B/C/D) will appear here.</p>
      </div>
    );
  }

  const latest = data[data.length - 1];
  const colors = ['var(--accent-blue)', 'var(--accent-green)', 'var(--accent-gold)', 'var(--accent-orange)'];

  return (
    <div className="mt-6 space-y-8">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SCENARIOS.map((s, i) => (
          <div key={s} className="osint-card rounded-lg bg-bg-card p-4">
            <span className="osint-label text-text-muted">Scenario {s}</span>
            <div className="mt-2 h-4 overflow-hidden rounded-full bg-bg-elevated">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${(latest[`scenario_${s.toLowerCase()}` as keyof typeof latest] as number) * 100}%`,
                  backgroundColor: colors[i],
                }}
              />
            </div>
            <span className="mt-1 block font-mono text-lg text-text-primary">
              {((latest[`scenario_${s.toLowerCase()}` as keyof typeof latest] as number) * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
      <div className="h-[320px] rounded-lg border border-[var(--border)] bg-bg-card p-4">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
            <XAxis dataKey="conflict_day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
            <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
            <Legend />
            <Bar dataKey="scenario_a" name="A" fill="var(--accent-blue)" stackId="stack" />
            <Bar dataKey="scenario_b" name="B" fill="var(--accent-green)" stackId="stack" />
            <Bar dataKey="scenario_c" name="C" fill="var(--accent-gold)" stackId="stack" />
            <Bar dataKey="scenario_d" name="D" fill="var(--accent-orange)" stackId="stack" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
