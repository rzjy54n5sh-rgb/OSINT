/**
 * War Posture board (v2 per conflict, or the v1 fallback) at the SIGNED-IN visitor's tier and/or for a
 * `?day=N`. /nai itself is cached and rendered at the anonymous tier for the latest day; NaiViewer
 * calls this after hydration only when the visitor's tier unlocks more or a historical day is wanted.
 * Reads the session cookie: per-user, never stored by a shared cache.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getUser } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { getPostureBoard } from '@/lib/posture';

export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get('day');
  const day = raw && /^[1-9]\d{0,3}$/.test(raw) ? Number(raw) : null;
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const { data: tierRows } = await supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const access = {
    latent: tierHasFeature(user?.tier, 'nai_latent_score', flags),
    gap: tierHasFeature(user?.tier, 'nai_gap_analysis', flags),
  };
  // Tier gating happens in SQL (viewer_posture_v2 / viewer_nai_v2) AND in the mappers, server-side.
  const board = await getPostureBoard(supabase, { day, access });
  return NextResponse.json(board, { headers: PRIVATE });
}
