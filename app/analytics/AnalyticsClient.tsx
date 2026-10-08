'use client';

import { useState } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { NAI_V2_SCALE_TEXT } from '@/lib/nai-v2';
import { ScatterChart, Scatter, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line } from 'recharts';

export interface PostureRow {
  country_code: string;
  conflict_day: number;
  expressed_score: number | null;
  /** Midpoint of the latent band; null when there is no admissible evidence or the tier is locked. */
  latent_mid: number | null;
  gap: number | null;
}
export type ScenarioDayRow = { conflict_day: number } & Record<string, number | null>;

type Props = {
  posture: PostureRow[];
  scenarioDays: ScenarioDayRow[];
  scenarioCodes: { code: string; name: string }[];
  scenarioMethod: string | null;
  latentAccess: boolean;
  gapAccess: boolean;
};

const POSTURE_AXES = [
  { value: 'conflict_day', label: 'Conflict Day' },
  { value: 'expressed_score', label: 'War Posture — Expressed' },
  { value: 'latent_mid', label: 'War Posture — Latent band midpoint' },
  { value: 'gap', label: 'War Posture — Gap' },
] as const;

export default function AnalyticsClient({ posture, scenarioDays, scenarioCodes, scenarioMethod, latentAccess, gapAccess }: Props) {
  const scenarioAxes = scenarioCodes.map((s) => ({ value: `scenario_${s.code.toLowerCase()}`, label: `Scenario ${s.code} — ${s.name}` }));
  const allAxes: { value: string; label: string }[] = [...POSTURE_AXES, ...scenarioAxes];
  const [xAxis, setXAxis] = useState<string>('conflict_day');
  const [yAxis, setYAxis] = useState<string>('expressed_score');
  const [chartType, setChartType] = useState<'scatter' | 'line'>('scatter');

  const isScenario = (a: string) => a.startsWith('scenario_');
  const isPostureOnly = (a: string) => a === 'expressed_score' || a === 'latent_mid' || a === 'gap';
  const mixed = (isScenario(xAxis) && isPostureOnly(yAxis)) || (isScenario(yAxis) && isPostureOnly(xAxis));
  const locked =
    ([xAxis, yAxis].includes('latent_mid') && !latentAccess) || ([xAxis, yAxis].includes('gap') && !gapAccess);

  const data: { x: number; y: number; label: string }[] = mixed || locked
    ? []
    : isScenario(xAxis) || isScenario(yAxis)
      ? scenarioDays
          .map((r) => ({ x: r[xAxis] as number | null, y: r[yAxis] as number | null, label: `Day ${r.conflict_day}` }))
          .filter((p): p is { x: number; y: number; label: string } => p.x !== null && p.y !== null)
      : posture
          .map((r) => ({
            x: r[xAxis as keyof PostureRow] as number | null,
            y: r[yAxis as keyof PostureRow] as number | null,
            label: `${r.country_code} · Day ${r.conflict_day}`,
          }))
          .filter((p): p is { x: number; y: number; label: string } => typeof p.x === 'number' && typeof p.y === 'number');

  const select = (value: string, onChange: (v: string) => void, label: string) => (
    <label>
      <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-bg-primary border px-2 py-2 rounded-sm"
        style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
      >
        {allAxes.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );

  const xIsDay = xAxis === 'conflict_day';
  const axisProps = { tick: { fill: '#8A9BB5', fontSize: 11 } };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="MIX AND MATCH ANALYTICS"
        description={`Plot War Posture (scale: ${NAI_V2_SCALE_TEXT}) and scenario probabilities against each other. Only current methods are plotted: War Posture from Day 221 and ${scenarioMethod ?? 'market-anchored'} scenario days.`}
        note="Days 1–35 used retired methods (a US-referenced alignment score and fixed desk scenario estimates) and are not comparable, so they are excluded. Correlation is not causation; with only a few days of data, patterns are indicative at best."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        MIX &amp; MATCH ANALYTICS
      </h1>
      <p className="font-mono text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        SELECT X / Y AXES — SCATTER OR LINE · {posture.length} WAR POSTURE ROWS · {scenarioDays.length} SCENARIO DAYS
      </p>
      <OsintCard className="mb-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-xs">
          {select(xAxis, setXAxis, 'X AXIS')}
          {select(yAxis, setYAxis, 'Y AXIS')}
          <label>
            <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>CHART</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as 'scatter' | 'line')}
              className="w-full bg-bg-primary border px-2 py-2 rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="scatter">Scatter</option>
              <option value="line">Line</option>
            </select>
          </label>
        </div>
      </OsintCard>
      <OsintCard className="scanlines">
        {mixed ? (
          <p className="font-mono text-xs py-12" style={{ color: 'var(--text-secondary)' }}>
            War Posture is per country and scenarios are per day, so they cannot be paired point by point. Plot scenarios
            against Conflict Day or another scenario.
          </p>
        ) : locked ? (
          <div className="py-12 flex flex-wrap items-center gap-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>The latent band and gap are available on the Informed tier.</span>
            <PaywallOverlay requiredTier="informed" featureName="War Posture latent band" compact />
          </div>
        ) : data.length === 0 ? (
          <p className="redacted py-12">NO INTEL AVAILABLE</p>
        ) : chartType === 'scatter' ? (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <XAxis dataKey="x" name={xAxis} type="number" domain={xIsDay ? ['dataMin', 'dataMax'] : ['auto', 'auto']} allowDecimals={!xIsDay} {...axisProps} />
                <YAxis dataKey="y" name={yAxis} type="number" domain={['auto', 'auto']} {...axisProps} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 2 }} />
                <Scatter data={data} fill="var(--accent-gold)" name="Data" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={[...data].sort((a, b) => a.x - b.x)}>
                <XAxis dataKey="x" type="number" domain={xIsDay ? ['dataMin', 'dataMax'] : ['auto', 'auto']} allowDecimals={!xIsDay} {...axisProps} />
                <YAxis {...axisProps} />
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 2 }} />
                <Line type="linear" dataKey="y" stroke="var(--accent-gold)" strokeWidth={2} dot isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </OsintCard>
    </div>
  );
}
