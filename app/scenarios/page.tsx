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

const SCENARIO_META: Record<string, { name: string; description: string }> = {
  A: {
    name: 'Negotiated Ceasefire',
    description: 'Oman-mediated framework produces a 30-day renewable halt. Iranian nuclear program placed under enhanced IAEA monitoring. Hormuz reopens under UN maritime guarantee. Probability declining as Iranian preconditions harden.',
  },
  B: {
    name: 'Controlled Escalation',
    description: 'Conflict expands to Lebanon ground phase and Houthi front but remains below nuclear threshold. Oil sustained above $130. G7 begins secondary sanctions on Iran. Probability rising as proxy fronts multiply.',
  },
  C: {
    name: 'Humanitarian/Economic Crisis',
    description: 'Red Sea closure and Suez disruption trigger global supply chain shock. Egypt enters IMF emergency program. Regional refugee displacement exceeds 2M. Western public pressure forces premature ceasefire without verification.',
  },
  D: {
    name: 'Regional War',
    description: 'Iranian ballistic missile kills >50 US personnel triggering full AUMF. Saudi Arabia and UAE drawn in militarily. Strait of Hormuz closed indefinitely. Global recession scenario with oil above $200.',
  },
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
                <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                  SCENARIO {key}
                </p>
                <p className="font-mono text-sm mb-2" style={{ color: 'var(--accent-gold)' }}>
                  &quot;{SCENARIO_META[key].name}&quot;
                </p>
                <p className="font-display text-2xl" style={{ color: 'var(--accent-gold)' }}>
                  {latest[`scenario_${key.toLowerCase()}` as keyof typeof latest]}%
                </p>
                <SentimentBar
                  value={(latest[`scenario_${key.toLowerCase()}` as keyof typeof latest] as number) / 100}
                  className="mt-2"
                />
                <p className="font-body text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {SCENARIO_META[key].description}
                </p>
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
