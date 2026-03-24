import { createClient, getConflictDay } from '@/utils/supabase/server';
import BriefingsClient from './BriefingsClient';

const REPORT_ORDER = ['general', 'egypt', 'uae', 'eschatology', 'business'];

export default async function BriefingsPage() {
  const supabase = await createClient();
  const conflictDay = await getConflictDay();

  // Fetch available days and latest day's briefings in parallel
  const [daysResult, briefingsResult] = await Promise.all([
    supabase
      .from('daily_briefings')
      .select('conflict_day')
      .order('conflict_day', { ascending: false }),
    supabase
      .from('daily_briefings')
      .select('conflict_day, report_type, title, lead, cover_stats, quality, source, generated_at')
      .eq('conflict_day', conflictDay)
      .in('report_type', REPORT_ORDER),
  ]);

  // Deduplicate and sort available days
  const availableDays = daysResult.data
    ? [...new Set(daysResult.data.map((r) => r.conflict_day as number))]
    : [];

  // If the conflictDay from RPC doesn't have briefings, use the first available day
  let effectiveDay = conflictDay;
  let briefings = briefingsResult.data ?? [];

  if (briefings.length === 0 && availableDays.length > 0 && !availableDays.includes(conflictDay)) {
    effectiveDay = availableDays[0];
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
      availableDays={availableDays}
    />
  );
}
