'use client';

import type { CSSProperties } from 'react';
import { useJudgeTime } from './RenderClock';
import {
  formatConflictDayShort,
  formatUtcDateTime,
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
  /** Calendar day (DAY LOCK). Defaults to `now`'s calendar day; never judged earlier than `now`'s day. */
  currentDay?: number;
  className?: string;
  /** Instant to judge freshness at. Pins the clock (tests). Default: server render time on first paint, then the real clock. */
  now?: Date;
  /** What the pending note says is coming ("brief", "market data" …). Defaults by section. */
  noun?: string;
  /** `noun` is plural ("briefs publish"). Defaults by section. */
  plural?: boolean;
  /** Publishing schedule. Defaults by section (publishScheduleFor). */
  schedule?: PublishSchedule;
  /** Continuous sections (FEED): ISO timestamp of the newest item; freshness is its age, not a schedule. */
  latestAt?: string | null;
  /** Render nothing while current (callers that only want the degraded notes). */
  hideWhenCurrent?: boolean;
}

/** What each section waits for, in the pending note ("Day 232 brief publishes around …"). FEED has none. */
const NOUNS: Record<string, { noun: string; plural: boolean }> = {
  'GENERAL BRIEFING': { noun: 'brief', plural: false },
  BRIEFINGS: { noun: 'briefs', plural: true },
  COUNTRY: { noun: 'report', plural: false },
  MARKETS: { noun: 'market data', plural: false },
  SCENARIOS: { noun: 'scenario update', plural: false },
  'WAR POSTURE': { noun: 'War Posture update', plural: false },
  SOCIAL: { noun: 'social data', plural: false },
};
const nounFor = (section: string) => NOUNS[section.trim().toUpperCase()] ?? { noun: 'update', plural: false };

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
 * Freshness label for a data section (client component: safe inside Server and Client Components).
 *
 * Every section that shows "latest" data renders this so the as-of day is always visible:
 *  - current: muted "as of Day N · current" (FEED: "newest item <time> · current").
 *  - pending: yesterday's data before the section's publish deadline (the normal window between the
 *    00:00 UTC day rollover and the writer). A calm, muted note: "Day N brief publishes around
 *    02:00 UTC. Showing Day N−1 (date)." It never says "published". FEED never has one.
 *  - stale:   past the deadline, 2+ days behind, or (FEED) newest item older than 12 h → "Stale" chip
 *    (status-elevated) and "Latest available: Day N (date) — …", so old data can never be read as
 *    today's intelligence.
 * Clock: the server render time on first paint (RenderClock: no hydration mismatch at a deadline),
 * then the real clock after mount, re-checked every minute. Design system v2 tokens only; no emoji.
 */
export function DataAsOf(props: DataAsOfProps) {
  const judgedAt = useJudgeTime(props.now?.getTime());
  return <DataAsOfView {...props} now={new Date(judgedAt)} />;
}

/** Pure view at a given instant (no hooks; tests render it directly). */
export function DataAsOfView({
  section,
  latestDay,
  currentDay,
  className = '',
  now,
  noun,
  plural,
  schedule,
  latestAt,
  hideWhenCurrent,
}: DataAsOfProps) {
  const sched = schedule ?? publishScheduleFor(section);
  const f = sectionFreshness(latestDay, currentDay, { now, schedule: sched, latestAt });
  if (hideWhenCurrent && f.status === 'current') return null;
  const words = nounFor(section);
  const attrs = {
    role: 'status' as const,
    'data-testid': 'data-as-of',
    'data-section': section,
    'data-freshness': f.status,
    'data-latest-day': f.latestDay ?? '',
    'data-current-day': f.currentDay,
    'data-judged-at': now ? now.toISOString() : undefined,
    className,
  };

  if (f.status === 'current') {
    return (
      <div {...attrs} style={{ ...BASE, color: 'var(--text-muted)' }}>
        <span translate="no" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Glyph status="CURRENT" />
          {f.latestAt ? (
            <span>
              {section} · newest item {formatUtcDateTime(f.latestAt)}
              {f.latestDay != null ? <> (Day <span className="num">{f.latestDay}</span>)</> : null} · current
            </span>
          ) : (
            <span>
              {section} · as of Day <span className="num">{f.latestDay}</span> ({formatConflictDayShort(f.latestDay!)}) · current
            </span>
          )}
        </span>
      </div>
    );
  }

  if (f.status === 'pending') {
    return (
      <div {...attrs} style={{ ...BASE, color: 'var(--text-muted)' }}>
        <span translate="no">
          <span style={{ color: 'var(--text-2)', fontWeight: 600 }}>{section}</span> ·{' '}
          {freshnessLabel(f, noun ?? words.noun, plural ?? (noun == null ? words.plural : false))}
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
