import { NextRequest, NextResponse } from 'next/server';
import { isAllowedYouTubeChannelId } from '@/lib/youtube-channels';

export interface LiveChannelResult {
  channelId: string;
  videoId: string | null;
  isLive: boolean;
}

/**
 * Resolves current live video IDs for YouTube channel IDs using YouTube Data API v3.
 * Requires YOUTUBE_API_KEY in env. GET /api/youtube-live?ids=id1,id2
 * Returns [{ channelId, videoId, isLive }, ...]. If no API key, returns empty array.
 * Only channel ids in lib/youtube-channels.ts are looked up (others are dropped),
 * capped at MAX_IDS so one request cannot burn the YouTube API quota.
 */
const MAX_IDS = 10;

export async function GET(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json([] as LiveChannelResult[], { headers: EDGE_CACHE });
  }
  const idsParam = request.nextUrl.searchParams.get('ids');
  const channelIds = idsParam
    ? Array.from(new Set(idsParam.split(',').map((s) => s.trim()).filter(isAllowedYouTubeChannelId))).slice(0, MAX_IDS)
    : [];
  if (channelIds.length === 0) {
    return NextResponse.json([] as LiveChannelResult[], { headers: EDGE_CACHE });
  }

  const results: LiveChannelResult[] = [];
  for (const channelId of channelIds) {
    try {
      const qs = new URLSearchParams({ part: 'snippet', channelId, eventType: 'live', type: 'video', key: apiKey });
      const url = `https://www.googleapis.com/youtube/v3/search?${qs.toString()}`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) continue;
      const data = (await res.json()) as { items?: Array<{ id?: { videoId?: string } }> };
      const first = data?.items?.[0];
      const videoId = first?.id?.videoId ?? null;
      results.push({
        channelId,
        videoId,
        isLive: !!videoId,
      });
    } catch {
      results.push({ channelId, videoId: null, isLive: false });
    }
  }
  return NextResponse.json(results, { headers: EDGE_CACHE });
}

/**
 * Public, visitor-agnostic; also caps YouTube Data API quota use to ~1 lookup per minute per id
 * set. Every 200 (including the empty early returns) carries it: without Cache-Control the Workers
 * Cache default for a 200 is 2 h. No stale-while-revalidate: Cloudflare ignores it when s-maxage
 * is present.
 */
const EDGE_CACHE = { 'Cache-Control': 'public, max-age=0, s-maxage=60' };
