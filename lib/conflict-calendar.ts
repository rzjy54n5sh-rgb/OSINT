/**
 * Conflict-day calendar — the ONLY place the app derives "today's conflict day".
 *
 * DAY LOCK (CLAUDE.md rule 1): DAY = (today_utc − 2026-02-28).days + 1.
 * The current day is a pure function of the UTC calendar. It is NEVER derived
 * from MAX(conflict_day) of any table (nai_scores, scenario_probabilities, …):
 * a table that stops being written (e.g. a frozen nai_scores) must not be able
 * to freeze the whole site.
 *
 * When a section needs "the latest day this section has data", it maxes over
 * its OWN table and compares the result to the calendar day with
 * `sectionFreshness()`, so stale data is labelled instead of presented as today.
 */

const CONFLICT_START_UTC_MS = Date.UTC(2026, 1, 28); // Feb 28 2026 (month 0-indexed) = Day 1
const MS_PER_DAY = 1000 * 60 * 60 * 24;

/** Calendar conflict day for a given instant (UTC). Feb 28 2026 → 1; Oct 5 2026 → 220. */
export function currentConflictDay(now: Date = new Date()): number {
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const days = Math.floor((todayUtc - CONFLICT_START_UTC_MS) / MS_PER_DAY) + 1;
  return Math.max(1, days);
}

/** Calendar date for conflict day index (Day 1 = 2026-02-28 UTC). */
export function conflictDayToUtcDate(conflictDay: number): Date {
  const d = new Date(CONFLICT_START_UTC_MS);
  d.setUTCDate(d.getUTCDate() + Math.max(0, conflictDay - 1));
  return d;
}

export function formatConflictDayDate(conflictDay: number): string {
  return conflictDayToUtcDate(conflictDay).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** Short UTC date for a conflict day, e.g. Day 35 → "Apr 3, 2026". */
export function formatConflictDayShort(conflictDay: number): string {
  return conflictDayToUtcDate(conflictDay).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export type FreshnessStatus = 'current' | 'stale' | 'empty' | 'ahead';

export interface SectionFreshness {
  status: FreshnessStatus;
  /** Latest conflict_day present in the section's own table (null = no rows). */
  latestDay: number | null;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
  /** currentDay − latestDay (null when empty). */
  lagDays: number | null;
}

/**
 * Compare a section's own latest day with the calendar day.
 * - current: the section has data for today
 * - stale:   newest data is older than today → must be labelled "Latest available"
 * - empty:   the section has no rows at all
 * - ahead:   data stamped later than the calendar (clock/pipeline error) → flagged, never silently shown
 */
export function sectionFreshness(
  latestDay: number | null | undefined,
  currentDay: number = currentConflictDay()
): SectionFreshness {
  if (latestDay == null || !Number.isFinite(latestDay) || latestDay < 1) {
    return { status: 'empty', latestDay: null, currentDay, lagDays: null };
  }
  const lagDays = currentDay - latestDay;
  const status: FreshnessStatus = lagDays === 0 ? 'current' : lagDays > 0 ? 'stale' : 'ahead';
  return { status, latestDay, currentDay, lagDays };
}

/** Human label for a section's freshness. Exact wording for the degraded state is a product requirement. */
export function freshnessLabel(f: SectionFreshness): string {
  switch (f.status) {
    case 'current':
      return `DAY ${f.currentDay} (${formatConflictDayShort(f.currentDay)}) — CURRENT`;
    case 'stale':
      return `Latest available: Day ${f.latestDay} (${formatConflictDayShort(f.latestDay!)}) — no data for Day ${f.currentDay}`;
    case 'ahead':
      return `Data stamped Day ${f.latestDay} is ahead of calendar Day ${f.currentDay} — verify pipeline clock`;
    case 'empty':
    default:
      return `No data available — no data for Day ${f.currentDay}`;
  }
}

/** Max conflict_day from rows (helper for client-side row sets). */
export function maxConflictDay(rows: ReadonlyArray<{ conflict_day?: number | null }> | null | undefined): number | null {
  let max: number | null = null;
  for (const r of rows ?? []) {
    const d = r?.conflict_day;
    if (typeof d === 'number' && Number.isFinite(d) && (max == null || d > max)) max = d;
  }
  return max;
}
