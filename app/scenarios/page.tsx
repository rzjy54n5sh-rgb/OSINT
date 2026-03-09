'use client';

import { OsintCard } from '@/components/OsintCard';
import { SentimentBar } from '@/components/SentimentBar';
import { useScenarios } from '@/hooks/useScenarios';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const SCENARIO_LABELS: Record<string, string> = {
  A: 'Scenario A',
  B: 'Scenario B',
  C: 'Scenario C',
  D: 'Scenario D',
};

export default function ScenariosPage() {
  const { scenarios, loading, error } = useScenarios();
  const latest = scenarios.length > 0 ? scenarios[scenarios.length - 1] : null;
  const chartData = scenarios.map((s) => ({
    day: s.conflict_day,
    A: s.scenario_a,
    B: s.scenario_b,
    C: s.scenario_c,
    D: s.scenario_d,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        SCENARIO PROBABILITY TRACKER
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        EVOLUTION ACROSS CONFLICT DAYS
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
      {!loading && !error && latest && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
            {(['A', 'B', 'C', 'D'] as const).map((key) => (
              <OsintCard key={key}>
                <p className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>
                  {SCENARIO_LABELS[key]}
                </p>
                <p className="font-display text-2xl" style={{ color: 'var(--accent-gold)' }}>
                  {latest[`scenario_${key.toLowerCase()}` as keyof typeof latest]}%
                </p>
                <SentimentBar
                  value={(latest[`scenario_${key.toLowerCase()}` as keyof typeof latest] as number) / 100}
                  className="mt-2"
                />
              </OsintCard>
            ))}
          </div>
          <OsintCard className="scanlines">
            <h2 className="font-display text-lg mb-4">PROBABILITY OVER TIME</h2>
            {chartData.length === 0 ? (
              <p className="redacted">NO INTEL AVAILABLE</p>
            ) : (
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 2,
                      }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="A" stroke="var(--accent-green)" strokeWidth={2} dot={false} name="A" />
                    <Line type="monotone" dataKey="B" stroke="var(--accent-gold)" strokeWidth={2} dot={false} name="B" />
                    <Line type="monotone" dataKey="C" stroke="var(--accent-blue)" strokeWidth={2} dot={false} name="C" />
                    <Line type="monotone" dataKey="D" stroke="var(--accent-red)" strokeWidth={2} dot={false} name="D" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </OsintCard>
        </>
      )}
      {!loading && !error && !latest && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
    </div>
  );
}
