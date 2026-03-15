'use client';

import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { SentimentBar } from '@/components/SentimentBar';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PageShareCard } from '@/components/PageShareCard';
import { PageShareButton, buildScenariosShareText } from '@/components/PageShareButton';
import { useScenarios } from '@/hooks/useScenarios';
import { useConflictDay } from '@/hooks/useConflictDay';
import { GLOSSARY } from '@/lib/glossary';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const SCENARIO_META: Record<string, { name: string; description: string; color: string }> = {
  A: {
    name: 'Managed Exit',
    color: 'var(--accent-green)',
    description:
      'Ceasefire within 2 weeks via: (a) Xi-Trump framework, OR (b) Iran-Oman back-channel — Iran\'s stated condition: closure/drawdown of US regional bases, OR (c) Gulf SWF $100B+ investment pressure on Trump. Probability declining after Kharg Island strike hardened both sides.',
  },
  B: {
    name: 'Prolonged War',
    color: 'var(--accent-gold)',
    description:
      'Conflict continues 4+ weeks without diplomatic breakthrough. No Xi-Trump summit outcome. Iran retaliates for Kharg within acceptable bounds. Most likely scenario. Egypt pound through 55/USD. US inflation rising toward 3%.',
  },
  C: {
    name: 'Cascade / Dual Closure',
    color: 'var(--accent-blue)',
    description:
      'Hormuz closure combines with Houthi Red Sea resumption. Near-total halt of regional maritime trade. Egypt enters IMF emergency program. Morgan Stanley $2.4B energy deficit for Egypt. Global food security crisis activates.',
  },
  D: {
    name: 'Escalation Spiral',
    color: 'var(--accent-red)',
    description:
      'Iran retaliates for Kharg by striking Gulf oil infrastructure (Aramco/ADNOC) → Trump executes threat to destroy Kharg oil terminals → JPMorgan $150/bbl scenario → US domestic inflation crisis → political pressure ends war faster than diplomacy.',
  },
  E: {
    name: 'UAE Direct Strike',
    color: '#a855f7',
    description:
      'UAE hits Iranian missile sites directly — unprecedented military escalation. Axios (2 sources, March 3): UAE "considering active defensive measures." Australia evacuation advisory and DIFC emptying signal rising pressure. Can overlap with Scenario D. Sub-branch probability, independent of A+B+C+D sum.',
  },
};

export default function ScenariosPage() {
  const { scenarios, loading, error } = useScenarios();
  const conflictDay = useConflictDay();
  const latest = scenarios.length > 0 ? scenarios[scenarios.length - 1] : null;
  const chartData = scenarios.map((s) => ({
    day: s.conflict_day,
    A: s.scenario_a,
    B: s.scenario_b,
    C: s.scenario_c,
    D: s.scenario_d,
    E: s.scenario_e ?? 0,
  }));

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="CONFLICT SCENARIO PROBABILITY TRACKER"
        description="Five conflict scenarios are tracked daily. Scenarios A through D sum to 100%. Scenario E (UAE Direct Strike) is an independent sub-branch probability that can overlap with others. Scenarios are updated daily based on observable trigger conditions — not predictions."
        note="Probabilities reflect observable trigger conditions from all parties' actions — not editorial positions. Scenario A includes Iran's stated ceasefire condition (closure/drawdown of US regional military bases) as a required pathway, not only a US-China diplomatic resolution. All parties' official framings are presented alongside independent analysis."
      />
      <div className="flex flex-wrap items-center gap-4 mb-8">
        <h1 className="font-display text-3xl mb-0" style={{ color: 'var(--text-primary)' }}>
          SCENARIO PROBABILITY TRACKER
        </h1>
        {latest && (
          <PageShareButton
            label="SHARE"
            getCopyText={() =>
              buildScenariosShareText(
                latest.scenario_a,
                latest.scenario_b,
                latest.scenario_c,
                latest.scenario_d,
                latest.conflict_day
              )
            }
          />
        )}
      </div>
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
                <GlossaryTooltip term={`SCENARIO_${key}`} definition={GLOSSARY[`SCENARIO_${key}` as keyof typeof GLOSSARY]}>
                  <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span translate="no">Scenario {key}</span>
                  </p>
                </GlossaryTooltip>
                <p className="font-mono text-sm mb-2" style={{ color: SCENARIO_META[key].color }}>
                  &quot;{SCENARIO_META[key].name}&quot;
                </p>
                <p className="font-display text-2xl" style={{ color: SCENARIO_META[key].color }} translate="no">
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
            {latest.scenario_e != null && (
              <OsintCard key="E" className="border-purple-800/40">
                <GlossaryTooltip term="SCENARIO_E" definition={GLOSSARY.SCENARIO_E}>
                  <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
                    <span translate="no">Scenario E — NEW</span>
                  </p>
                </GlossaryTooltip>
                <p className="font-mono text-sm mb-2" style={{ color: '#a855f7' }}>
                  &quot;{SCENARIO_META.E.name}&quot;
                </p>
                <p className="font-display text-2xl" style={{ color: '#a855f7' }} translate="no">
                  {latest.scenario_e}%
                </p>
                <SentimentBar value={latest.scenario_e / 100} className="mt-2" />
                <p className="font-body text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  {SCENARIO_META.E.description}
                </p>
                <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                  Sub-branch — independent of A+B+C+D sum
                </p>
              </OsintCard>
            )}
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
                    <Line type="monotone" dataKey="E" stroke="#a855f7" strokeWidth={2} dot={false} name="E" strokeDasharray="4 2" />
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
