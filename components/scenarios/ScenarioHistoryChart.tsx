'use client';

import { useCallback, useState } from 'react';
import type { TooltipProps } from 'recharts';
import { ComposedChart, Line, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ScenarioChartRow } from '@/lib/scenario-registry';

export interface ChartSeries {
  code: string;
  name: string;
  color: string;
  /** Dashed line (independent scenario, outside the 100). */
  dashed?: boolean;
}

/** A shaded [low, high] band (rows carry `[low, high]` under `key`), e.g. B's Fréchet range. */
export interface ChartBand {
  key: string;
  name: string;
  color: string;
}

/** Chart rows: one method's points plus optional band values ([low, high] or null). */
export type ChartRow = ScenarioChartRow | ({ day: number } & Record<string, number | null | [number, number]>);

interface Props {
  /** ONE method only. Callers split history with seriesByMethod(); methods are never joined. */
  rows: ChartRow[];
  /** Optional range bands drawn under the lines. */
  bands?: ChartBand[];
  series: ChartSeries[];
  title: string;
  /** Method label shown under the title (e.g. "market-anchored-v1"). */
  methodLabel: string;
  note?: string;
  /** DOM id for the chart link. */
  anchorId: string;
  /** Share text for "Copy Day N data"; omitted for archived charts. */
  shareText?: string;
  height?: number;
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--line-strong)',
        padding: '12px',
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: '13px',
      }}
    >
      <p style={{ color: 'var(--text-primary)', marginBottom: '8px' }}>DAY {label}</p>
      {payload.map((entry) => {
        const v = entry.value as unknown;
        const text = Array.isArray(v)
          ? v[0] === v[1] ? `${v[0]}%` : `${v[0]}\u2013${v[1]}%`
          : v == null ? 'unmeasured' : `${v}%`;
        return (
          <p key={String(entry.dataKey)} style={{ color: entry.color, margin: '2px 0' }}>
            {entry.name}: <strong>{text}</strong>
          </p>
        );
      })}
    </div>
  );
}

async function copy(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function ScenarioHistoryChart({ rows, bands = [], series, title, methodLabel, note, anchorId, shareText, height = 300 }: Props) {
  const [status, setStatus] = useState<string | null>(null);
  const flash = useCallback((msg: string) => {
    setStatus(msg);
    window.setTimeout(() => setStatus(null), 2000);
  }, []);

  if (!rows.length) return null;
  const last = rows.at(-1)!;
  // A one-day series cannot draw a line: show dots so a single point is still visible.
  const showDots = rows.length < 4;

  return (
    <div id={anchorId} className="w-full min-w-0">
      <div className="flex items-start justify-between mb-2 flex-wrap gap-2">
        <div>
          <h2 className="font-mono text-sm tracking-wider uppercase" style={{ color: 'var(--text-secondary)' }}>
            {title}
          </h2>
          <p className="font-mono text-[13px]" style={{ color: 'var(--text-muted)' }} translate="no">
            METHOD {methodLabel}
          </p>
        </div>
      </div>

      <div className="w-full rounded-sm" style={{ background: 'var(--bg-card)', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
            <XAxis
              dataKey="day"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              stroke="var(--line-strong)"
              tick={{ fill: 'var(--muted)', fontSize: 12, fontFamily: 'var(--font-numeric)' }}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              stroke="var(--line-strong)"
              tick={{ fill: 'var(--muted)', fontSize: 12, fontFamily: 'var(--font-numeric)' }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              width={44}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: 'IBM Plex Mono', fontSize: '13px', color: 'var(--text-secondary)' }} />
            {bands.map((b) => (
              <Area
                key={b.key}
                type="linear"
                dataKey={b.key}
                name={b.name}
                stroke={b.color}
                strokeWidth={1}
                strokeDasharray="2 2"
                fill={b.color}
                fillOpacity={0.18}
                connectNulls={false}
                isAnimationActive={false}
                dot={false}
                activeDot={false}
              />
            ))}
            {series.map((s) => (
              <Line
                key={s.code}
                type="linear"
                dataKey={s.code}
                name={`${s.code}: ${s.name}`}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? '4 3' : undefined}
                dot={showDots ? { r: 3 } : false}
                activeDot={{ r: 4, strokeWidth: 0 }}
                connectNulls={false}
                isAnimationActive={false}
              />
            ))}
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {note && (
        <p className="font-mono text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {note}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mt-3">
        <button
          type="button"
          onClick={async () => {
            const url = `${window.location.href.split('#')[0]}#${anchorId}`;
            flash((await copy(url)) ? 'Link copied' : 'Copy failed — clipboard blocked');
          }}
          className="font-mono text-xs px-3 py-2 rounded-sm border min-h-[40px]"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Copy chart link
        </button>
        {shareText && (
          <button
            type="button"
            onClick={async () => flash((await copy(shareText)) ? 'Data copied' : 'Copy failed — clipboard blocked')}
            className="font-mono text-xs px-3 py-2 rounded-sm border min-h-[40px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Copy Day {last.day} data
          </button>
        )}
        <span role="status" aria-live="polite" className="font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>
          {status ?? ''}
        </span>
      </div>
    </div>
  );
}
