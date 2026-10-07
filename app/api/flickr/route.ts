import { NextRequest, NextResponse } from 'next/server';

/**
 * Server-side proxy for Flickr public photos feed (avoids CORS in the browser).
 * GET /api/flickr?tags=mena,middleeast
 */
/**
 * Public, visitor-agnostic: the edge cache may answer repeat calls without running the Worker.
 * (No stale-while-revalidate: Cloudflare ignores it when s-maxage is present.)
 */
const EDGE_CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=300' };

export async function GET(request: NextRequest) {
  const tags = request.nextUrl.searchParams.get('tags') ?? 'mena,middleeast';
  const url = `https://api.flickr.com/services/feeds/photos_public.gne?tags=${encodeURIComponent(tags)}&format=json&nojsoncallback=1`;
  try {
    const res = await fetch(url, { next: { revalidate: 120 } });
    if (!res.ok) {
      return NextResponse.json({ error: 'Flickr fetch failed' }, { status: res.status, headers: NO_STORE });
    }
    type FlickrItem = { title: string; media?: { m: string }; link: string; author?: string };
    const data = (await res.json()) as { items?: FlickrItem[] };
    const items = data?.items ?? [];
    const photos = items.map((item) => ({
        title: item.title || 'Untitled',
        thumb: item.media?.m?.replace('_m.', '_z.') || item.media?.m || '',
        full: item.media?.m?.replace('_m.', '_b.') || item.media?.m || '',
        url: item.link || '',
        author: item.author,
      })
    ).filter((p) => p.thumb);
    return NextResponse.json(photos, { headers: EDGE_CACHE });
  } catch (e) {
    console.error('[api/flickr]', e);
    return NextResponse.json({ error: 'Flickr proxy error' }, { status: 502, headers: NO_STORE });
  }
}

/** Error responses must not be cached by the edge (non-200 defaults can reach minutes). */
const NO_STORE = { 'Cache-Control': 'no-store' };
