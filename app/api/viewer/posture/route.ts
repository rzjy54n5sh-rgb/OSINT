/**
 * War Posture board (v2 per conflict, or the v1 fallback) at the SIGNED-IN visitor's tier and/or for a
 * `?day=N`. /nai itself is cached and rendered at the anonymous tier for the latest day; NaiViewer
 * calls this after hydration only when the visitor's tier unlocks more or a historical day is wanted.
 * Reads the session cookie: per-user, never stored by a shared cache.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { createClient, getUser } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { currentConflictDayUtc, getPostureBoard } from '@/lib/posture';
import { parseDayParam } from '@/lib/posture-board';
import { postureSourceLabels } from '@/lib/posture-outlets';

export const dynamic = 'force-dynamic';

const PRIVATE = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  // 1 … today; anything else (0, future, malformed) is the latest board.
  const day = parseDayParam(request.nextUrl.searchParams.get('day'), currentConflictDayUtc());
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const { data: tierRows } = await supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const access = {
    latent: tierHasFeature(user?.tier, 'nai_latent_score', flags),
    gap: tierHasFeature(user?.tier, 'nai_gap_analysis', flags),
  };
  // Tier gating happens in SQL (viewer_posture_v2 / viewer_nai_v2) AND in the mappers, server-side.
  const board = await getPostureBoard(supabase, { day, access, withDays: true });
  // Outlet names for the source links (outlet_aliases / outlets, public read).
  const labels = await postureSourceLabels(board);
  return NextResponse.json({ ...board, labels }, { headers: PRIVATE });
}
