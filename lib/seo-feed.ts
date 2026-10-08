/**
 * Shared reads for the sitemap and RSS feed. Public columns only, one Supabase client per request
 * (createPublicClient is request-scoped), never throws: an unreachable or unconfigured database
 * yields an empty list so the static part of the sitemap / an empty feed is still served.
 */
import { createPublicClient } from '@/utils/supabase/server';
import { ROUTABLE_BRIEF_TYPES } from '@/lib/site';

export type FeedBrief = {
  conflict_day: number;
  report_type: string;
  title: string | null;
  lead: string | null;
  generated_at: string | null;
};

const FEED_COLUMNS = 'conflict_day, report_type, title, lead, generated_at';

function supabaseConfigured(): boolean {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  return Boolean(url && key);
}

/** Briefs with conflict_day >= fromDay, newest first (routable types only). */
export async function briefsSinceDay(fromDay: number): Promise<FeedBrief[]> {
  if (!supabaseConfigured()) return [];
  try {
    const { data, error } = await createPublicClient()
      .from('daily_briefings')
      .select(FEED_COLUMNS)
      .in('report_type', [...ROUTABLE_BRIEF_TYPES])
      .gte('conflict_day', fromDay)
      .order('conflict_day', { ascending: false })
      .order('report_type', { ascending: true })
      .limit(1000);
    if (error || !data) return [];
    return data as FeedBrief[];
  } catch {
    return [];
  }
}

/** The latest `limit` briefs by generated_at (routable types only). */
export async function latestBriefs(limit: number): Promise<FeedBrief[]> {
  if (!supabaseConfigured()) return [];
  try {
    const { data, error } = await createPublicClient()
      .from('daily_briefings')
      .select(FEED_COLUMNS)
      .in('report_type', [...ROUTABLE_BRIEF_TYPES])
      .not('generated_at', 'is', null)
      .order('generated_at', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return data as FeedBrief[];
  } catch {
    return [];
  }
}

export function briefPath(b: Pick<FeedBrief, 'conflict_day' | 'report_type'>): string {
  return `/briefings/${b.conflict_day}/${b.report_type}`;
}
