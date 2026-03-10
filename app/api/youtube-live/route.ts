import { NextRequest, NextResponse } from 'next/server';

export interface LiveChannelResult {
  channelId: string;
  videoId: string | null;
  isLive: boolean;
}

/**
 * Resolves current live video IDs for YouTube channel IDs using YouTube Data API v3.
 * Requires YOUTUBE_API_KEY in env. GET /api/youtube-live?ids=id1,id2
 * Returns [{ channelId, videoId, isLive }, ...]. If no API key, returns empty array.
 */
export async function GET(request: NextRequest) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return NextResponse.json([] as LiveChannelResult[]);
  }
  const idsParam = request.nextUrl.searchParams.get('ids');
  const channelIds = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (channelIds.length === 0) {
    return NextResponse.json([] as LiveChannelResult[]);
  }

  const results: LiveChannelResult[] = [];
  for (const channelId of channelIds) {
    try {
      const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&eventType=live&type=video&key=${apiKey}`;
      const res = await fetch(url, { next: { revalidate: 60 } });
      if (!res.ok) continue;
      const data = await res.json();
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
  return NextResponse.json(results);
}
