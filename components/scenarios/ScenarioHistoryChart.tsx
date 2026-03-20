'use client';

import { useCallback, useState } from 'react';
import type { TooltipProps } from 'recharts';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

export interface ScenarioDay {
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
}

interface Props {
  data: ScenarioDay[];
}

const LINES = [
  { key: 'scenario_a' as const, label: 'A: Ceasefire', color: '#1A7A4A' },
  { key: 'scenario_b' as const, label: 'B: Prolonged', color: '#D97706' },
  { key: 'scenario_c' as const, label: 'C: Cascade', color: '#C0392B' },
  { key: 'scenario_d' as const, label: 'D: Escalation', color: '#6B21A8' },
];

const LEAD_NAMES: Record<string, string> = {
  scenario_a: 'Scenario A (Managed Exit / Ceasefire)',
  scenario_b: 'Scenario B (Prolonged War)',
  scenario_c: 'Scenario C (Cascade / Dual Closure)',
  scenario_d: 'Scenario D (Escalation Spiral)',
};

const DEFAULT_SITE = 'https://mena-intel-desk.mores-cohorts9x.workers.dev';

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: '#0D1B2A',
        border: '1px solid #1C3A5E',
        padding: '12px',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '12px',
      }}
    >
      <p style={{ color: '#E8C547', marginBottom: '8px' }}>DAY {label}</p>
      {payload.map((entry) => (
        <p key={String(entry.dataKey)} style={{ color: entry.color, margin: '2px 0' }}>
          {entry.name}: <strong>{entry.value}%</strong>
        </p>
      ))}
    </div>
  );
}

function normalizeRow(d: ScenarioDay): ScenarioDay {
  return {
    conflict_day: d.conflict_day,
    scenario_a: Math.round(Number(d.scenario_a)),
    scenario_b: Math.round(Number(d.scenario_b)),
    scenario_c: Math.round(Number(d.scenario_c)),
    scenario_d: Math.round(Number(d.scenario_d)),
  };
}

function buildDataShareText(last: ScenarioDay): string {
  const a = Math.round(Number(last.scenario_a));
  const b = Math.round(Number(last.scenario_b));
  const c = Math.round(Number(last.scenario_c));
  const d = Math.round(Number(last.scenario_d));
  const vals = [
    { key: 'scenario_a', v: a },
    { key: 'scenario_b', v: b },
    { key: 'scenario_c', v: c },
    { key: 'scenario_d', v: d },
  ];
  const lead = vals.reduce((x, y) => (y.v > x.v ? y : x));
  const leadLabel = LEAD_NAMES[lead.key] ?? lead.key;
  const site = process.env.NEXT_PUBLIC_SITE_URL || DEFAULT_SITE;
  return `Day ${last.conflict_day} | A:${a}% B:${b}% C:${c}% D:${d}% | ${leadLabel} leads\n   Source: MENA Intel Desk — ${site}`;
}

export function ScenarioHistoryChart({ data }: Props) {
  const [copied, setCopied] = useState<'link' | 'data' | null>(null);

  const rows = (data ?? []).map(normalizeRow).sort((x, y) => x.conflict_day - y.conflict_day);
  if (!rows.length) return null;

  const last = rows[rows.length - 1];
  const bDominantDay = rows.find((d) => d.scenario_b >= 40)?.conflict_day;

  const flash = useCallback((which: 'link' | 'data') => {
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2000);
  }, []);

  const copyChartLink = () => {
    const url = `${window.location.href.split('#')[0]}#scenario-history`;
    void navigator.clipboard.writeText(url).then(() => flash('link'));
  };

  const copyDayData = () => {
    void navigator.clipboard.writeText(buildDataShareText(last)).then(() => flash('data'));
  };

  return (
    <div id="scenario-history" className="w-full min-w-0">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="font-mono text-sm text-white/60 tracking-wider uppercase">
          SCENARIO EVOLUTION — DAYS 1 TO {last.conflict_day}
        </h3>
        <span className="font-mono text-xs text-white/30">A+B+C+D = 100% each day</span>
      </div>

      <div className="w-full overflow-x-auto min-w-0 -mx-1 px-1" style={{ WebkitOverflowScrolling: 'touch' }}>
        <div
          className="w-full min-w-[600px] sm:min-w-0 rounded-sm"
          style={{ background: 'var(--bg-card, #0D1B2A)' }}
        >
          <div className="w-full h-[320px] min-h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1C3A5E" />
                <XAxis
                  dataKey="conflict_day"
                  stroke="#6C7A8A"
                  tick={{ fill: '#6C7A8A', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  label={{
                    value: 'Conflict Day',
                    position: 'insideBottom',
                    offset: -2,
                    fill: '#6C7A8A',
                    fontSize: 11,
                  }}
                />
                <YAxis
                  stroke="#6C7A8A"
                  tick={{ fill: '#6C7A8A', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
                  tickFormatter={(v) => `${v}%`}
                  domain={[0, 60]}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend
                  wrapperStyle={{
                    fontFamily: 'IBM Plex Mono',
                    fontSize: '12px',
                    color: '#6C7A8A',
                  }}
                />

                {bDominantDay != null && (
                  <ReferenceLine
                    x={bDominantDay}
                    stroke="#D97706"
                    strokeDasharray="4 4"
                    label={{
                      value: 'B dominant',
                      fill: '#D97706',
                      fontSize: 10,
                      position: 'top',
                    }}
                  />
                )}

                {LINES.map(({ key, label, color }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={label}
                    stroke={color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 0 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mt-4 justify-center sm:justify-start">
        <button
          type="button"
          onClick={copyChartLink}
          className="font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            background: 'rgba(13, 27, 42, 0.6)',
          }}
        >
          {copied === 'link' ? 'Copied!' : 'Copy chart link'}
        </button>
        <button
          type="button"
          onClick={copyDayData}
          className="font-mono text-xs px-3 py-1.5 rounded-sm border transition-colors"
          style={{
            borderColor: 'var(--border)',
            color: 'var(--text-secondary)',
            background: 'rgba(13, 27, 42, 0.6)',
          }}
        >
          {copied === 'data' ? 'Copied!' : `Copy Day ${last.conflict_day} data`}
        </button>
      </div>

      <p className="font-mono text-xs text-white/20 mt-2 text-center sm:text-left">
        Probabilities reflect observable trigger conditions — not editorial positions. A includes Iran&apos;s stated
        ceasefire condition (closure of US regional bases).
      </p>
    </div>
  );
}
