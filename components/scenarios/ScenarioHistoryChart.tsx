'use client';

import { useCallback, useState } from 'react';
import type { TooltipProps } from 'recharts';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { ScenarioChartRow } from '@/lib/scenario-registry';

export interface ChartSeries {
  code: string;
  name: string;
  color: string;
  /** Dashed line (independent scenario, outside the 100). */
  dashed?: boolean;
}

interface Props {
  /** ONE method only. Callers split history with seriesByMethod(); methods are never joined. */
  rows: ScenarioChartRow[];
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
          {entry.name}: <strong>{entry.value == null ? 'unmeasured' : `${entry.value}%`}</strong>
        </p>
      ))}
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

export function ScenarioHistoryChart({ rows, series, title, methodLabel, note, anchorId, shareText, height = 300 }: Props) {
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
          <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }} translate="no">
            METHOD {methodLabel}
          </p>
        </div>
      </div>

      <div className="w-full rounded-sm" style={{ background: 'var(--bg-card, #0D1B2A)', height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1C3A5E" />
            <XAxis
              dataKey="day"
              type="number"
              domain={['dataMin', 'dataMax']}
              allowDecimals={false}
              stroke="#8A9BB5"
              tick={{ fill: '#8A9BB5', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
              padding={{ left: 12, right: 12 }}
            />
            <YAxis
              stroke="#8A9BB5"
              tick={{ fill: '#8A9BB5', fontSize: 11, fontFamily: 'IBM Plex Mono' }}
              tickFormatter={(v) => `${v}%`}
              domain={[0, 100]}
              width={44}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontFamily: 'IBM Plex Mono', fontSize: '12px', color: '#B8C4D0' }} />
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
          </LineChart>
        </ResponsiveContainer>
      </div>

      {note && (
        <p className="font-mono text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
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
