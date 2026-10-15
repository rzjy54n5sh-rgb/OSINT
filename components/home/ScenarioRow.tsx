import Link from 'next/link';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { formatConflictDayShort } from '@/lib/conflict-calendar';
import type { ScenarioRowItem, ScenarioRowView } from '@/lib/scenario-row';
import { ScenarioChip } from '@/components/ui/ScenarioChip';

/** Theme-aware identity colour (design system v2); E and dynamic scenarios have none. */
function scenarioVar(code: string): string {
  return ['A', 'B', 'C', 'D'].includes(code) ? `var(--scn-${code.toLowerCase()})` : 'var(--muted)';
}

/**
 * Home first screen (UX audit §6, "Have the odds moved?"): the registry scenarios in one row with
 * the numbers /scenarios publishes for its latest day (lib/scenario-row.ts reuses the /scenarios
 * mappers; tests/unit/scenario-row.check.ts asserts equality). B is a range, an unmeasured
 * scenario says so in words. No hooks, no fetch: safe in server and client components.
 * Phones: the row scrolls sideways inside itself; from `lg` it is a five-column grid.
 */
export function ScenarioRow({
  row,
  currentDay,
  headingId = 'scenario-row-h',
}: {
  row: ScenarioRowView;
  /** Calendar day (DAY LOCK); when given and the row is older, a stale label is shown. */
  currentDay?: number;
  headingId?: string;
}) {
  const hasData = row.day != null && row.items.length > 0;
  return (
    <section
      aria-labelledby={headingId}
      className="mb-6 px-4 py-3"
      style={{ border: '1px solid var(--border)', background: 'var(--bg-card)' }}
      data-testid="home-scenario-row"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-2">
        <h2
          id={headingId}
          className="text-[13px] font-semibold uppercase"
          style={{ fontFamily: 'var(--font-ui)', color: 'var(--accent-gold)', letterSpacing: '0.06em' }}
        >
          Scenario odds{row.horizon ? ` to ${row.horizon}` : ''}
        </h2>
        <Link prefetch={false} href="/scenarios" className="text-[13px]" style={{ color: 'var(--link)' }}>
          Full method &amp; markets →
        </Link>
      </div>

      {hasData ? (
        <>
          <p className="num mb-3" style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }} translate="no">
            Day {row.day} ({formatConflictDayShort(row.day!)}) · method {row.method ?? '—'}
            {row.horizon ? ` · horizon ${row.horizon}` : ''}
          </p>
          {currentDay != null && row.day !== currentDay && (
            <DataAsOf section="SCENARIOS" latestDay={row.day} currentDay={currentDay} className="mb-3" />
          )}
          <ul
            className="flex gap-2 overflow-x-auto snap-x pb-1 lg:grid lg:grid-cols-5 lg:overflow-visible"
            aria-label={`Scenario probabilities, Day ${row.day}`}
            tabIndex={0}
          >
            {row.items.map((item) => (
              <ScenarioRowCard key={item.code} item={item} />
            ))}
          </ul>
          <p className="mt-2 leading-relaxed" style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
            Market prices for each market&apos;s own close: a crowd estimate, not this desk&apos;s forecast. B is a range because
            A, C and D can happen in the same window.
          </p>
        </>
      ) : (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {row.error ? 'Scenario data is not available just now.' : 'Scenario data is not available yet.'}{' '}
          <Link prefetch={false} href="/scenarios" style={{ color: 'var(--accent-gold)' }}>
            Open /scenarios →
          </Link>
        </p>
      )}
    </section>
  );
}

function ScenarioRowCard({ item }: { item: ScenarioRowItem }) {
  const measured = item.kind !== 'unmeasured';
  const color = scenarioVar(item.code);
  return (
    <li
      className="snap-start shrink-0 w-[44%] min-w-[150px] sm:w-[30%] lg:w-auto lg:min-w-0 px-3 py-2"
      style={{
        border: item.independent ? '1px dashed var(--border)' : '1px solid var(--border)',
        borderTop: `2px ${item.independent ? 'dashed' : 'solid'} ${measured ? color : 'var(--border)'}`,
      }}
      data-testid={`home-scenario-${item.code}`}
      data-kind={item.kind}
    >
      <h3 className="text-sm leading-snug" style={{ color: 'var(--text-primary)' }}>
        <ScenarioChip code={item.code} label={item.name} kind={item.kind} />
      </h3>
      <p
        className={measured ? 'num text-2xl mt-1' : 'num text-sm mt-2'}
        style={{ color: measured ? color : 'var(--text-secondary)', lineHeight: 1.1 }}
        translate="no"
      >
        {item.text}
        {item.kind === 'range' && ' '}
        {item.kind === 'range' && (
          <span className="ml-1 align-middle" style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
            range
          </span>
        )}
      </p>
      <MiniBar item={item} color={color} />
      <p className="mt-1 leading-snug" style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-muted)' }}>
        {item.kind === 'range'
          ? 'A range: A, C and D can co-occur'
          : item.kind === 'unmeasured'
            ? unmeasuredShort(item.reason)
            : item.deltaText}
      </p>
      {item.independent && (
        <p className="mt-1" style={{ fontSize: 'var(--fs-meta)', color: 'var(--text-secondary)' }}>
          Independent · not part of the 100
        </p>
      )}
    </li>
  );
}

/** Short form of the /scenarios unmeasured headline; the run's full flag text stays on /scenarios. */
function unmeasuredShort(reason: string | null): string {
  return reason && /quality floor/i.test(reason) ? 'No market meets the quality floor' : 'No qualifying market';
}

/** Decorative 0–100 track (the number above carries the value). */
function MiniBar({ item, color }: { item: ScenarioRowItem; color: string }) {
  if (item.kind === 'unmeasured') return <div aria-hidden className="mt-2 h-1 w-full" style={{ background: 'var(--track)' }} />;
  const lo = item.kind === 'range' ? Math.max(0, Math.min(100, item.low ?? 0)) : 0;
  const hi = item.kind === 'range' ? Math.max(lo, Math.min(100, item.high ?? 0)) : Math.max(0, Math.min(100, item.p ?? 0));
  return (
    <div aria-hidden className="mt-2 h-1 w-full relative" style={{ background: 'var(--track)' }}>
      <div
        className="absolute top-0 h-full"
        style={{
          insetInlineStart: `${lo}%`,
          width: `${Math.max(hi - lo, 0.8)}%`,
          background: item.kind === 'range' ? `repeating-linear-gradient(135deg, ${color} 0 3px, transparent 3px 6px)` : color,
        }}
      />
    </div>
  );
}

export default ScenarioRow;
