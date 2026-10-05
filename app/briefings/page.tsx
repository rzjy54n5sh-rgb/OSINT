import { createClient, getConflictDay } from '@/utils/supabase/server';
import BriefingsClient from './BriefingsClient';

const REPORT_ORDER = ['general', 'egypt', 'uae', 'eschatology', 'business'];

export default async function BriefingsPage() {
  const supabase = await createClient();
  // Calendar day (DAY LOCK) — not derived from any table.
  const currentDay = await getConflictDay();

  // Fetch available days and the calendar day's briefings in parallel
  const [daysResult, briefingsResult] = await Promise.all([
    supabase
      .from('daily_briefings')
      .select('conflict_day')
      .order('conflict_day', { ascending: false }),
    supabase
      .from('daily_briefings')
      .select('conflict_day, report_type, title, lead, cover_stats, quality, source, generated_at')
      .eq('conflict_day', currentDay)
      .in('report_type', REPORT_ORDER),
  ]);

  // Deduplicate and sort available days (desc) — daily_briefings' OWN days.
  const availableDays = daysResult.data
    ? [...new Set(daysResult.data.map((r) => r.conflict_day as number))]
    : [];
  const latestBriefingDay = availableDays[0] ?? null;

  // If the calendar day has no briefings, show the latest available day — and say so
  // (BriefingsClient renders the "Latest available: Day N — no data for Day <today>" label).
  let effectiveDay = currentDay;
  let briefings = briefingsResult.data ?? [];

  if (briefings.length === 0 && latestBriefingDay != null && latestBriefingDay !== currentDay) {
    effectiveDay = latestBriefingDay;
    const { data } = await supabase
      .from('daily_briefings')
      .select('conflict_day, report_type, title, lead, cover_stats, quality, source, generated_at')
      .eq('conflict_day', effectiveDay)
      .in('report_type', REPORT_ORDER);
    briefings = data ?? [];
  }

  return (
    <BriefingsClient
      initialBriefings={briefings}
      conflictDay={effectiveDay}
      currentDay={currentDay}
      latestBriefingDay={latestBriefingDay}
      availableDays={availableDays}
    />
  );
}
