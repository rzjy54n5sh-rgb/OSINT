/**
 * Embeddable widget (iframe) — chokepoint transits from data/chokepoints/latest.json (bundled at build; the
 * file changes weekly with a commit, which redeploys). Staleness is evaluated per request against the card
 * gate. Framing headers: middleware.ts (/embed/* only). Snippets: /embed.
 */
import latest from '@/data/chokepoints/latest.json';
import { chokepointsEmbedView, renderChokepointsEmbed } from '@/lib/embed/chokepoints';
import { embedResponse } from '@/lib/embed/html';

export const dynamic = 'force-dynamic';

export async function GET() {
  const view = chokepointsEmbedView(latest, new Date());
  return embedResponse(renderChokepointsEmbed(view), view.state === 'invalid' ? { cacheControl: 'public, max-age=60, s-maxage=300' } : {});
}
