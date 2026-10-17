import Link from 'next/link';
import type { CSSProperties } from 'react';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { formatConflictDayShort } from '@/lib/conflict-calendar';
import { formatShortDay } from '@/lib/corridors';
import { unmeasuredHeadline } from '@/lib/scenario-registry';
import type { ScenarioRowItem, ScenarioRowView } from '@/lib/scenario-row';
import s from './home.module.css';

/** Theme-aware identity colour (design system v2); E and dynamic scenarios have none. */
function scenarioVar(code: string): string {
  return ['A', 'B', 'C', 'D'].includes(code) ? `var(--scn-${code.toLowerCase()})` : 'var(--muted)';
}

/**
 * Short form of the /scenarios unmeasured headline (lib/scenario-registry unmeasuredHeadline, shared with
 * /scenarios): "No reading yet", "No market linked", "No market meets the quality floor" or "No qualifying
 * market". The full reason stays on /scenarios.
 */
function unmeasuredShort(reason: string | null): string {
  const tail = unmeasuredHeadline(reason).replace(/^Unmeasured\s*[—–-]\s*/, '');
  return tail.charAt(0).toUpperCase() + tail.slice(1);
}

/** "Unmeasured · E: no market meets the quality floor · F, G: no reading yet" (codes grouped by reason). */
function unmeasuredNote(items: ScenarioRowItem[]): string | null {
  const by = new Map<string, string[]>();
  for (const it of items) if (it.kind === 'unmeasured') by.set(unmeasuredShort(it.reason), [...(by.get(unmeasuredShort(it.reason)) ?? []), it.code]);
  if (!by.size) return null;
  return `Unmeasured · ${[...by].map(([why, codes]) => `${codes.join(', ')}: ${why.toLowerCase()}`).join(' · ')}`;
}

/** Phone grid columns for n scenarios: all in one row up to five, then two balanced rows, then rows of four. */
export function gridColumns(n: number): number {
  if (n <= 5) return Math.max(1, n);
  if (n <= 8) return Math.ceil(n / 2);
  return 4;
}

/** "31 Oct" from the run's horizon (an ISO date); the full value stays in <time dateTime>. */
function horizonLabel(h: string | null): string | null {
  if (!h) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(h) ? formatShortDay(h) : h;
}

/**
 * Home "Odds" card (Main artboard: a list with one bar per scenario; Home-Mobile: five columns). The
 * registry scenarios with the numbers /scenarios publishes for its latest day (lib/scenario-row.ts reuses
 * the /scenarios mappers; tests/unit/scenario-row.check.ts asserts equality). B is a hatched range, never a
 * point; an unmeasured scenario has no bar and says so in words. No hooks, no fetch: server-safe.
 */
