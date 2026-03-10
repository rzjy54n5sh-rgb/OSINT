import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for YouTube channel RSS (avoids CORS and unreliable third-party proxies).
 * GET /api/youtube-rss?channelId=UC88nx0Rq6V3bAHfMd4vNogg
 */
export async function GET(request: NextRequest) {
  const channelId = request.nextUrl.searchParams.get('channelId');
  if (!channelId) {
    return NextResponse.json({ error: 'channelId required' }, { status: 400 });
  }
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  try {
    const res = await fetch(rssUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; OSINT/1)' },
      next: { revalidate: 300 },
    });
    if (!res.ok) {
      return NextResponse.json({ error: 'YouTube RSS fetch failed' }, { status: res.status });
    }
    const xml = await res.text();
    return new NextResponse(xml, {
      headers: { 'Content-Type': 'application/xml' },
    });
  } catch (e) {
    console.error('[api/youtube-rss]', e);
    return NextResponse.json({ error: 'YouTube RSS proxy error' }, { status: 502 });
  }
}
