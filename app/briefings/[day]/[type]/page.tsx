import { createClient, getConflictDay } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import BriefingReader from './BriefingReader';

/** Report types that exist (lower-case, case-sensitive in the URL). */
const VALID_TYPES = ['general', 'general_weekly', 'horn', 'egypt', 'uae', 'eschatology', 'business'] as const;

const TYPE_TITLES: Record<string, string> = {
  general: 'General Intelligence Brief',
  general_weekly: 'Weekly General Digest',
  horn: 'Horn of Africa & Red Sea Brief',
  egypt: 'Egypt Country Brief',
  uae: 'UAE Country Brief',
  eschatology: 'Eschatology & Geopolitics Brief',
  business: 'Business Opportunities Brief',
};

interface PageProps {
  params: Promise<{ day: string; type: string }>;
}

/** Strict positive-integer parse: "12abc", "1e2", "-1", "0", " 5" -> null. */
function parseDay(raw: string): number | null {
  if (!/^[1-9]\d{0,3}$/.test(raw)) return null;
  return Number(raw);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { day: dayStr, type } = await params;
  const day = parseDay(dayStr);
  if (day == null || !(VALID_TYPES as readonly string[]).includes(type)) {
    return { title: 'Briefing not found · MENA Intel Desk' };
  }
  return {
    title: `Day ${day} ${TYPE_TITLES[type]} · MENA Intel Desk`,
    description: `${TYPE_TITLES[type]} for conflict day ${day}, with per-paragraph source citations.`,
  };
}

export default async function BriefingReaderPage({ params }: PageProps) {
  const { day: dayStr, type } = await params;
  const day = parseDay(dayStr);
  if (day == null || !(VALID_TYPES as readonly string[]).includes(type)) return notFound();

  // A day in the future of the calendar can never have a brief.
  const currentDay = await getConflictDay();
  if (day > currentDay) return notFound();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_briefings')
    .select('*')
    .eq('conflict_day', day)
    .eq('report_type', type)
    .maybeSingle();

  // A real database failure is a 5xx, not a missing brief.
  if (error) throw new Error(`daily_briefings read failed: ${error.message}`);
  // Unknown row -> real 404 (not a 200 "NO BRIEFING AVAILABLE" soft-404).
  if (!data) return notFound();

  // GATING (not enforced yet - Omar decides): business briefs are Pro-only on /pricing
  // (tier_features key `business_report`, free=false informed=false pro=true). See PR body.
  return <BriefingReader briefing={data} day={day} type={type} />;
}
