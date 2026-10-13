'use client';

import { Area, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

export interface HomeScenarioRow {
  day: number;
  A: number | null;
  B: number | null;
  B_range: [number, number] | null;
  C: number | null;
  D: number | null;
  E: number | null;
}

/** Home "Scenario probability" chart (moved out of HomeDashboard so recharts is its own lazy chunk). */
export function HomeScenarioChart({
  data: scenarioChartData,
  bAsRange,
  hasMeasuredE,
}: {
  data: HomeScenarioRow[];
  bAsRange: boolean;
  hasMeasuredE: boolean;
}) {
  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={scenarioChartData}>
          <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
          <Tooltip
            contentStyle={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 2,
            }}
            labelStyle={{ color: 'var(--text-secondary)' }}
            formatter={(v: unknown) =>
              Array.isArray(v) ? (v[0] === v[1] ? `${v[0]}%` : `${v[0]}\u2013${v[1]}%`) : v == null ? 'unmeasured' : `${v}%`
            }
          />
          <Legend />
          <Line type="monotone" dataKey="A" stroke="var(--accent-green)" strokeWidth={1.5} dot={false} name="A" />
          {bAsRange ? (
            <Area type="linear" dataKey="B_range" stroke="var(--accent-gold)" strokeWidth={1} strokeDasharray="2 2"
                  fill="var(--accent-gold)" fillOpacity={0.18} dot={false} activeDot={false} name="B (range)"
                  isAnimationActive={false} connectNulls={false} />
          ) : (
            <Line type="monotone" dataKey="B" stroke="var(--accent-gold)" strokeWidth={1.5} dot={false} name="B" />
          )}
          <Line type="monotone" dataKey="C" stroke="var(--accent-blue)" strokeWidth={1.5} dot={false} name="C" />
          <Line type="monotone" dataKey="D" stroke="var(--accent-red)" strokeWidth={1.5} dot={false} name="D" />
          {hasMeasuredE && (
            <Line type="monotone" dataKey="E" stroke="#a855f7" strokeWidth={1.5} dot={false} name="E" strokeDasharray="4 2" connectNulls={false} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
