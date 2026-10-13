/**
 * Embeddable widget (iframe) — War Posture rows for one conflict: /embed/posture?conflict=us-iran.
 * Same board as /nai (lib/posture.ts getPostureBoard), read with the cookie-less public client at the
 * anonymous tier (expressed side only; SQL viewer functions and the mappers gate the rest). EG / AE / SA
 * never get a grade; Yemen shows two lines (lib/embed/posture.ts). Framing headers: middleware.ts.
 */
import type { NextRequest } from 'next/server';
import { createPublicClient } from '@/utils/supabase/server';
import { POSTURE_PANEL_CONFLICT, getPostureBoard } from '@/lib/posture';
import { conflictParam, isKnownConflict, postureEmbedView, renderPostureEmbed } from '@/lib/embed/posture';
import { EMBED_ERROR_CACHE_CONTROL, embedMessagePage, embedResponse } from '@/lib/embed/html';

export const dynamic = 'force-dynamic';

const ANON = { latent: false, gap: false };

const unknownConflict = () =>
  embedResponse(embedMessagePage('War Posture', 'Unknown conflict. See /embed for the codes.', '/nai', 'War Posture board'), { status: 404 });

export async function GET(request: NextRequest) {
  const conflict = conflictParam(request.nextUrl.searchParams.get('conflict'), POSTURE_PANEL_CONFLICT);
  // Malformed codes never reach Supabase (OpenNext answers 404s with no-store, so they are never edge-cached).
  if (!conflict) return unknownConflict();
  try {
    const board = await getPostureBoard(createPublicClient(), { access: ANON });
    if (!isKnownConflict(board, conflict)) return unknownConflict();
    const view = postureEmbedView(board, conflict);
    // An empty board can also mean Supabase was unreachable (getPostureBoard never throws): cache it briefly.
    return embedResponse(renderPostureEmbed(view), view.lines.length === 0 ? { cacheControl: EMBED_ERROR_CACHE_CONTROL } : {});
  } catch {
    return embedResponse(embedMessagePage('War Posture', 'War Posture data is temporarily unavailable.', '/nai', 'War Posture board'), { status: 503 });
  }
}
