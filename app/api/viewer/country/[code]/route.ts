/**
 * Paid country-report narrative for the SIGNED-IN visitor, if their tier unlocks it.
 *
 * /countries/[slug] is a cached, tier-agnostic page (summary only, as an anonymous visitor
 * sees it). After hydration it calls this route when the visitor's tier may unlock the
 * narrative; the tier is re-checked here from the session cookie, so a client cannot unlock
 * content by claiming a tier. Per-user response: never stored by a shared cache.
 */
import { NextResponse } from 'next/server';
import { createClient, getUser } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { parseNarrative } from '@/lib/country-narrative';

export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = (rawCode ?? '').toUpperCase();
  if (!/^[A-Z]{2,3}$/.test(code)) {
    return NextResponse.json({ error: 'bad country code' }, { status: 400, headers: PRIVATE });
  }

  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const isEgypt = code === 'EG';
  const isUae = code === 'AE' || code === 'ARE' || code === 'UAE';
  const hasAccess = tierHasFeature(
    user?.tier,
    isEgypt ? 'country_report_egy' : isUae ? 'country_report_uae' : 'country_report_other',
    flags,
  );
  if (!hasAccess) {
    return NextResponse.json({ hasAccess: false, narrative: null }, { headers: PRIVATE });
  }

  const { data: report } = await supabase
    .from('country_reports')
    .select('content_json')
    .eq('country_code', code)
    .order('conflict_day', { ascending: false })
    .limit(1)
    .maybeSingle();
  const narrative = report ? parseNarrative((report as { content_json: unknown }).content_json) : null;
  return NextResponse.json({ hasAccess: true, narrative }, { headers: PRIVATE });
}
