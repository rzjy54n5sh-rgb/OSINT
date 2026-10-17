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
 * Publishing schedule. Two kinds:
 *  - daily (UTC "HH:MM"): the conflict day rolls over at 00:00 UTC, but the day's data is written later,
 *    so for a few hours every night the newest data is legitimately yesterday's. Inside that window the
 *    section is "pending" (a calm note); only after the deadline, or when the gap is 2+ days, is it
 *    "stale" (the warning). If the writer fails, the deadline flips it to stale.
 *  - continuous: no daily publish (the feed ingests articles all day). Judged by the age of the newest
 *    item, like the header's stale badge; never "publishes around".
 */
export type PublishSchedule =
  | {
      kind: 'daily';
      /** When the day's data normally lands; shown to readers as "publishes around …". */
      typicalUtc: string;
      /** After this time a missing day is a real gap (stale). */
      deadlineUtc: string;
    }
  | {
      kind: 'continuous';
      /** Stale when the newest item is older than this. */
      maxAgeHours: number;
    };
export type DailySchedule = Extract<PublishSchedule, { kind: 'daily' }>;

/**
 * Daily build: cron 01:45 UTC, edition cut-off 01:30 UTC. Observed writes (Days 228–231): general brief
 * 01:56–02:01 UTC, War Posture 02:02–02:10 UTC, first market row 00:02–02:08 UTC.
 */
