import { currentConflictDay, formatConflictDayDate } from '@/lib/conflict-calendar';

/** Calendar start of conflict-day counter (matches pipeline DAY LOCK: 2026-02-28 = Day 1). */
export const CONFLICT_START = '2026-02-28';

/**
 * Conflict day index: UTC calendar days since Feb 28 2026 inclusive (Feb 28 = Day 1).
 * DAY LOCK — never derived from any table's MAX(conflict_day). See lib/conflict-calendar.ts.
 */
export function getConflictDayNumber(d = new Date()): number {
  return currentConflictDay(d);
}

/**
 * Same as getConflictDayNumber — used by ConflictDayBadge and scenario day alignment.
 * Mar 21 2026 UTC → Day 22; Feb 28 2026 UTC → Day 1.
 */
export function getConflictDay(): number {
  return currentConflictDay(new Date());
}

/** Today's UTC date (the calendar date of the current conflict day). */
export function getFormattedConflictDate(): string {
  return formatConflictDayDate(currentConflictDay(new Date()));
}
