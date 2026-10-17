'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { SentimentBar } from '@/components/SentimentBar';
import { PageShareButton } from '@/components/PageShareButton';
import { ScenarioHistoryChart, type ChartRow, type ChartSeries } from '@/components/scenarios/ScenarioHistoryChart';
import { ScenarioMethodPanel } from '@/components/scenarios/ScenarioMethodPanel';
import {
  CURRENT_SCENARIO_METHOD,
  LEGACY_SCENARIO_METHOD,
  LEGACY_SERIES_MARKER,
  RESIDUAL_SCENARIO_CODE,
  deltaWithinMethod,
  formatScenarioDelta,
  isResidual,
  probabilityOn,
  residualComponentCodes,
  residualRange30,
  residualRangeFromRow,
  residualRangeOn,
  scenarioColor,
  scenarioDisplay,
  seriesByMethod,
  thirtyDayReadings,
  unmeasuredHeadline,
  unmeasuredReason,
  type RegistryScenario,
  type ScenarioRegistryView,
  type ThirtyDayReading,
} from '@/lib/scenario-registry';
import { formatRange } from '@/lib/scenario-range';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mena-intel-desk.mores-cohorts9x.workers.dev';

type ScenariosClientProps = {
  hasDetailAccess: boolean;
  registry: ScenarioRegistryView;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
  /** Server-rendered conflict day strip (placed after page <h1>). */
  conflictDayBadge?: ReactNode;
};

function ScenarioCard({
  s,
  registry,
  index,
  readings,
}: {
  s: RegistryScenario;
  registry: ScenarioRegistryView;
  index: number;
  readings: Record<string, ThirtyDayReading>;
}) {
  const day = registry.latestDay;
  const p = probabilityOn(registry.history, s.code, day);
  const color = scenarioColor(s.code, index);
  const independent = s.group_code !== 'core';
  const residual = isResidual(s.code);
  const range = residual ? residualRangeOn(registry, day) : null;
  const unmeasured = p === null || s.measurement_state === 'unmeasured' || (residual && range === null);
  const reason = unmeasured ? unmeasuredReason(registry, s, day) : null;
  const delta = residual ? null : deltaWithinMethod(registry.history, s.code, day);
  const r30 = readings[s.code] ?? null;
  const range30 = residual ? residualRange30(registry.scenarios, readings) : null;
  const components = residualComponentCodes(registry.scenarios);

  return (
    <OsintCard
      className={independent ? 'border-2 border-dashed h-full' : 'h-full'}
      style={independent ? { borderColor: `color-mix(in srgb, ${color} 50%, transparent)` } : undefined}
    >
      <article data-testid={`scenario-card-${s.code}`} data-measurement={unmeasured ? 'unmeasured' : 'measured'}>
        <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }} translate="no">
          SCENARIO {s.code}
          {s.status !== 'active' && <span className="ml-2" style={{ color: 'var(--accent-orange)' }}>· {s.status.toUpperCase()}</span>}
        </p>
        <h3 className="font-mono text-sm mb-2" style={{ color }} data-testid={`scenario-name-${s.code}`}>
          {s.name_en}
        </h3>
        {unmeasured ? (
          <>
            <p className="font-display text-2xl" style={{ color: 'var(--text-secondary)' }} translate="no">
              —
            </p>
            <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-primary)' }} data-testid={`scenario-unmeasured-${s.code}`}>
              {unmeasuredHeadline(reason)}
            </p>
            {reason && (
              <p className="font-mono text-[13px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {reason}
              </p>
            )}
          </>
        ) : residual && range ? (
          <>
            <p className="font-display text-2xl" style={{ color }} translate="no" data-testid="scenario-b-range">
              {formatRange(range)}
            </p>
            <RangeBar low={range.low} high={range.high} color={color} />
            <p className="font-mono text-[13px] mt-2 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
              A range, not a forecast point: {components.join(', ')} can happen in the same window, so &quot;none of them&quot; lies
              between 100 − ({components.join(' + ')}) = {Math.round(range.low)}% and 100 − the largest of them ={' '}
              {Math.round(range.high)}%.
              {range.missing.length > 0 ? ` ${range.missing.join(', ')} unmeasured, so the low end is 0.` : ''} The single
              number the method computes ({p}%) is the low end.
            </p>
            {range30 && (
              <p className="font-mono text-[13px] mt-2" style={{ color: 'var(--text-secondary)' }} translate="no" data-testid="scenario-p30-B">
                FIXED 30-DAY READING: {formatRange(range30)}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-display text-2xl" style={{ color }} translate="no">
              {p}%
              <span className="font-mono text-[13px] ml-2 align-middle" style={{ color: 'var(--text-muted)' }}>
                {registry.run?.horizon_end ? `BY ${registry.run.horizon_end}` : 'AT MARKET HORIZON'}
              </span>
            </p>
            <SentimentBar value={(p ?? 0) / 100} className="mt-2" />
            {r30 && (
              <p className="font-mono text-[13px] mt-2" style={{ color: 'var(--text-secondary)' }} translate="no" data-testid={`scenario-p30-${s.code}`}>
                FIXED 30-DAY READING: {Math.round(r30.p30 * 100)}%
                <span style={{ color: 'var(--text-muted)' }}> · market closes in {r30.daysToHorizon.toFixed(1)} days</span>
              </p>
            )}
            <p className="font-mono text-[13px] mt-2" style={{ color: 'var(--text-muted)' }} translate="no">
              {delta ? formatScenarioDelta(delta) : 'No earlier day under this method'}
            </p>
          </>
        )}
        <p className="font-body text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }} data-testid={`scenario-def-${s.code}`}>
          {s.definition_en}
        </p>
        {independent && (
          <p className="font-mono text-[13px] mt-3 tracking-wide" style={{ color: 'var(--accent-gold)' }} translate="no">
            ◆ Independent — can overlap with the core set · not part of the 100
          </p>
        )}
      </article>
    </OsintCard>
  );
}

