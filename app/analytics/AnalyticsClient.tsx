'use client';

import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ScatterChart,
  Scatter,
  AreaChart,
  Area,
} from 'recharts';
import { createClient } from '@/lib/supabase/client';

type ChartType = 'line' | 'bar' | 'radar' | 'scatter' | 'area';
type AxisOption = 'conflict_day' | 'date' | 'country' | 'region' | 'nai_score' | 'scenario_probability' | 'market_value' | 'social_engagement';

export function AnalyticsClient() {
  const [xAxis, setXAxis] = useState<AxisOption>('conflict_day');
  const [yAxis, setYAxis] = useState<AxisOption>('nai_score');
  const [chartType, setChartType] = useState<ChartType>('line');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setLoading(false);
      return;
    }
    const supabase = createClient();
    const run = async () => {
      try {
        const { data: d } = await supabase
          .from('nai_scores')
          .select('*')
          .order('conflict_day', { ascending: true })
          .limit(50);
        setData((d ?? []).map((r: { conflict_day: number }) => ({ ...r, name: `Day ${r.conflict_day}` })));
      } finally {
        setLoading(false);
      }
    };
    void run();
  }, [xAxis, yAxis]);

  if (loading) {
    return (
      <div className="mt-6 h-[400px] animate-pulse rounded-lg border border-[var(--border)] bg-bg-card" />
    );
  }

  const chartProps = {
    data: data.length ? data : [{ name: 'No data', value: 0 }],
    margin: { top: 20, right: 20, bottom: 20, left: 20 },
  };

  return (
    <div className="mt-6 flex flex-col gap-6 lg:flex-row">
      <div className="w-full rounded-lg border border-[var(--border)] bg-bg-card p-4 lg:w-72">
        <h3 className="font-heading text-sm font-semibold text-text-primary">Variables</h3>
        <div className="mt-3 space-y-3">
          <label className="block">
            <span className="osint-label text-text-muted">X axis</span>
            <select
              value={xAxis}
              onChange={(e) => setXAxis(e.target.value as AxisOption)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-bg-secondary px-2 py-1.5 font-mono text-xs text-text-primary"
            >
              <option value="conflict_day">conflict_day</option>
              <option value="date">date</option>
              <option value="country">country</option>
              <option value="region">region</option>
            </select>
          </label>
          <label className="block">
            <span className="osint-label text-text-muted">Y axis</span>
            <select
              value={yAxis}
              onChange={(e) => setYAxis(e.target.value as AxisOption)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-bg-secondary px-2 py-1.5 font-mono text-xs text-text-primary"
            >
              <option value="nai_score">nai_score</option>
              <option value="scenario_probability">scenario_probability</option>
              <option value="market_value">market_value</option>
              <option value="social_engagement">social_engagement</option>
            </select>
          </label>
          <label className="block">
            <span className="osint-label text-text-muted">Chart type</span>
            <select
              value={chartType}
              onChange={(e) => setChartType(e.target.value as ChartType)}
              className="mt-1 w-full rounded border border-[var(--border)] bg-bg-secondary px-2 py-1.5 font-mono text-xs text-text-primary"
            >
              <option value="line">Line</option>
              <option value="bar">Bar</option>
              <option value="area">Area</option>
              <option value="radar">Radar</option>
              <option value="scatter">Scatter</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={() => window.print()}
          className="mt-4 w-full rounded border border-[var(--border)] bg-bg-elevated py-2 font-mono text-xs uppercase text-text-secondary hover:text-accent-gold"
        >
          Export PNG
        </button>
      </div>
      <div className="min-h-[400px] flex-1 rounded-lg border border-[var(--border)] bg-bg-card p-4">
        <div className="h-[400px]">
          {data.length === 0 ? (
            <div className="flex h-full items-center justify-center font-mono text-sm uppercase tracking-wider text-text-muted">
              Awaiting data feed...
            </div>
          ) : chartType === 'line' ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                <Line type="monotone" dataKey="expressed_score" stroke="var(--accent-gold)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          ) : chartType === 'bar' ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                <Bar dataKey="expressed_score" fill="var(--accent-gold)" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : chartType === 'area' ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                <Area type="monotone" dataKey="expressed_score" stroke="var(--accent-gold)" fill="var(--accent-gold)" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          ) : chartType === 'radar' ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={data.slice(0, 5)}>
                <PolarGrid stroke="var(--border)" />
                <PolarAngleAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <PolarRadiusAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                <Radar name="Score" dataKey="expressed_score" stroke="var(--accent-gold)" fill="var(--accent-gold)" fillOpacity={0.3} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart {...chartProps}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="conflict_day" stroke="var(--text-muted)" fontSize={10} />
                <YAxis stroke="var(--text-muted)" fontSize={10} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)' }} />
                <Scatter name="Points" data={data} fill="var(--accent-gold)" />
              </ScatterChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
