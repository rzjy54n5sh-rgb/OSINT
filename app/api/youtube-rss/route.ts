import { NextRequest, NextResponse } from 'next/server';
import { isAllowedYouTubeChannelId } from '@/lib/youtube-channels';

/**
 * Server-side proxy for YouTube channel RSS (avoids CORS and unreliable third-party proxies).
 * GET /api/youtube-rss?channelId=UCNye-wNBqNL5ZzHSJj3l8Bg
 * Only channel ids in lib/youtube-channels.ts are accepted.
 */
export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400, headers: NO_STORE });
  }
  if (!isAllowedYouTubeChannelId(channelId)) {
    return NextResponse.json({ error: 'channelId not allowed' }, { status: 400 });
  }
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
  try {
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OSINT/1)' },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'YouTube RSS fetch failed' }, { status: res.status, headers: NO_STORE });
    }
    const xml = await res.text();
    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        // Public, visitor-agnostic: the edge cache may answer repeat calls without the Worker.
        'Cache-Control': 'public, max-age=0, s-maxage=300',
      },
    });
  } catch (e) {
    console.error('[api/youtube-rss]', e);
    return NextResponse.json({ error: 'YouTube RSS proxy error' }, { status: 502, headers: NO_STORE });
  }
}

/** Error responses must not be cached by the edge (non-200 defaults can reach minutes). */
const NO_STORE = { 'Cache-Control': 'no-store' };
