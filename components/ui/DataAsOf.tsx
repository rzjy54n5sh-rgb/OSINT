import type { CSSProperties } from 'react';
import {
  formatConflictDayShort,
  freshnessLabel,
  publishScheduleFor,
  sectionFreshness,
  type FreshnessStatus,
  type PublishSchedule,
} from '@/lib/conflict-calendar';

interface DataAsOfProps {
  /** Section name shown in the label, e.g. "GENERAL BRIEFING", "SCENARIOS", "MARKETS". */
  section: string;
  /** Latest conflict_day in the section's OWN table (null = no rows). */
  latestDay: number | null | undefined;
  /** Calendar day (DAY LOCK). Defaults to `now`'s calendar day. */
  currentDay?: number;
  className?: string;
  /** Instant to judge freshness at. Defaults to now; tests pass a fixed clock. */
  now?: Date;
  /** What the pending note says is coming ("brief", "market data" …). Defaults by section. */
  noun?: string;
  /** Publishing schedule. Defaults by section (publishScheduleFor). */
  schedule?: PublishSchedule;
}

/** What each section waits for, in the pending note ("Day 232 brief publishes around …"). */
const NOUNS: Record<string, string> = {
  'GENERAL BRIEFING': 'brief',
  BRIEFINGS: 'briefs',
  COUNTRY: 'report',
  MARKETS: 'market data',
  SCENARIOS: 'scenario update',
  'WAR POSTURE': 'War Posture update',
  FEED: 'feed',
  SOCIAL: 'social data',
};
const nounFor = (section: string) => NOUNS[section.trim().toUpperCase()] ?? 'update';

/** Degraded states → v2 lane-status colour + word (StatusChip pattern; glyph is inline SVG, never emoji). */
const CHIP: Record<Exclude<FreshnessStatus, 'current' | 'pending'>, { status: 'ELEVATED' | 'CLOSED' | 'UNKNOWN'; word: string }> = {
  stale: { status: 'ELEVATED', word: 'Stale' },
  ahead: { status: 'CLOSED', word: 'Check' },
  empty: { status: 'UNKNOWN', word: 'No data' },
};

function Glyph({ status }: { status: 'ELEVATED' | 'CLOSED' | 'UNKNOWN' | 'CURRENT' }) {
  return (
    <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true" focusable="false" style={{ flex: 'none' }}>
      {status === 'ELEVATED' ? (
        <path d="M6 1.5 11 10.5H1Z" fill="currentColor" />
      ) : status === 'CLOSED' ? (
        <rect x="2" y="2" width="8" height="8" fill="currentColor" />
      ) : status === 'UNKNOWN' ? (
        <circle cx="6" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      ) : (
        <path d="M6 1.5 10.5 6 6 10.5 1.5 6Z" fill="currentColor" />
      )}
    </svg>
  );
}

const BASE: CSSProperties = {
  fontFamily: 'var(--font-ui)',
  fontSize: 'var(--fs-meta)',
  lineHeight: 1.45,
};

/**
 * Freshness label for a data section. No hooks — safe in Server and Client Components.
 *
 * Every section that shows "latest" data renders this so the as-of day is always visible:
 *  - current: muted "as of Day N · current".
 *  - pending: yesterday's data before the publish deadline (the normal overnight window between the
 *    00:00 UTC day rollover and the daily build). A calm, muted note: "Day N brief publishes around
 *    02:00 UTC. Showing Day N−1 (date)." It never says "published".
 *  - stale:   past the deadline, or 2+ days behind → "Stale" chip (status-elevated) and the
 *    degraded-state label "Latest available: Day N (date) — no data for Day <today>", so old data
 *    can never be read as today's intelligence.
 * Design system v2 tokens only; no emoji.
 */
export function DataAsOf({ section, latestDay, currentDay, className = '', now, noun, schedule }: DataAsOfProps) {
  const f = sectionFreshness(latestDay, currentDay, { now, schedule: schedule ?? publishScheduleFor(section) });
  const attrs = {
    role: 'status' as const,
    'data-testid': 'data-as-of',
    'data-section': section,
    'data-freshness': f.status,
    'data-latest-day': f.latestDay ?? '',
    'data-current-day': f.currentDay,
    className,
  };

  if (f.status === 'current') {
    return (
      <div {...attrs} style={{ ...BASE, color: 'var(--text-muted)' }}>
        <span translate="no" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Glyph status="CURRENT" />
          <span>
            {section} · as of Day <span className="num">{f.latestDay}</span> ({formatConflictDayShort(f.latestDay!)}) · current
          </span>
        </span>
      </div>
    );
  }

  if (f.status === 'pending') {
    return (
      <div {...attrs} style={{ ...BASE, color: 'var(--text-muted)' }}>
        <span translate="no">
          <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{section}</span> · {freshnessLabel(f, noun ?? nounFor(section))}
        </span>
      </div>
    );
  }

  const chip = CHIP[f.status];
  return (
    <div
      {...attrs}
      style={{ ...BASE, color: 'var(--text-2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '6px 10px' }}
    >
      <span className="chip-status" data-status={chip.status} data-size="sm">
        <span className="chip-sr-only">Status: </span>
        <Glyph status={chip.status} />
        {chip.word}
      </span>
      <span translate="no">
        <span style={{ fontWeight: 600 }}>{section}</span> — {freshnessLabel(f)}
      </span>
    </div>
  );
}
