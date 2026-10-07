'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { PageBriefing } from '@/components/PageBriefing';
import { SentimentBar } from '@/components/SentimentBar';
import { PageShareButton } from '@/components/PageShareButton';
import { ScenarioHistoryChart, type ChartSeries } from '@/components/scenarios/ScenarioHistoryChart';
import { ScenarioMethodPanel } from '@/components/scenarios/ScenarioMethodPanel';
import {
  CURRENT_SCENARIO_METHOD,
  deltaWithinMethod,
  probabilityOn,
  scenarioColor,
  seriesByMethod,
  unmeasuredFlag,
  type RegistryScenario,
  type ScenarioRegistryView,
} from '@/lib/scenario-registry';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://mena-intel-desk.mores-cohorts9x.workers.dev';

type ScenariosClientProps = {
  hasDetailAccess: boolean;
  registry: ScenarioRegistryView;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
  /** Server-rendered conflict day strip (placed after page <h1>). */
  conflictDayBadge?: ReactNode;
};

function unmeasuredHeadline(reason: string | null): string {
  return reason && /quality floor/i.test(reason)
    ? 'Unmeasured — no market meets the quality floor'
    : 'Unmeasured — no qualifying market';
}

function ScenarioCard({
  s,
  registry,
  index,
}: {
  s: RegistryScenario;
  registry: ScenarioRegistryView;
  index: number;
}) {
  const day = registry.latestDay;
  const p = probabilityOn(registry.history, s.code, day);
  const color = scenarioColor(s.code, index);
  const independent = s.group_code !== 'core';
  const unmeasured = p === null || s.measurement_state === 'unmeasured';
  const point = registry.history.find((x) => x.code === s.code && x.conflict_day === day);
  const reason = unmeasured ? (unmeasuredFlag(registry.run, s.code) ?? point?.null_reason ?? null) : null;
  const delta = deltaWithinMethod(registry.history, s.code, day);

  return (
    <OsintCard
      className={independent ? 'border-2 border-dashed h-full' : 'h-full'}
      style={independent ? { borderColor: `${color}80` } : undefined}
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
              <p className="font-mono text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {reason}
              </p>
            )}
          </>
        ) : (
          <>
            <p className="font-display text-2xl" style={{ color }} translate="no">
              {p}%
            </p>
            <SentimentBar value={(p ?? 0) / 100} className="mt-2" />
            <p className="font-mono text-[11px] mt-2" style={{ color: 'var(--text-muted)' }} translate="no">
              {delta
                ? `${delta.delta > 0 ? '+' : ''}${delta.delta} pts since Day ${delta.sinceDay} (same method)`
                : 'No earlier day under this method'}
            </p>
          </>
        )}
        <p className="font-body text-xs mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }} data-testid={`scenario-def-${s.code}`}>
          {s.definition_en}
        </p>
        {independent && (
          <p className="font-mono text-[11px] mt-3 tracking-wide" style={{ color: 'var(--accent-gold)' }} translate="no">
            ◆ Independent — can overlap with the core set · not part of the 100
          </p>
        )}
      </article>
    </OsintCard>
  );
}

