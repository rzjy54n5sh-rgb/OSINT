'use client';

import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { COLLECTOR_INDICATORS, type IndicatorView } from './market-views';

const COLLECTOR_LIST = COLLECTOR_INDICATORS.join(', ');

interface MarketsClientProps {
  /** Compact per-indicator views built on the server (see market-views.ts). */
  views: IndicatorView[];
  /** Latest conflict_day present in market_data. */
  marketDay: number | null;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
}

function fmtUtc(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export default function MarketsClient({ views, marketDay, currentDay }: MarketsClientProps) {
  const current = views.filter((v) => !v.archived);
  const archived = views.filter((v) => v.archived);

  const card = (v: IndicatorView) => {
    const { latest } = v;
    const unit = latest.unit;
    const series = v.series.map(([day, value, r]) => ({ day, value, reconstructed: r === 1 }));
    const recon = series.filter((p) => p.reconstructed).length;
    const showDots = series.length < 6;
    return (
      <OsintCard key={v.indicator}>
        <article data-testid={`market-${v.indicator}`}>
          <h2 className="font-display text-lg mb-1" style={{ color: 'var(--text-primary)' }}>
            {v.indicator}
          </h2>
          <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-muted)' }} data-testid="market-unit">
            UNIT: {unit || '—'}
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
            <span translate="no" data-testid="market-value">
              VALUE: {latest.value ?? '—'}
            </span>
            <span
              style={{ color: latest.conflict_day === currentDay ? 'var(--text-muted)' : 'var(--accent-orange)' }}
              translate="no"
            >
              DAY {latest.conflict_day ?? '—'}
              {latest.conflict_day !== currentDay ? ` · NO DATA FOR DAY ${currentDay}` : ''}
            </span>
            {latest.change_pct != null && (
              <span style={{ color: latest.change_pct >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }} translate="no">
                {latest.change_pct >= 0 ? '+' : ''}
                {latest.change_pct}%
              </span>
            )}
          </div>
          <p className="font-mono text-[11px] mb-2" style={{ color: 'var(--text-muted)' }} translate="no">
            COLLECTED {fmtUtc(latest.created_at)} · {v.cadence}
            {latest.reconstructed ? ' · RECONSTRUCTED' : ''}
          </p>
          {latest.source && (
            <details className="mb-3">
              <summary className="font-mono text-[11px] cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
                SOURCE: {latest.source.length > 70 ? `${latest.source.slice(0, 70)}…` : latest.source}
              </summary>
              <p className="font-body text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {latest.source}
              </p>
            </details>
          )}
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={series}>
                <XAxis
                  dataKey="day"
                  type="number"
                  domain={['dataMin', 'dataMax']}
                  allowDecimals={false}
                  padding={{ left: 8, right: 8 }}
                  tick={{ fill: '#8A9BB5', fontSize: 11 }}
                />
                <YAxis tick={{ fill: '#8A9BB5', fontSize: 11 }} domain={['auto', 'auto']} width={56} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 2 }}
                  labelFormatter={(d) => `Day ${d}`}
                  formatter={(val, _n, item) => [
                    `${val} ${unit}${(item?.payload as { reconstructed?: boolean })?.reconstructed ? ' (reconstructed daily close)' : ''}`,
                    v.indicator,
                  ]}
                />
                <Line
                  type="linear"
                  dataKey="value"
                  stroke="var(--accent-gold)"
                  strokeWidth={1.5}
                  dot={showDots ? { r: 3 } : false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="font-mono text-[11px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            Chart: {v.series.length} day{v.series.length === 1 ? '' : 's'} in this unit only (one point per day, latest
            collection of the day).
            {recon > 0 ? ` ${recon} point${recon === 1 ? ' is a' : 's are'} reconstructed daily close${recon === 1 ? '' : 's'} (backfill 2026-10).` : ''}
            {v.otherUnits.length > 0 &&
              ` Not plotted — earlier rows in other units: ${v.otherUnits
                .map((o) => `"${o.unit}" (${o.count} row${o.count === 1 ? '' : 's'}, Day ${o.firstDay === o.lastDay ? o.firstDay : `${o.firstDay}–${o.lastDay}`})`)
                .join('; ')}.`}
          </p>
        </article>
      </OsintCard>
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="ECONOMIC INTELLIGENCE"
        description="Conflict-sensitive market and shipping indicators. Each card shows the latest stored value with its unit, the time it was collected and its source, and a trend chart that only joins rows in the same unit."
        note={`This is not financial advice. Collector indicators (${COLLECTOR_LIST}) are scheduled every 30 minutes via GitHub Actions; scheduled runs can be delayed or skipped, and closed days keep only the newest row per indicator. USD/EGP, the open-market USD/IRR rate, Hormuz and Bab al-Mandeb traffic and the war-risk premium are written once a day by the daily build from the source quoted on each card. Rows marked reconstructed come from the October 2026 daily-close backfill.`}
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        ECONOMIC INTELLIGENCE
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        KEY INDICATORS — LATEST VALUE AND TREND BY CONFLICT DAY
      </p>
      {views.length > 0 && <DataAsOf section="MARKETS" latestDay={marketDay} currentDay={currentDay} className="-mt-4 mb-8" />}
      {views.length === 0 && <p className="redacted py-12">NO INTEL AVAILABLE</p>}
      {current.length > 0 && <div className="grid md:grid-cols-2 gap-6">{current.map(card)}</div>}
      {archived.length > 0 && (
        <details className="mt-10">
          <summary className="font-mono text-xs cursor-pointer py-2" style={{ color: 'var(--text-secondary)' }}>
            ARCHIVED INDICATORS — no longer collected ({archived.length})
          </summary>
          <div className="grid md:grid-cols-2 gap-6 mt-4">{archived.map(card)}</div>
        </details>
      )}
    </div>
  );
}