/** 0-100 track with the [low, high] segment filled (B's range). */
function RangeBar({ low, high, color }: { low: number; high: number; color: string }) {
  const lo = Math.max(0, Math.min(100, low));
  const hi = Math.max(lo, Math.min(100, high));
  return (
    <div
      className="mt-2 h-1.5 w-full relative rounded-sm"
      style={{ background: 'var(--border)' }}
      role="img"
      aria-label={`Range ${Math.round(lo)} to ${Math.round(hi)} percent`}
    >
      <div className="absolute top-0 h-full rounded-sm" style={{ left: `${lo}%`, width: `${Math.max(hi - lo, 0.8)}%`, background: color, opacity: 0.85 }} />
    </div>
  );
}

export function ScenariosClient({ hasDetailAccess, registry, currentDay, conflictDayBadge }: ScenariosClientProps) {
  const visible = registry.scenarios.filter((s) => s.status !== 'retired');
  const retired = registry.scenarios.filter((s) => s.status === 'retired');
  const core = visible.filter((s) => s.group_code === 'core');
  const independent = visible.filter((s) => s.group_code !== 'core');
  const day = registry.latestDay;
  const readings = thirtyDayReadings(registry.run);
  const componentCodes = residualComponentCodes(registry.scenarios);
  const hasResidual = core.some((s) => isResidual(s.code));

  const methodSeries = seriesByMethod(registry.history);
  const current = methodSeries.find((m) => m.method === (registry.latestMethod ?? CURRENT_SCENARIO_METHOD)) ?? null;
  const archived = methodSeries.filter((m) => m !== current);
  const methodDesc = (m: string) => registry.methods.find((x) => x.method_version === m)?.description ?? '';

  const chartSeries = (codes: string[], dropResidual = false): ChartSeries[] =>
    registry.scenarios
      .filter((s) => codes.includes(s.code) && !(dropResidual && isResidual(s.code)))
      .map((s, i) => ({ code: s.code, name: s.name_en, color: scenarioColor(s.code, i), dashed: s.group_code !== 'core' }));
  const codesIn = (rows: { [k: string]: unknown }[]) =>
    Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== 'day'))));

  // Current-method chart rows get B's [low, high] band; the B line itself is not drawn (a point would
  // imply the low end is the estimate).
  const bandKey = `${RESIDUAL_SCENARIO_CODE}_range`;
  const currentRows: ChartRow[] = current
    ? current.rows.map((r) => {
        const rr = residualRangeFromRow(r, componentCodes);
        return { ...r, [bandKey]: rr ? ([Math.round(rr.low), Math.round(rr.high)] as [number, number]) : null };
      })
    : [];
  const residualScenario = registry.scenarios.find((s) => isResidual(s.code));

  const shareText =
    day != null
      ? `Day ${day} scenarios (${registry.latestMethod ?? ''}${registry.run?.horizon_end ? `, by ${registry.run.horizon_end}` : ''}): ` +
        visible
          .map((s) => {
            const d = scenarioDisplay(registry, s.code, day);
            return `${s.code} ${s.name_en} ${d.kind === 'range' ? `${d.text} (range)` : d.text}`;
          })
          .join(' · ') +
        ` — ${SITE}/scenarios`
      : '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex flex-wrap items-center gap-4">
          <h1 className="font-display text-3xl mb-0" style={{ color: 'var(--text-primary)' }}>
            SCENARIOS
          </h1>
          {day != null && <PageShareButton label="SHARE" getCopyText={() => shareText} />}
        </div>
        {conflictDayBadge}
        {day != null && (
          <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }} translate="no">
            DAY {day} · METHOD {registry.latestMethod}
            {registry.run?.horizon_end ? ` · HORIZON ${registry.run.horizon_end}` : ''}
            {day !== currentDay ? ` · CALENDAR DAY ${currentDay}` : ''}
          </p>
        )}
        <PageBriefing className="mt-3"
          description="The scenarios, their names and definitions come from the scenario registry, and each name says what its market actually measures. A, C and D are each read from public prediction-market prices (the markets are listed below with links). They can happen in the same window, so B, none of them, is shown as a range rather than a single number. Each market price is for the market's own closing date; a fixed 30-day reading converts it to a common horizon. Independent scenarios are measured on their own; one with no linked market is shown as unmeasured."
          note="Market prices are a crowd estimate, not this desk's opinion or a forecast. A scenario with no market that passes the quality floor is shown as unmeasured, never guessed. Days 1–35 were desk estimates under a retired method whose inputs and horizons were not stored: retired method, cannot be scored. They are shown only as a separate, archived series."
        />
      </div>

      {registry.error && (
        <div className="font-mono text-xs py-4 border px-4 mb-6" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }} role="alert">
          [DATA UNAVAILABLE] Scenario data could not be loaded just now. Please try again shortly.
        </div>
      )}

      {!registry.error && visible.length === 0 && <p className="redacted py-12">NO INTEL AVAILABLE</p>}

      {core.length > 0 && (
        <section aria-label="Core scenarios" className="mb-4">
          <h2 className="sr-only">Core scenarios</h2>
          <p className="font-mono text-[13px] mb-2 leading-relaxed" style={{ color: 'var(--text-muted)' }} data-testid="core-set-caption">
            {hasResidual
              ? `CORE SET — ${componentCodes.join(', ')} measured from markets and can co-occur · ${RESIDUAL_SCENARIO_CODE} = none of them, shown as a range`
              : `CORE SET — ${core.map((s) => s.code).join(', ')}`}
          </p>
          <p className="font-mono text-[13px] mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }} data-testid="horizon-caption">
            Each percentage is the market price for that market&apos;s own closing date
            {registry.run?.horizon_end ? ` (${registry.run.horizon_end})` : ''}. The fixed 30-day reading converts it to a common
            30-day horizon assuming a constant daily hazard: a conversion, not a market price.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {core.map((s, i) => (
              <ScenarioCard key={s.code} s={s} registry={registry} index={i} readings={readings} />
            ))}
          </div>
        </section>
      )}
      {independent.length > 0 && (
        <section aria-label="Independent scenarios" className="mb-8">
          <h2 className="sr-only">Independent scenarios</h2>
          <p className="font-mono text-[13px] mb-2 mt-4" style={{ color: 'var(--text-muted)' }}>
            INDEPENDENT — measured separately, can overlap with the core set
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {independent.map((s, i) => (
              <ScenarioCard key={s.code} s={s} registry={registry} index={core.length + i} readings={readings} />
            ))}
          </div>
        </section>
      )}
      {retired.length > 0 && (
        <section aria-label="Retired scenarios" className="mb-8">
          <h2 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Retired scenarios</h2>
          <ul className="font-mono text-xs space-y-1" style={{ color: 'var(--text-secondary)' }}>
            {retired.map((s) => (
              <li key={s.code}>
                {s.code} · {s.name_en} — retired Day {s.retired_day ?? '—'}
              </li>
            ))}
          </ul>
        </section>
      )}

      {current && (
        <section className="my-8 border-t pt-8" style={{ borderColor: 'var(--border)' }} aria-label="Scenario history">
          <ScenarioHistoryChart
            anchorId="scenario-history"
            title={`Scenario probabilities — Day ${current.firstDay} to ${current.lastDay}`}
            methodLabel={current.method}
            rows={currentRows}
            series={chartSeries(codesIn(current.rows), true)}
            bands={
              residualScenario
                ? [{ key: bandKey, name: `${RESIDUAL_SCENARIO_CODE}: ${residualScenario.name_en} (range)`, color: scenarioColor(RESIDUAL_SCENARIO_CODE) }]
                : []
            }
            shareText={shareText}
            note={`Only days computed by ${current.method} are drawn here. ${RESIDUAL_SCENARIO_CODE} is drawn as its range (shaded), not a line. Each point is the price for the market's own closing date. An unmeasured scenario is a gap, not zero.`}
          />
          {archived.length > 0 && (
            <div
              className="mt-6 px-3 py-2 border font-mono text-[13px] leading-relaxed"
              style={{ borderColor: 'var(--accent-orange)', color: 'var(--text-secondary)' }}
              data-testid="method-break"
            >
              ⚠ METHOD BREAK — the series above starts on Day {current.firstDay}. Earlier days were produced by a different
              method and are not comparable; they are shown separately below and are never joined to the current line or used
              for &quot;since&quot; deltas.
            </div>
          )}
          {archived.map((m) => (
            <details key={m.method} className="mt-4" data-testid={`archived-${m.method}`}>
              <summary className="font-mono text-xs cursor-pointer py-2" style={{ color: 'var(--text-secondary)' }}>
                ARCHIVED — Days {m.firstDay}–{m.lastDay} · {m.method}
                {m.method === LEGACY_SCENARIO_METHOD ? ` · ${LEGACY_SERIES_MARKER}` : ' (not comparable)'}
              </summary>
              <div className="mt-3">
                <ScenarioHistoryChart
                  anchorId={`scenario-history-${m.method}`}
                  title={`Archived — Days ${m.firstDay} to ${m.lastDay}${m.method === LEGACY_SCENARIO_METHOD ? ` — ${LEGACY_SERIES_MARKER}` : ''}`}
                  methodLabel={m.method}
                  rows={m.rows}
                  series={chartSeries(codesIn(m.rows))}
                  note={
                    m.method === LEGACY_SCENARIO_METHOD
                      ? `Retired method, cannot be scored: these desk estimates had no stated horizon and their inputs were not stored, so no outcome can ever be checked against them. ${methodDesc(m.method)}`
                      : methodDesc(m.method)
                  }
                  height={240}
                />
              </div>
            </details>
          ))}
        </section>
      )}

      <ScenarioMethodPanel registry={registry} hasDetailAccess={hasDetailAccess} />

      <p className="font-mono text-[13px] mt-6" style={{ color: 'var(--text-muted)' }}>
        Full method, floors and retirement rule:{' '}
        <Link prefetch={false} href="/methodology" style={{ color: 'var(--accent-gold)' }}>
          Methodology →
        </Link>
      </p>
    </div>
  );
}
