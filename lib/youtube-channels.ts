/**
 * YouTube channels the media room embeds or reads. This is also the allow-list
 * for /api/youtube-live and /api/youtube-rss — those routes refuse any other id.
 *
 * Every id was checked on 2026-10-07 against youtube.com/channel/<id>
 * (canonical @handle shown) and its RSS feed (HTTP 200, channel title).
 * Replaced: UCzMJf7Q6c0l_jy4bB7n2xTw ("i24 News", RSS 404 — channel gone) and
 * UCgzRCbi9cEmWeeuquHqtpCw (labelled "CNN" but an unofficial "CNN News Live"
 * re-upload channel, not @CNN).
 */
export const YOUTUBE_CHANNELS = {
  ALJAZEERA_EN: { id: 'UCNye-wNBqNL5ZzHSJj3l8Bg', handle: '@aljazeeraenglish', name: 'Al Jazeera English' },
  FRANCE24_EN: { id: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', handle: '@France24_en', name: 'France 24' },
  BBC_NEWS: { id: 'UC16niRr50-MSBwiO3YDb3RA', handle: '@BBCNews', name: 'BBC News' },
  CNN: { id: 'UCupvZG-5ko_eiXAupbDfxWw', handle: '@CNN', name: 'CNN' },
  SKY_NEWS: { id: 'UCoMdktPbSTixAyNGwb-UYkQ', handle: '@SkyNews', name: 'Sky News' },
  DW_NEWS: { id: 'UCknLrEdhRCp1aegoMqRaCZg', handle: '@dwnews', name: 'DW' },
  TRT_WORLD: { id: 'UC7fWeaHhqgM4Ry-RMpM2YYw', handle: '@trtworld', name: 'TRT World' },
  I24NEWS_EN: { id: 'UCvHDpsWKADrDia0c99X37vg', handle: '@i24NEWS_EN', name: 'i24 News' },
} as const;

/** YouTube channel ids are "UC" + 22 base64url characters. */
export const YOUTUBE_CHANNEL_ID_RE = /^UC[A-Za-z0-9_-]{22}$/;

const ALLOWED_IDS: ReadonlySet<string> = new Set(Object.values(YOUTUBE_CHANNELS).map((c) => c.id));

export function isAllowedYouTubeChannelId(id: string): boolean {
  return YOUTUBE_CHANNEL_ID_RE.test(id) && ALLOWED_IDS.has(id);
}
