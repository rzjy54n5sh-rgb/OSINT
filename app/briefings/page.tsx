import type { Metadata } from 'next';
import { createClient, getConflictDay } from '@/utils/supabase/server';
import BriefingsClient, { type DayAvailability } from './BriefingsClient';

export const metadata: Metadata = {
  title: 'Daily Intelligence Briefings · MENA Intel Desk',
  description:
    'Every conflict-day briefing from Day 1: general, Horn of Africa, Egypt, UAE, eschatology and business briefs plus weekly digests, with per-paragraph source citations.',
};

const REPORT_ORDER = ['general', 'general_weekly', 'horn', 'egypt', 'uae', 'eschatology', 'business'];
const META_COLS = 'conflict_day, report_type, title, lead, cover_stats, quality, source, generated_at, period_start_day, period_end_day';

interface PageProps {
  searchParams?: Promise<{ day?: string | string[] }>;
}

export default async function BriefingsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  // Calendar day (DAY LOCK) — not derived from any table.
  const currentDay = await getConflictDay();

  // Availability for EVERY day: one tiny row per (day, type). ~210 rows today; the PostgREST
  // cap is 1000 rows/request, so page through it rather than silently truncating.
  const availabilityRows: { conflict_day: number; report_type: string; period_start_day: number | null; period_end_day: number | null }[] = [];
  for (let from = 0; from < 20000; from += 1000) {
    const { data, error } = await supabase
      .from('daily_briefings')
      .select('conflict_day, report_type, period_start_day, period_end_day')
      .order('conflict_day', { ascending: false })
      .order('report_type', { ascending: true })
      .range(from, from + 999);
    if (error || !data) break;
    availabilityRows.push(...(data as typeof availabilityRows));
    if (data.length < 1000) break;
  }

  const byDay = new Map<number, DayAvailability>();
  for (const r of availabilityRows) {
    const d = r.conflict_day as number;
    const e = byDay.get(d) ?? { day: d, types: [], digestFrom: null, digestTo: null };
    e.types.push(r.report_type);
    if (r.report_type === 'general_weekly') {
      e.digestFrom = r.period_start_day ?? null;
      e.digestTo = r.period_end_day ?? d;
    }
    byDay.set(d, e);
  }
  const availability = [...byDay.values()].sort((a, b) => b.day - a.day);
  const latestBriefingDay = availability[0]?.day ?? null;

  // Initial day: ?day=N when valid, else the calendar day, else the latest day that has briefs.
  const sp = searchParams ? await searchParams : undefined;
  const rawDay = Array.isArray(sp?.day) ? sp?.day[0] : sp?.day;
  const requested = rawDay && /^[1-9]\d{0,3}$/.test(rawDay) ? Number(rawDay) : null;
  let effectiveDay = requested != null && requested <= currentDay ? requested : currentDay;
  if (requested == null && !byDay.has(currentDay) && latestBriefingDay != null) {
    // Calendar day has no briefs yet — show the latest available day (client labels this).
    effectiveDay = latestBriefingDay;
  }

  const { data } = await supabase
    .from('daily_briefings')
    .select(META_COLS)
    .eq('conflict_day', effectiveDay)
    .in('report_type', REPORT_ORDER);

  return (
    <BriefingsClient
      initialBriefings={data ?? []}
      conflictDay={effectiveDay}
      currentDay={currentDay}
      latestBriefingDay={latestBriefingDay}
      availability={availability}
    />
  );
}
