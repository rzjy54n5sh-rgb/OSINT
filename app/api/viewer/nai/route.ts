/**
 * War Posture rows for /nai at the SIGNED-IN visitor's tier (latent band / gap / category only
 * when tier_features allows), or for any `?day=N`.
 *
 * /nai itself is a cached, tier-agnostic page that always shows the latest day at the
 * anonymous tier. This route is what the page calls after hydration when the visitor's tier
 * unlocks more, or when a historical `?day=N` is requested. It reads the session cookie, so it
 * is per-user and must never be stored by a shared cache.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getUser, getConflictDay } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { getNaiV2Day, getNaiV2DayRange } from '@/lib/nai-v2';

export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('day');
  const dayParam = raw && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : null;

  const [user, supabase, currentDay] = await Promise.all([getUser(), createClient(), getConflictDay()]);
  const [{ firstDay, latestDay }, { data: tierRows }] = await Promise.all([
    getNaiV2DayRange(supabase),
    supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access'),
  ]);
  const flags = buildTierFlags(tierRows ?? []);
  const hasLatentAccess = tierHasFeature(user?.tier, 'nai_latent_score', flags);
  const hasGapAccess = tierHasFeature(user?.tier, 'nai_gap_analysis', flags);
  const conflictDay = dayParam ?? latestDay ?? currentDay;

  // Tier gating is applied here, server-side, so locked fields never reach the client.
  const rows =
    latestDay != null ? await getNaiV2Day(supabase, conflictDay, { latent: hasLatentAccess, gap: hasGapAccess }) : [];

  return NextResponse.json(
    { rows, conflictDay, latestDay, firstDay, hasLatentAccess, hasGapAccess },
    { headers: PRIVATE },
  );
}
