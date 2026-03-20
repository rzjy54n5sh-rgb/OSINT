/** Calendar start of conflict-day counter (matches pipeline: 2026-02-28). */
export const CONFLICT_START = '2026-02-28';

/**
 * Conflict day index: (UTC calendar date − Feb 28 2026) + 1, minimum 1.
 * Use where UTC calendar alignment with the pipeline is required.
 */
export function getConflictDayNumber(d = new Date()): number {
  const startUtc = Date.UTC(2026, 1, 28);
  const dayUtc = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const days = Math.floor((dayUtc - startUtc) / 86400000) + 1;
  return Math.max(1, days);
}

/** Local calendar day offset from CONFLICT_START + 1 (matches Prompt 2 / live badge spec). */
export function getConflictDay(): number {
  const start = new Date(CONFLICT_START);
  const now = new Date();
  const raw = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(1, raw);
}

export function getFormattedConflictDate(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}
