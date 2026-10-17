'use client';

import { currentConflictDay } from '@/lib/conflict-calendar';
import { useJudgeTime } from '@/components/ui/RenderClock';

/**
 * Current conflict day — DAY LOCK (CLAUDE.md rule 1): pure UTC calendar.
 *
 * This hook previously returned MAX(conflict_day) from nai_scores. nai_scores is
 * written by one pipeline stage and can be frozen for weeks (it was frozen at
 * Day 35 while daily_briefings and market_data advanced to Day 220), which froze
 * the header, the War Room and the Feed at Day 35. The day is now a pure function
 * of the calendar; sections that need "latest day with data" max over their OWN
 * table and label stale data (see components/ui/DataAsOf.tsx).
 *
 * Clock: the server render time on first paint (RenderClock), so HTML rendered at 23:59 and hydrated
 * after midnight does not mismatch (#418); the real clock after mount.
 */
export function useConflictDay(): number {
  return currentConflictDay(new Date(useJudgeTime()));
}