export function ScenarioRow({
  row,
  currentDay,
  headingId = 'scenario-row-h',
}: {
  row: ScenarioRowView;
  /** Calendar day (DAY LOCK); when given and the row is older, the freshness line is shown. */
  currentDay?: number;
  headingId?: string;
}) {
  const hasData = row.day != null && row.items.length > 0;
  const horizon = horizonLabel(row.horizon);
  return (
    <section id="scenarios" aria-labelledby={headingId} className={`${s.card} ${s.odds}`} data-testid="home-scenario-row">
      <div className={s.cardHead}>
        <h2 id={headingId} className={s.h2}>
          Scenario odds
          {horizon ? (
            <>
              {' '}
              by <time dateTime={row.horizon ?? undefined}>{horizon}</time>
            </>
          ) : null}
        </h2>
        {hasData ? (
          <span className={`${s.meta} ${s.num}`} translate="no">
            Market prices, not the desk&apos;s forecast · Day {row.day} ({formatConflictDayShort(row.day!)}) · method {row.method ?? '—'}
          </span>
        ) : null}
      </div>

      {hasData ? (
        <>
          {/* Always mounted (hidden while current): the client re-check after mount can still flag a page
              cached before the 14:00 UTC deadline or before midnight, so it never contradicts the client sections. */}
          {currentDay != null && <DataAsOf section="SCENARIOS" latestDay={row.day} currentDay={currentDay} hideWhenCurrent />}
          <ul className={s.oddsList} aria-label={`Scenario probabilities, Day ${row.day}`} data-testid="home-odds-list">
            {row.items.map((item) => (
              <OddsItem key={item.code} item={item} />
            ))}
          </ul>
          {/* Phones (Home-Mobile): five columns. Real text per cell ("B 72–81% range", "E unmeasured"), so the
              figures stay in the accessibility tree; only one of list / grid is displayed at a time. */}
          <ul
            className={`${s.oddsGrid} ${s.num}`}
            aria-label={`Scenario probabilities, Day ${row.day}`}
            data-testid="home-odds-grid"
            // Any number of scenarios: one row up to five, then balanced rows (7 → 4 + 3), never a sideways scroll.
            style={{ '--odds-cols': gridColumns(row.items.length) } as CSSProperties}
          >
            {row.items.map((item) => (
              <li
                key={item.code}
                data-kind={item.kind}
                data-code={item.code}
                style={{ borderTopColor: item.kind === 'unmeasured' ? 'var(--muted)' : scenarioVar(item.code) }}
              >
                <span className={s.text2}>{item.code}</span>
                {item.kind === 'unmeasured' ? (
                  <span className={s.oddsGridVal}>
                    <span aria-hidden="true">—</span>
                    <span className="chip-sr-only"> unmeasured, {unmeasuredShort(item.reason).toLowerCase()}</span>
                  </span>
                ) : (
                  <span className={item.kind === 'range' ? s.oddsGridRange : s.oddsGridVal}>
                    <span className="chip-sr-only"> </span>
                    {item.text}
                    {item.kind === 'range' ? <span className="chip-sr-only"> range</span> : null}
                  </span>
                )}
              </li>
            ))}
          </ul>
          {/* Phones: the cells show "—" for an unmeasured scenario; this line says why (the cells carry it for screen readers). */}
          {unmeasuredNote(row.items) ? (
            <p className={s.oddsGridNote} aria-hidden="true">
              {unmeasuredNote(row.items)}
            </p>
          ) : null}
        </>
      ) : (
        <p className={s.empty}>{row.error ? 'Scenario data is not available just now.' : 'Scenario data is not available yet.'}</p>
      )}
      <Link prefetch={false} href="/scenarios" className={s.cta}>
        Full method &amp; markets →
      </Link>
    </section>
  );
}

function OddsItem({ item }: { item: ScenarioRowItem }) {
  const color = scenarioVar(item.code);
  const note =
    item.kind === 'range'
      ? 'A range, not a point: A, C and D can co-occur'
      : item.kind === 'unmeasured'
        ? `Unmeasured: ${unmeasuredShort(item.reason)}`
        : item.deltaText;
  return (
    <li className={s.oddsItem} data-testid={`home-scenario-${item.code}`} data-kind={item.kind}>
      <div className={s.oddsHead}>
        <span className={s.oddsLabel}>
          <span className={`${s.num} ${s.oddsCode}`} style={{ color: item.kind === 'unmeasured' ? 'var(--text-2)' : color }} translate="no">
            {item.code}
          </span>{' '}
          {item.name}
        </span>
        <span className={`${s.num} ${s.oddsVal}`} translate="no">
          {item.kind === 'unmeasured' ? (
            // The note below says "Unmeasured: <reason>"; the dash is only its visual stand-in.
            <span aria-hidden="true">—</span>
          ) : (
            item.text
          )}
          {item.kind === 'range' ? <span className="chip-sr-only"> (range)</span> : null}
        </span>
      </div>
      <OddsBar item={item} color={color} />
      {note ? <span className={`${s.num} ${s.oddsNote}`}>{note}</span> : null}
      {item.independent ? <span className={s.oddsNote}>Independent · not part of the 100</span> : null}
    </li>
  );
}

/** Decorative 0–100 track (the number above carries the value). B hatched from low to high; unmeasured: dashed, empty. */
function OddsBar({ item, color }: { item: ScenarioRowItem; color: string }) {
  if (item.kind === 'unmeasured') return <div aria-hidden="true" className={s.oddsTrack} data-unmeasured="true" />;
  const lo = item.kind === 'range' ? Math.max(0, Math.min(100, item.low ?? 0)) : 0;
  const hi = item.kind === 'range' ? Math.max(lo, Math.min(100, item.high ?? 0)) : Math.max(0, Math.min(100, item.p ?? 0));
  return (
    <div aria-hidden="true" className={s.oddsTrack}>
      <div
        className={s.oddsFill}
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
