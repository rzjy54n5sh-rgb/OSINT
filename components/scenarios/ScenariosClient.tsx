'use client';

import type { ReactNode } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { SentimentBar } from '@/components/SentimentBar';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { PageShareButton, buildScenariosShareText } from '@/components/PageShareButton';
import { ScenarioHistoryChart, type ScenarioDay } from '@/components/scenarios/ScenarioHistoryChart';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { useScenarios } from '@/hooks/useScenarios';
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
      'Further context: Axios (2 sources, March 3) reported UAE "considering active defensive measures." Australia evacuation advisory and DIFC emptying signal rising pressure. Can overlap with Scenario D.',
  },
};

type ScenariosClientProps = {
  hasDetailAccess: boolean;
  /** Server-rendered conflict day strip (placed after page &lt;h1&gt;). */
  conflictDayBadge?: ReactNode;
  /** Full A–D history for shareable trend chart (server-fetched). */
  scenarioHistory: ScenarioDay[];
};

function scenarioEValue(row: { scenario_e?: number | null } | null): number | null {
  if (!row) return null;
  const v = row.scenario_e;
  return typeof v === 'number' && !Number.isNaN(v) ? v : null;
}

export function ScenariosClient({ hasDetailAccess, conflictDayBadge, scenarioHistory }: ScenariosClientProps) {
  const { scenarios, loading, error } = useScenarios();
  const latest = scenarios.length > 0 ? scenarios[scenarios.length - 1] : null;
  const latestScenarioE = latest ? scenarioEValue(latest) : null;
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
      {conflictDayBadge}
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
                    <span translate="no">SCENARIO {key}</span>
                  </p>
                </GlossaryTooltip>
                <p className="font-mono text-sm mb-2" style={{ color: SCENARIO_META[key].color }}>
                  &quot;{SCENARIO_META[key].name}&quot;
                </p>
                <p className="font-display text-2xl" style={{ color: SCENARIO_META[key].color }}>
                  <span translate="no">
                    {latest[`scenario_${key.toLowerCase()}` as keyof typeof latest]}%
                  </span>
                </p>
                <SentimentBar
                  value={(latest[`scenario_${key.toLowerCase()}` as keyof typeof latest] as number) / 100}
                  className="mt-2"
                />
                {hasDetailAccess && (
                  <p className="font-body text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {SCENARIO_META[key].description}
                  </p>
                )}
              </OsintCard>
            ))}
            {/* Scenario E: full-width mobile, half row on md+ (cols 2–3), dashed — not part of A–D sum */}
            <div className="col-span-2 md:col-span-2 md:col-start-2 w-full min-w-0">
              <OsintCard
                className="border-2 border-dashed border-purple-500/50 h-full"
                style={{
                  background: 'color-mix(in srgb, var(--bg-card) 50%, transparent)',
                }}
              >
                <GlossaryTooltip term="SCENARIO_E" definition={GLOSSARY.SCENARIO_E}>
                  <p className="font-mono text-xs uppercase mb-0.5" style={{ color: 'var(--text-muted)' }} translate="no">
                    SCENARIO E
                  </p>
                  <p className="font-mono text-sm mb-2" style={{ color: '#a855f7' }} translate="no">
                    UAE Direct Strike
                  </p>
                </GlossaryTooltip>
                <p className="font-display text-2xl mb-1" style={{ color: '#a855f7' }}>
                  <span translate="no">
                    {latestScenarioE != null ? `${latestScenarioE}%` : '—'}
                  </span>
                </p>
                {latestScenarioE == null && (
                  <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                    Sub-branch
                  </p>
                )}
                {latestScenarioE != null && <SentimentBar value={latestScenarioE / 100} className="mt-2 mb-2" />}
                <p className="font-body text-xs leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
                  UAE conducts direct military strike on Iranian missile sites. Independent sub-branch — can overlap with
                  Scenarios A through D. Probability reflects UAE&apos;s declared red lines being crossed.
                </p>
                {hasDetailAccess && (
                  <p className="font-body text-xs mt-1 leading-relaxed border-t pt-2" style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                    {SCENARIO_META.E.description}
                  </p>
                )}
                <p className="font-mono text-[10px] mt-3 tracking-wide" style={{ color: 'var(--accent-gold)' }} translate="no">
                  ◆ Independent sub-branch · Not included in A–D sum
                </p>
              </OsintCard>
            </div>
          </div>

          {scenarioHistory.length > 0 && (
            <div className="my-8 border-t border-white/10 pt-8">
              <ScenarioHistoryChart data={scenarioHistory} />
            </div>
          )}

          <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
            EVOLUTION ACROSS CONFLICT DAYS
          </p>

          {hasDetailAccess ? (
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
          ) : (
            <div
              className="font-mono text-sm py-4 px-4 rounded-sm border flex flex-wrap items-center justify-between gap-2"
              style={{
                background: 'rgba(232, 197, 71, 0.05)',
                borderColor: '#E8C547',
                color: '#E2E8F0',
              }}
            >
              <span>
                <span style={{ color: '#E8C547' }}>◆</span> Scenario analysis, trigger conditions and 14-day history
              </span>
              <PaywallOverlay requiredTier="informed" featureName="Scenario Analysis" compact />
            </div>
          )}
        </>
      )}
      {!loading && !error && !latest && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
    </div>
  );
}
