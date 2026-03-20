/** Calendar date for conflict day index (Day 1 = 2026-02-28 UTC). */
export function conflictDayToUtcDate(conflictDay: number): Date {
  const d = new Date(Date.UTC(2026, 1, 28));
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
