/**
 * Embeddable widget (iframe) — headline + first 3 sourced bullets of the latest brief of a type:
 * /embed/brief/latest?type=overnight (default). Any routable brief type is accepted (lib/brief-types.ts).
 * Read with the cookie-less public client (lib/seo-feed.ts latestBriefOfType). Framing headers: middleware.ts.
 */
import type { NextRequest } from 'next/server';
import { ROUTABLE_BRIEF_TYPES } from '@/lib/brief-types';
import { latestBriefOfType } from '@/lib/seo-feed';
import { briefEmbedView, renderBriefEmbed } from '@/lib/embed/brief';
import { embedMessagePage, embedResponse } from '@/lib/embed/html';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const type = (request.nextUrl.searchParams.get('type') ?? 'overnight').trim();
  if (!(ROUTABLE_BRIEF_TYPES as readonly string[]).includes(type)) {
    return embedResponse(embedMessagePage('Brief', 'Unknown brief type. See /embed for the codes.', '/briefings', 'All briefs'), { status: 404 });
  }
  const { brief, error } = await latestBriefOfType(type);
  if (error) {
    return embedResponse(embedMessagePage('Brief', 'Briefs are temporarily unavailable.', '/briefings', 'All briefs'), { status: 503 });
  }
  return embedResponse(renderBriefEmbed(briefEmbedView(brief, type, new Date())));
}
