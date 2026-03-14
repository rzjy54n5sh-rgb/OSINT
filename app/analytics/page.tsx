'use client';

import { useState } from 'react';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { useNaiScoresAll } from '@/hooks/useNaiScoresAll';
import { useScenarios } from '@/hooks/useScenarios';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';

type AxisOption = 'conflict_day' | 'expressed_score' | 'latent_score' | 'gap_size' | 'scenario_a' | 'scenario_b' | 'scenario_c' | 'scenario_d';

const NAI_AXES: { value: AxisOption; label: string }[] = [
  { value: 'conflict_day', label: 'Conflict Day' },
  { value: 'expressed_score', label: 'NAI Expressed' },
  { value: 'latent_score', label: 'NAI Latent' },
  { value: 'gap_size', label: 'Gap Size' },
];

const SCENARIO_AXES = [
  { value: 'scenario_a', label: 'Scenario A' },
  { value: 'scenario_b', label: 'Scenario B' },
  { value: 'scenario_c', label: 'Scenario C' },
  { value: 'scenario_d', label: 'Scenario D' },
];

export default function AnalyticsPage() {
  const [xAxis, setXAxis] = useState<AxisOption>('conflict_day');
  const [yAxis, setYAxis] = useState<AxisOption>('expressed_score');
  const [chartType, setChartType] = useState<'scatter' | 'line'>('scatter');
  const { scores } = useNaiScoresAll();
  const { scenarios } = useScenarios();

  const dataSource = xAxis.startsWith('scenario') || yAxis.startsWith('scenario') ? 'scenarios' : 'nai';
  const scatterData =
    dataSource === 'nai'
      ? scores.map((s) => ({ x: s[xAxis as keyof typeof scores[0]], y: s[yAxis as keyof typeof scores[0]], name: s.country_code }))
      : scenarios.map((s) => ({ x: s[xAxis as keyof typeof scenarios[0]], y: s[yAxis as keyof typeof scenarios[0]], day: s.conflict_day }));

  const isConflictDayX = xAxis === 'conflict_day';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="MIX AND MATCH ANALYTICS"
        description="Build custom correlations across any combination of NAI dimensions and scenario probabilities. Designed for analysts who want to explore relationships in the data beyond the curated views on other pages."
        note="Correlation is not causation. This tool surfaces patterns for investigation — not conclusions. If you find a relationship that appears significant, cross-reference it with the raw data before drawing an inference."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        MIX & MATCH ANALYTICS
      </h1>
      <p className="font-mono text-xs mb-6" style={{ color: 'var(--text-muted)' }}>
        SELECT X / Y AXES — SCATTER OR LINE
      </p>
      <OsintCard className="mb-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono text-xs">
          <label>
            <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>X AXIS</span>
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value as AxisOption)}
              className="w-full bg-bg-primary border px-2 py-1.5 rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {NAI_AXES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {SCENARIO_AXES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>Y AXIS</span>
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value as AxisOption)}
              className="w-full bg-bg-primary border px-2 py-1.5 rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              {NAI_AXES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
              {SCENARIO_AXES.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </label>
          <label>
            <span className="block mb-1" style={{ color: 'var(--text-muted)' }}>CHART</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as 'scatter' | 'line')}
              className="w-full bg-bg-primary border px-2 py-1.5 rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            >
              <option value="scatter">Scatter</option>
              <option value="line">Line</option>
            </select>
          </label>
        </div>
      </OsintCard>
      <OsintCard className="scanlines">
        {scatterData.length === 0 ? (
          <p className="redacted py-12">NO INTEL AVAILABLE</p>
        ) : chartType === 'scatter' ? (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <XAxis
                  dataKey="x"
                  name={xAxis}
                  type={isConflictDayX ? 'number' : undefined}
                  domain={isConflictDayX ? [1, 10] : undefined}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                />
                <YAxis dataKey="y" name={yAxis} tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                  }}
                />
                <Scatter data={scatterData} fill="var(--accent-gold)" name="Data" />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={scatterData}>
                <XAxis
                  dataKey="x"
                  type={isConflictDayX ? 'number' : undefined}
                  domain={isConflictDayX ? [1, 10] : undefined}
                  tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                />
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: 'var(--bg-card)',
                    border: '1px solid var(--border)',
                    borderRadius: 2,
                  }}
                />
                <Line type="monotone" dataKey="y" stroke="var(--accent-gold)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </OsintCard>
    </div>
  );
}
