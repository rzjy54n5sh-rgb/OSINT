'use client';

import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import type { MarketData } from '@/types/supabase';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { maxConflictDay } from '@/lib/conflict-calendar';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

type MarketRow = MarketData & { is_retrospective?: boolean | null };

interface MarketsClientProps {
  /** Rows NEWEST FIRST by created_at (see page.tsx). */
  initialData: MarketRow[];
  /** Calendar day (DAY LOCK). */
  currentDay: number;
}

/** Written by collect-markets.yml (cron every 30 min). CLAUDE.md "market_data writers". */
const COLLECTOR_INDICATORS = new Set([
  'Brent Crude Oil',
  'WTI Crude Oil',
  'Gold',
  'Natural Gas',
  'S&P 500',
  'Dow Jones',
  'Energy ETF (XLE)',
  'Oil ETF (USO)',
  'VIX (Fear Index)',
  'EUR/USD',
  'USD/SAR',
  'USD/AED',
  'USD/IQD',
]);
const COLLECTOR_LIST = Array.from(COLLECTOR_INDICATORS).join(', ');

/** Rows from the 2026-10 daily-close backfill (backfill_market_closes.py tags its source). */
function isReconstructed(r: MarketRow): boolean {
  return r.is_retrospective === true || /reconstructed backfill|daily close/i.test(r.source ?? '');
}

function fmtUtc(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

interface IndicatorView {
  indicator: string;
  latest: MarketRow;
  /** One point per conflict_day (newest row of that day), SAME UNIT as the latest row only, ascending. */
  series: { day: number; value: number; reconstructed: boolean }[];
  /** Earlier rows in other units — never joined to the series. */
  otherUnits: { unit: string; count: number; firstDay: number; lastDay: number }[];
  cadence: string;
}

function buildViews(rows: MarketRow[]): IndicatorView[] {
  const byIndicator = new Map<string, MarketRow[]>();
  for (const r of rows) {
    const k = r.indicator ?? 'OTHER';
    const list = byIndicator.get(k) ?? [];
    list.push(r);
    byIndicator.set(k, list);
  }
  const views: IndicatorView[] = [];
  for (const [indicator, list] of byIndicator) {
    const latest = list[0]!; // newest created_at
    const unit = latest.unit ?? '';
    const perDay = new Map<number, { day: number; value: number; reconstructed: boolean }>();
    const other = new Map<string, { unit: string; count: number; firstDay: number; lastDay: number }>();
    for (const r of list) {
      if (r.conflict_day == null || r.value == null) continue;
      if ((r.unit ?? '') !== unit) {
        const u = r.unit ?? '(no unit)';
        const o = other.get(u) ?? { unit: u, count: 0, firstDay: r.conflict_day, lastDay: r.conflict_day };
        o.count += 1;
        o.firstDay = Math.min(o.firstDay, r.conflict_day);
        o.lastDay = Math.max(o.lastDay, r.conflict_day);
        other.set(u, o);
        continue;
      }
      if (!perDay.has(r.conflict_day)) {
        perDay.set(r.conflict_day, { day: r.conflict_day, value: Number(r.value), reconstructed: isReconstructed(r) });
      }
    }
    const series = Array.from(perDay.values()).sort((a, b) => a.day - b.day);
    const lastDay = latest.conflict_day ?? 0;
    const cadence = COLLECTOR_INDICATORS.has(indicator)
      ? 'Collector · scheduled every 30 min'
      : lastDay <= 35
        ? `Archived series · no longer collected (last Day ${lastDay})`
        : 'Daily build · once a day, from the cited source';
    views.push({ indicator, latest, series, otherUnits: Array.from(other.values()), cadence });
  }
  return views.sort((a, b) => a.indicator.localeCompare(b.indicator));
}

export default function MarketsClient({ initialData, currentDay }: MarketsClientProps) {
  const data = initialData;
  const marketDay = maxConflictDay(data);
  const views = buildViews(data);
  const current = views.filter((v) => (v.latest.conflict_day ?? 0) > 35);
  const archived = views.filter((v) => (v.latest.conflict_day ?? 0) <= 35);

  const card = (v: IndicatorView) => {
    const { latest } = v;
    const unit = latest.unit ?? '';
    const recon = v.series.filter((p) => p.reconstructed).length;
    const showDots = v.series.length < 6;
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
            {isReconstructed(latest) ? ' · RECONSTRUCTED' : ''}
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
              <LineChart data={v.series}>
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
      {data.length > 0 && <DataAsOf section="MARKETS" latestDay={marketDay} currentDay={currentDay} className="-mt-4 mb-8" />}
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
