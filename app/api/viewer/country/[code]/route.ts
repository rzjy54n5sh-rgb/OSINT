/**
 * Tier-gated parts of /countries/[slug] for the SIGNED-IN visitor:
 *  - the paid country-report narrative (country_report_* features), and
 *  - the War Posture row with the latent band / gap / category when nai_latent_score /
 *    nai_gap_analysis allow it.
 *
 * /countries/[slug] is a cached, tier-agnostic page built at ANONYMOUS access. After hydration
 * it calls this route when the visitor's tier may unlock more; the tier is re-checked here from
 * the session cookie, so a client cannot unlock content by claiming a tier. Per-user response:
 * never stored by a shared cache.
 */
import { NextResponse } from 'next/server';
import { createClient, getUser } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { parseNarrative } from '@/lib/country-narrative';
import { getNaiV2CountryLatest } from '@/lib/nai-v2';
import { getViewerCountryReport, narrativeUnlocked } from '@/lib/country-report';

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
  const postureAccess = {
    latent: tierHasFeature(user?.tier, 'nai_latent_score', flags),
    gap: tierHasFeature(user?.tier, 'nai_gap_analysis', flags),
  };

  // viewer_country_report re-derives the tier from the session JWT in SQL; the narrative is shown
  // only when that AND the app's own tier check agree. Pre-migration: old table read (content_json
  // selected only when hasAccess).
  const [reportRes, posture] = await Promise.all([
    hasAccess ? getViewerCountryReport(supabase, code, { withContent: true }) : Promise.resolve({ data: null }),
    getNaiV2CountryLatest(supabase, code, postureAccess),
  ]);
  const report = reportRes.data;
  const narrative = narrativeUnlocked(hasAccess, report) ? parseNarrative(report!.content_json) : null;
  // If the database (RPC) refuses the narrative, report it as locked rather than as an empty unlock.
  const effectiveAccess = hasAccess && report?.has_access !== false;
  return NextResponse.json(
    { hasAccess: effectiveAccess, narrative, posture, postureAccess },
    { headers: PRIVATE },
  );
}
