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

const WEEKDAYS_GB = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS_GB = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** "Tuesday 13 October 2026" (UTC; built by hand so it does not depend on the runtime's ICU data). */
export function formatConflictDayDateGb(conflictDay: number): string {
  const d = conflictDayToUtcDate(conflictDay);
  return `${WEEKDAYS_GB[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_GB[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
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

export type FreshnessStatus = 'current' | 'pending' | 'stale' | 'empty' | 'ahead';

/**
 * Publishing schedule (UTC "HH:MM"). The conflict day rolls over at 00:00 UTC, but each day's data is
 * written later by the daily build, so for a few hours every night the newest data is legitimately
 * yesterday's. Inside that window the section is "pending" (a calm note); only after the deadline, or
 * when the gap is 2+ days, is it "stale" (the warning). If the build fails, the deadline flips it to stale.
 */
export interface PublishSchedule {
  /** When the day's data normally lands; shown to readers as "publishes around …". */
  typicalUtc: string;
  /** After this time a missing day is a real gap (stale). */
  deadlineUtc: string;
}

/**
 * Daily build: cron 01:45 UTC, edition cut-off 01:30 UTC. Observed writes (Days 228–231): general brief
 * 01:56–02:01 UTC, War Posture 02:02–02:10 UTC, first market row 00:02–02:08 UTC.
 */
export const BRIEF_PUBLISH_TYPICAL_UTC = '02:00';
/** 2 h buffer over the normal ~02:10 UTC publish time. */
export const BRIEF_PUBLISH_DEADLINE_UTC = '04:00';
export const DAILY_BUILD_SCHEDULE: PublishSchedule = {
  typicalUtc: BRIEF_PUBLISH_TYPICAL_UTC,
  deadlineUtc: BRIEF_PUBLISH_DEADLINE_UTC,
};

/**
 * Scenario odds are NOT written by the 02:00 build: scenario-daily (market-anchored-v1) published
 * Days 226–231 between 09:56 and 13:17 UTC (scenario_runs.recorded_at). Telling readers "around
 * 02:00 UTC" would be false, so scenarios carry their own schedule (deadline covers the latest
 * observed run with a buffer).
 */
export const SCENARIO_PUBLISH_TYPICAL_UTC = '10:00';
export const SCENARIO_PUBLISH_DEADLINE_UTC = '14:00';
export const SCENARIO_SCHEDULE: PublishSchedule = {
  typicalUtc: SCENARIO_PUBLISH_TYPICAL_UTC,
  deadlineUtc: SCENARIO_PUBLISH_DEADLINE_UTC,
};

/** Schedule for a DataAsOf section name ("SCENARIOS" → scenario run; everything else → daily build). */
export function publishScheduleFor(section: string): PublishSchedule {
  return section.trim().toUpperCase() === 'SCENARIOS' ? SCENARIO_SCHEDULE : DAILY_BUILD_SCHEDULE;
}

/** Minutes after 00:00 for "HH:MM" (throws on a malformed constant). */
export function utcClockMinutes(hhmm: string): number {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!m) throw new Error(`bad UTC clock time: ${hhmm}`);
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface SectionFreshness {
  status: FreshnessStatus;
  /** Latest conflict_day present in the section's own table (null = no rows). */
  latestDay: number | null;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
  /** currentDay − latestDay (null when empty). */
  lagDays: number | null;
  /** The schedule the verdict was taken against. */
  schedule: PublishSchedule;
}

export interface FreshnessOptions {
  /** The instant to judge at (tests pass a fixed clock). Defaults to now. */
  now?: Date;
  /** Defaults to the daily build (BRIEF_PUBLISH_DEADLINE_UTC). */
  schedule?: PublishSchedule;
}

/**
 * Compare a section's own latest day with the calendar day.
 * - current: the section has data for today
 * - pending: newest data is yesterday's, today IS `now`'s calendar day, and it is before the
 *            publish deadline → expected schedule, a neutral note ("publishes around …")
 * - stale:   newest data is older than that (past the deadline, or 2+ days behind) → "Latest available"
 * - empty:   the section has no rows at all
 * - ahead:   data stamped later than the calendar (clock/pipeline error) → flagged, never silently shown
 */
export function sectionFreshness(
  latestDay: number | null | undefined,
  currentDay?: number,
  opts: FreshnessOptions = {}
): SectionFreshness {
  const now = opts.now ?? new Date();
  const schedule = opts.schedule ?? DAILY_BUILD_SCHEDULE;
  const today = currentDay ?? currentConflictDay(now);
  if (latestDay == null || !Number.isFinite(latestDay) || latestDay < 1) {
    return { status: 'empty', latestDay: null, currentDay: today, lagDays: null, schedule };
  }
  const lagDays = today - latestDay;
  let status: FreshnessStatus;
  if (lagDays === 0) status = 'current';
  else if (lagDays < 0) status = 'ahead';
  else if (
    lagDays === 1 &&
    // A currentDay from an older render (e.g. cached before midnight) must not reopen the window.
    currentConflictDay(now) === today &&
    now.getUTCHours() * 60 + now.getUTCMinutes() < utcClockMinutes(schedule.deadlineUtc)
  )
    status = 'pending';
  else status = 'stale';
  return { status, latestDay, currentDay: today, lagDays, schedule };
}

/**
 * Human label for a section's freshness. Exact wording for the degraded state is a product requirement.
 * `noun` names what is expected in the pending note ("brief", "market data" …). The pending note says
 * "publishes around", never "published": it describes the schedule, not an event that happened.
 */
export function freshnessLabel(f: SectionFreshness, noun = 'update'): string {
  switch (f.status) {
    case 'current':
      return `DAY ${f.currentDay} (${formatConflictDayShort(f.currentDay)}) — CURRENT`;
    case 'pending':
      return `Day ${f.currentDay} ${noun} publishes around ${f.schedule.typicalUtc} UTC. Showing Day ${f.latestDay} (${formatConflictDayShort(f.latestDay!)}).`;
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