export function ScenariosClient({ hasDetailAccess, registry, currentDay, conflictDayBadge }: ScenariosClientProps) {
  const visible = registry.scenarios.filter((s) => s.status !== 'retired');
  const retired = registry.scenarios.filter((s) => s.status === 'retired');
  const core = visible.filter((s) => s.group_code === 'core');
  const independent = visible.filter((s) => s.group_code !== 'core');
  const day = registry.latestDay;

  const methodSeries = seriesByMethod(registry.history);
  const current = methodSeries.find((m) => m.method === (registry.latestMethod ?? CURRENT_SCENARIO_METHOD)) ?? null;
  const archived = methodSeries.filter((m) => m !== current);
  const methodDesc = (m: string) => registry.methods.find((x) => x.method_version === m)?.description ?? '';

  const chartSeries = (codes: string[]): ChartSeries[] =>
    registry.scenarios
      .filter((s) => codes.includes(s.code))
      .map((s, i) => ({ code: s.code, name: s.name_en, color: scenarioColor(s.code, i), dashed: s.group_code !== 'core' }));
  const codesIn = (rows: { [k: string]: unknown }[]) =>
    Array.from(new Set(rows.flatMap((r) => Object.keys(r).filter((k) => k !== 'day'))));

  const shareText =
    day != null
      ? `Day ${day} scenarios (${registry.latestMethod ?? ''}): ` +
        visible
          .map((s) => {
            const p = probabilityOn(registry.history, s.code, day);
            return `${s.code} ${s.name_en} ${p === null ? 'unmeasured' : `${p}%`}`;
          })
          .join(' · ') +
        ` — ${SITE}/scenarios`
      : '';

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="CONFLICT SCENARIO PROBABILITIES"
        description="The scenarios, their names and definitions come from the scenario registry. The core set (A–D) is mutually exclusive over the method horizon and sums to 100; independent scenarios (E) can overlap and are not part of the 100. Each day's numbers are computed by the market-anchored method from public prediction-market prices, and the markets used are listed below with links."
        note="Market prices are a crowd estimate, not this desk's opinion or a forecast. A scenario with no market that passes the quality floor is shown as unmeasured, never guessed. Days 1–35 were desk estimates under a retired method whose inputs were not stored; they are shown only as a separate, archived series."
      />
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
      </div>

      {registry.error && (
        <div className="font-mono text-xs py-4 border px-4 mb-6" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }} role="alert">
          [DATA UNAVAILABLE] Scenario data could not be loaded just now. Please try again shortly.
        </div>
      )}

      {!registry.error && visible.length === 0 && <p className="redacted py-12">NO INTEL AVAILABLE</p>}

      {core.length > 0 && (
        <section aria-label="Core scenarios" className="mb-4">
          <p className="font-mono text-[11px] mb-2" style={{ color: 'var(--text-muted)' }}>
            CORE SET — {core.map((s) => s.code).join(' + ')} = 100% each day
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {core.map((s, i) => (
              <ScenarioCard key={s.code} s={s} registry={registry} index={i} />
            ))}
          </div>
        </section>
      )}
      {independent.length > 0 && (
        <section aria-label="Independent scenarios" className="mb-8">
          <p className="font-mono text-[11px] mb-2 mt-4" style={{ color: 'var(--text-muted)' }}>
            INDEPENDENT — measured separately, can overlap with the core set
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {independent.map((s, i) => (
              <ScenarioCard key={s.code} s={s} registry={registry} index={core.length + i} />
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
            rows={current.rows}
            series={chartSeries(codesIn(current.rows))}
            shareText={shareText}
            note={`Only days computed by ${current.method} are drawn here. An unmeasured scenario is a gap, not zero.`}
          />
          {archived.length > 0 && (
            <div
              className="mt-6 px-3 py-2 border font-mono text-[11px] leading-relaxed"
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
                ARCHIVED — Days {m.firstDay}–{m.lastDay} · {m.method} (not comparable)
              </summary>
              <div className="mt-3">
                <ScenarioHistoryChart
                  anchorId={`scenario-history-${m.method}`}
                  title={`Archived — Days ${m.firstDay} to ${m.lastDay}`}
                  methodLabel={m.method}
                  rows={m.rows}
                  series={chartSeries(codesIn(m.rows))}
                  note={methodDesc(m.method)}
                  height={240}
                />
              </div>
            </details>
          ))}
        </section>
      )}

      <ScenarioMethodPanel registry={registry} hasDetailAccess={hasDetailAccess} />

      <p className="font-mono text-[11px] mt-6" style={{ color: 'var(--text-muted)' }}>
        Full method, floors and retirement rule:{' '}
        <Link href="/methodology" style={{ color: 'var(--accent-gold)' }}>
          Methodology →
        </Link>
      </p>
    </div>
  );
}
