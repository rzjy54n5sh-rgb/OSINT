import {
  currentConflictDay,
  formatConflictDayShort,
  freshnessLabel,
  sectionFreshness,
} from '@/lib/conflict-calendar';

interface DataAsOfProps {
  /** Section name shown in the label, e.g. "NAI", "SCENARIOS", "MARKETS". */
  section: string;
  /** Latest conflict_day in the section's OWN table (null = no rows). */
  latestDay: number | null | undefined;
  /** Calendar day (DAY LOCK). Defaults to today's calendar day. */
  currentDay?: number;
  className?: string;
}

/**
 * Freshness label for a data section. No hooks — safe in Server and Client Components.
 *
 * Every section that shows "latest" data renders this so the as-of day is always
 * visible. When the section has no data for the calendar day it renders the
 * degraded-state label "Latest available: Day N (date) — no data for Day <today>",
 * so old data can never be read as today's intelligence.
 */
export function DataAsOf({ section, latestDay, currentDay, className = '' }: DataAsOfProps) {
  const today = currentDay ?? currentConflictDay();
  const f = sectionFreshness(latestDay, today);
  const isCurrent = f.status === 'current';
  const color =
    f.status === 'current'
      ? 'var(--text-muted)'
      : f.status === 'ahead'
        ? 'var(--accent-red)'
        : 'var(--accent-orange)';

  return (
    <div
      role="status"
      data-testid="data-as-of"
      data-section={section}
      data-freshness={f.status}
      data-latest-day={f.latestDay ?? ''}
      data-current-day={f.currentDay}
      className={`font-mono text-xs uppercase ${isCurrent ? '' : 'border px-3 py-2'} ${className}`}
      style={{
        color,
        borderColor: isCurrent ? undefined : color,
        background: isCurrent ? undefined : 'rgba(255,140,0,0.06)',
        letterSpacing: '1px',
      }}
    >
      <span translate="no">
        {isCurrent ? '◆ ' : '⚠ '}
        {section}
        {isCurrent
          ? ` · AS OF DAY ${f.latestDay} (${formatConflictDayShort(f.latestDay!)}) · CURRENT`
          : ` — ${freshnessLabel(f)}`}
      </span>
    </div>
  );
}