export const BRIEF_PUBLISH_TYPICAL_UTC = '02:00';
/** 2 h buffer over the normal ~02:10 UTC publish time. */
export const BRIEF_PUBLISH_DEADLINE_UTC = '04:00';
export const DAILY_BUILD_SCHEDULE: DailySchedule = {
  kind: 'daily',
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
export const SCENARIO_SCHEDULE: DailySchedule = {
  kind: 'daily',
  typicalUtc: SCENARIO_PUBLISH_TYPICAL_UTC,
  deadlineUtc: SCENARIO_PUBLISH_DEADLINE_UTC,
};

/**
 * Social trends (collect-social): the first social_trends row of Days 221–231 landed between 03:04 and
 * 05:24 UTC (never in the 02:00 hour), so social says "around 04:00" with a 07:00 deadline.
 */
export const SOCIAL_PUBLISH_TYPICAL_UTC = '04:00';
export const SOCIAL_PUBLISH_DEADLINE_UTC = '07:00';
export const SOCIAL_SCHEDULE: DailySchedule = {
  kind: 'daily',
  typicalUtc: SOCIAL_PUBLISH_TYPICAL_UTC,
  deadlineUtc: SOCIAL_PUBLISH_DEADLINE_UTC,
};

/**
 * Articles are stale when the newest published_at is older than this many hours (the header's stale
 * badge uses the same value: lib/data-freshness.ts re-exports it). 12 h, not 6 h: the scheduled GitHub
 * Actions "hourly" feeds cron only fires every ~4–7 h in practice, so 6 h flags normal gaps.
 */
export const ARTICLE_STALE_HOURS = 12;
export const FEED_SCHEDULE: PublishSchedule = { kind: 'continuous', maxAgeHours: ARTICLE_STALE_HOURS };

/** Schedule for a DataAsOf section name. */
export function publishScheduleFor(section: string): PublishSchedule {
  switch (section.trim().toUpperCase()) {
    case 'SCENARIOS':
      return SCENARIO_SCHEDULE;
    case 'SOCIAL':
      return SOCIAL_SCHEDULE;
    case 'FEED':
      return FEED_SCHEDULE;
    default:
      return DAILY_BUILD_SCHEDULE;
  }
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
  /** Calendar day judged against (DAY LOCK): the later of the caller's day and `now`'s day. */
  currentDay: number;
  /** currentDay − latestDay (null when empty). */
  lagDays: number | null;
  /** The schedule the verdict was taken against. */
  schedule: PublishSchedule;
  /** Continuous sections: newest item timestamp and its age in hours (null when unknown). */
  latestAt?: string | null;
  ageHours?: number | null;
}

export interface FreshnessOptions {
  /** The instant to judge at (tests pass a fixed clock). Defaults to now. */
  now?: Date;
  /** Defaults to the daily build (BRIEF_PUBLISH_DEADLINE_UTC). */
  schedule?: PublishSchedule;
  /** Continuous sections: ISO timestamp of the newest item (e.g. articles.published_at). */
  latestAt?: string | null;
}

/**
 * Compare a section's own latest day with the calendar day.
 * - current: the section has data for today (continuous: newest item within maxAgeHours)
 * - pending: (daily only) newest data is yesterday's, the day judged is `now`'s calendar day, and it is
 *            before the publish deadline → expected schedule, a neutral note ("publishes around …")
 * - stale:   newest data is older than that (past the deadline, 2+ days behind, or too old)
 * - empty:   the section has no rows at all
 * - ahead:   data stamped later than the calendar (clock/pipeline error) → flagged, never silently shown
 *
 * The day judged is max(currentDay, currentConflictDay(now)): a currentDay from a render cached before
 * midnight can never make yesterday's data read "current" on the new day.
 */
export function sectionFreshness(
  latestDay: number | null | undefined,
  currentDay?: number,
  opts: FreshnessOptions = {}
): SectionFreshness {
  const now = opts.now ?? new Date();
  const schedule = opts.schedule ?? DAILY_BUILD_SCHEDULE;
  const clockDay = currentConflictDay(now);
  const today = currentDay != null && Number.isFinite(currentDay) ? Math.max(currentDay, clockDay) : clockDay;

  if (schedule.kind === 'continuous') {
    const t = opts.latestAt ? Date.parse(opts.latestAt) : NaN;
    if (Number.isFinite(t)) {
      const ageHours = (now.getTime() - t) / 36e5;
      const day = latestDay != null && Number.isFinite(latestDay) && latestDay >= 1 ? latestDay : null;
      const base = { latestDay: day, currentDay: today, lagDays: day == null ? null : today - day, schedule, latestAt: opts.latestAt, ageHours };
      // 5 min of clock skew tolerated; a newest item further in the future is a pipeline clock error.
      if (ageHours < -5 / 60) return { status: 'ahead', ...base };
      return { status: ageHours > schedule.maxAgeHours ? 'stale' : 'current', ...base };
    }
    // No usable timestamp: judge by day only, with no publish window (there is no daily publish).
  }

  if (latestDay == null || !Number.isFinite(latestDay) || latestDay < 1) {
    return { status: 'empty', latestDay: null, currentDay: today, lagDays: null, schedule };
  }
  const lagDays = today - latestDay;
  let status: FreshnessStatus;
  if (lagDays === 0) status = 'current';
  else if (lagDays < 0) status = 'ahead';
  else if (
    schedule.kind === 'daily' &&
    lagDays === 1 &&
    today === clockDay &&
    now.getUTCHours() * 60 + now.getUTCMinutes() < utcClockMinutes(schedule.deadlineUtc)
  )
    status = 'pending';
  else status = 'stale';
  return { status, latestDay, currentDay: today, lagDays, schedule };
}

/** "Oct 16, 2026 21:05 UTC" for an ISO timestamp. */
export function formatUtcDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${date} ${d.toISOString().slice(11, 16)} UTC`;
}

/**
 * Human label for a section's freshness. Exact wording for the degraded state is a product requirement.
 * `noun` names what is expected in the pending note ("brief", "market data" …); `plural` picks the verb
 * ("briefs publish", "brief publishes"). The pending note says "publish(es) around", never "published":
 * it describes the schedule, not an event that happened. Continuous sections never get a pending note.
 */
export function freshnessLabel(f: SectionFreshness, noun = 'update', plural = false): string {
  switch (f.status) {
    case 'current':
      return `DAY ${f.currentDay} (${formatConflictDayShort(f.currentDay)}) — CURRENT`;
    case 'pending': {
      const at = f.schedule.kind === 'daily' ? f.schedule.typicalUtc : '';
      return `Day ${f.currentDay} ${noun} ${plural ? 'publish' : 'publishes'} around ${at} UTC. Showing Day ${f.latestDay} (${formatConflictDayShort(f.latestDay!)}).`;
    }
    case 'stale':
      if (f.ageHours != null && f.latestAt) {
        const where = f.latestDay != null ? `Latest available: Day ${f.latestDay} (${formatConflictDayShort(f.latestDay)}) — ` : '';
        return `${where}newest item ${Math.floor(f.ageHours)} h old (${formatUtcDateTime(f.latestAt)})`;
      }
      return `Latest available: Day ${f.latestDay} (${formatConflictDayShort(f.latestDay!)}) — no data for Day ${f.currentDay}`;
    case 'ahead':
      if (f.ageHours != null && f.latestAt)
        return `Newest item is stamped ${formatUtcDateTime(f.latestAt)}, ahead of the clock — verify pipeline clock`;
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
