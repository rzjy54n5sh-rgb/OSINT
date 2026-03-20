/** Calendar start of conflict-day counter (matches pipeline: 2026-02-28). */
export const CONFLICT_START = '2026-02-28';

function conflictDayFromUtcCalendar(d: Date): number {
  const nowUTC = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const startUTC = Date.UTC(2026, 1, 28); // Feb 28 — month 0-indexed
  const days = Math.floor((nowUTC - startUTC) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, days);
}

/**
 * Conflict day index: UTC calendar days since Feb 28 2026 inclusive (Feb 28 = Day 1).
 */
export function getConflictDayNumber(d = new Date()): number {
  return conflictDayFromUtcCalendar(d);
}

/**
 * Same as getConflictDayNumber — used by ConflictDayBadge and scenario day alignment.
 * Mar 21 2026 UTC → Day 22; Feb 28 2026 UTC → Day 1.
 */
export function getConflictDay(): number {
  return conflictDayFromUtcCalendar(new Date());
}

export function getFormattedConflictDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
