'use client';

import { createClient } from '@/lib/supabase/client';
import { PageBriefing } from '@/components/PageBriefing';
import { useCallback, useEffect, useRef, useState } from 'react';
import { countryQueryValues } from '@/lib/utils';

// ── Constants ──

const COUNTRIES = [
  { code: 'ALL', label: 'ALL', flag: '🌍' },
  { code: 'IR', label: 'IRN', flag: '🇮🇷' },
  { code: 'IL', label: 'ISR', flag: '🇮🇱' },
  { code: 'IQ', label: 'IRQ', flag: '🇮🇶' },
  { code: 'YE', label: 'YEM', flag: '🇾🇪' },
  { code: 'SA', label: 'SAU', flag: '🇸🇦' },
  { code: 'AE', label: 'UAE', flag: '🇦🇪' },
  { code: 'LB', label: 'LBN', flag: '🇱🇧' },
  { code: 'EG', label: 'EGY', flag: '🇪🇬' },
  { code: 'TR', label: 'TUR', flag: '🇹🇷' },
  { code: 'RU', label: 'RUS', flag: '🇷🇺' },
];

const COUNTRY_KEYWORDS: Record<string, string[]> = {
  ALL: [],
  IR: ['iran', 'tehran', 'irgc', 'khamenei', 'persian'],
  IL: ['israel', 'tel aviv', 'idf', 'netanyahu', 'gaza', 'jerusalem'],
  IQ: ['iraq', 'baghdad', 'isis', 'pmu'],
  YE: ['yemen', 'houthi', 'sanaa', 'ansarallah'],
  SA: ['saudi', 'riyadh', 'mbs', 'opec'],
  AE: ['uae', 'dubai', 'abu dhabi'],
  LB: ['lebanon', 'beirut', 'hezbollah'],
  EG: ['egypt', 'cairo', 'sisi'],
  TR: ['turkey', 'erdogan', 'ankara', 'istanbul'],
  RU: ['russia', 'moscow', 'putin', 'ukraine'],
};

const COUNTRY_PHOTO_TAGS: Record<string, string> = {
  ALL: 'mena,middleeast',
  IR: 'iran',
  IL: 'israel',
  IQ: 'iraq',
  YE: 'yemen',
  SA: 'saudi',
  AE: 'uae,dubai',
  LB: 'lebanon,beirut',
  EG: 'egypt,cairo',
  TR: 'turkey',
  RU: 'russia',
};

const LIVE_CHANNELS = [
  { id: 'UCNye-wNBqNL5ZzHSJj3l8Bg', name: 'Al Jazeera English', flag: '🇶🇦', bias: 'Qatari', color: '#E8C547' },
  { id: 'UCQfwfsi5VrQ8yKZ-UWmAEFg', name: 'France 24', flag: '🇫🇷', bias: 'French', color: '#36B8C8' },
  { id: 'UC16niRr50-MSBwiO3YDb3RA', name: 'BBC News', flag: '🇬🇧', bias: 'UK', color: '#E05252' },
  { id: 'UCgzRCbi9cEmWeeuquHqtpCw', name: 'CNN', flag: '🇺🇸', bias: 'US', color: '#4A8FE8' },
  { id: 'UCoMdktPbSTixAyNGwb-UYkQ', name: 'Sky News', flag: '🇬🇧', bias: 'UK', color: '#8A9BB5' },
  { id: 'UCknLrEdhRCp1aegoMqRaCZg', name: 'DW', flag: '🇩🇪', bias: 'German', color: '#E8EDF5' },
  { id: 'UC7fWeaHhqgM4Ry-RMpM2YYw', name: 'TRT World', flag: '🇹🇷', bias: 'Turkish', color: '#E05252' },
  { id: 'UCzMJf7Q6c0l_jy4bB7n2xTw', name: 'i24 News', flag: '🇮🇱', bias: 'Israeli', color: '#4EC98A' },
];

const CLIP_CHANNEL_IDS = [
  'UCNye-wNBqNL5ZzHSJj3l8Bg',
  'UCQfwfsi5VrQ8yKZ-UWmAEFg',
  'UC16niRr50-MSBwiO3YDb3RA',
  'UCupvZG-5ko_eiXAupbDfxWw',
  'UC7fWeaHhqgM4Ry-RMpM2YYw',
  'UCzMJf7Q6c0l_jy4bB7n2xTw',
];

/** [STATIC CONFIG — editorial assessment, update manually as needed] */
const ACCENT_GOLD = 'var(--accent-gold)';
const ACCENT_BLUE = 'var(--accent-blue)';
const ACCENT_ORANGE = 'var(--accent-orange)';
const ACCENT_TEAL = 'var(--accent-teal)';
const ACCENT_RED = 'var(--accent-red)';
const CHANNEL_NARRATIVES = [
  { channel: 'AL JAZEERA EN', frame: 'Civilian Impact', bias: 'Gulf / Anti-Western', color: ACCENT_GOLD },
  { channel: 'AL JAZEERA AR', frame: 'Arab Street View', bias: 'Pan-Arab / Islamist', color: ACCENT_GOLD },
  { channel: 'FRANCE 24', frame: 'Western Liberal', bias: 'French / NATO-aligned', color: ACCENT_BLUE },
  { channel: 'DW NEWS', frame: 'European Inst.', bias: 'German / EU-aligned', color: ACCENT_BLUE },
  { channel: 'TRT WORLD', frame: 'Turkish Geopolitical', bias: 'Ankara / Independent', color: ACCENT_ORANGE },
  { channel: 'i24 NEWS', frame: 'Israeli Security', bias: 'Tel Aviv / Pro-Western', color: ACCENT_TEAL },
  { channel: 'RT NEWS', frame: 'Russian State', bias: 'Moscow / Anti-NATO', color: ACCENT_RED },
  { channel: 'CGTN', frame: 'Chinese Strategic', bias: 'Beijing / Non-interventionist', color: ACCENT_RED },
];

/** Match narrative channel to article source_name (from RSS/sources_registry). Used for dynamic "Latest" in analyst cards. */
const NARRATIVE_TO_SOURCE_KEYS: Record<string, string[]> = {
  'AL JAZEERA EN': ['al jazeera'],
  'AL JAZEERA AR': ['al jazeera'],
  'FRANCE 24': ['france 24', 'france24'],
  'DW NEWS': ['dw news', 'dw'],
  'TRT WORLD': ['trt world', 'trt '],
  'i24 NEWS': ['i24', 'israel hayom', 'times of israel', 'jerusalem post'],
  'RT NEWS': ['rt ', 'russia today'],
  'CGTN': ['cgtn', 'china global'],
};

function getLatestArticleForNarrative(articles: Article[], narrativeChannel: string): Article | null {
  const keys = NARRATIVE_TO_SOURCE_KEYS[narrativeChannel];
  if (!keys?.length) return null;
  const normalized = (s: string | null) => (s ?? '').toLowerCase().trim();
  for (const art of articles) {
    const name = normalized(art.source_name);
    if (!name) continue;
    if (keys.some((k) => name.includes(k))) return art;
  }
  return null;
}

function findTopCluster(articles: Article[]): Article[] {
  const recent = articles.filter((a) => {
    if (!a.published_at) return false;
    return Date.now() - new Date(a.published_at).getTime() < 86400000;
  });
  const scored = recent.map((a) => {
    const myTags = new Set(a.tags ?? []);
    const matches = recent.filter(
      (b) => b.id !== a.id && (b.tags ?? []).filter((t) => myTags.has(t)).length >= 2
    ).length;
    return { article: a, score: matches };
  }).sort((a, b) => b.score - a.score);
  const used = new Set<string>();
  return scored
    .filter((s) => s.score > 0)
    .filter((s) => {
      const type = s.article.source_type ?? 'unknown';
      if (used.has(type)) return false;
      used.add(type);
      return true;
    })
    .slice(0, 3)
    .map((s) => s.article);
}

type ViewMode = 'grid' | 'focus';
type FocusSection = 'tv' | 'photos' | 'clips' | 'wire';

interface Photo {
  title: string;
  thumb: string;
  full: string;
  url: string;
  author?: string;
}

interface Clip {
  id: string;
  title: string;
  url: string;
  thumbnail: string;
  channelName: string;
  channelId: string;
  published: string;
}

interface Article {
  id: string;
  title: string | null;
  url: string | null;
  source_name: string | null;
  source_type: string | null;
  country: string | null;
  published_at: string | null;
  tags: string[] | null;
  sentiment: string | null;
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  const now = new Date();
  const sec = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (sec < 60) return 'now';
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  if (sec < 604800) return `${Math.floor(sec / 86400)}d`;
  return d.toLocaleDateString();
}

async function fetchFlickrPhotos(tags: string): Promise<Photo[]> {
  const url = `/api/flickr?tags=${encodeURIComponent(tags)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Flickr fetch failed');
  const data = await res.json();
  if (Array.isArray(data)) return data as Photo[];
  const items = data?.items ?? [];
  return items.map((item: { title: string; media?: { m: string }; link: string; author?: string }) => ({
    title: item.title || 'Untitled',
    thumb: item.media?.m?.replace('_m.', '_z.') || item.media?.m || '',
    full: item.media?.m?.replace('_m.', '_b.') || item.media?.m || '',
    url: item.link || '',
    author: item.author,
  })).filter((p: Photo) => p.thumb);
}

async function fetchYouTubeClips(): Promise<Clip[]> {
  const all: Clip[] = [];
  const channelNames: Record<string, string> = {
    'UCNye-wNBqNL5ZzHSJj3l8Bg': 'Al Jazeera English',
    'UCQfwfsi5VrQ8yKZ-UWmAEFg': 'France 24',
    'UC16niRr50-MSBwiO3YDb3RA': 'BBC News',
    'UCupvZG-5ko_eiXAupbDfxWw': 'CNN',
    'UC7fWeaHhqgM4Ry-RMpM2YYw': 'TRT World',
    'UCzMJf7Q6c0l_jy4bB7n2xTw': 'i24 News',
  };
  for (const channelId of CLIP_CHANNEL_IDS) {
    try {
      const res = await fetch(`/api/youtube-rss?channelId=${encodeURIComponent(channelId)}`);
      if (!res.ok) continue;
      const xml = await res.text();
      const parser = new DOMParser();
      const doc = parser.parseFromString(xml, 'text/xml');
      const entries = doc.querySelectorAll('entry');
      const videoIdSel = 'yt\\:videoId, videoId';
      const thumbSel = 'media\\:group media\\:thumbnail';
      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        const idEl = entry.querySelector(videoIdSel);
        const rawId = idEl?.textContent?.trim();
        const id = rawId || 'clip-' + channelId + '-' + i;
        const title = entry.querySelector('title')?.textContent?.trim() || '';
        const linkEl = entry.querySelector('link[rel="alternate"]');
        const link = linkEl?.getAttribute('href') || 'https://www.youtube.com/watch?v=' + id;
        const thumbEl = entry.querySelector(thumbSel);
        const thumb = thumbEl?.getAttribute('url') || 'https://img.youtube.com/vi/' + id + '/mqdefault.jpg';
        const published = entry.querySelector('published')?.textContent?.trim() || '';
        all.push({
          id,
          title,
          url: link,
          thumbnail: thumb,
          channelName: channelNames[channelId] || 'YouTube',
          channelId,
          published,
        });
      }
    } catch {
      // skip channel on error
    }
  }
  all.sort((a, b) => new Date(b.published).getTime() - new Date(a.published).getTime());
  return all.slice(0, 50);
}

export default function MediaRoomPage() {
  const [activeCountry, setActiveCountry] = useState<string>('ALL');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [focusSection, setFocusSection] = useState<FocusSection>('tv');
  const [activeChannel, setActiveChannel] = useState<string | null>(null);
  const [loadedChannels, setLoadedChannels] = useState<Set<string>>(() => new Set(LIVE_CHANNELS.slice(0, 2).map(c => c.id)));
  const [lightboxPhoto, setLightboxPhoto] = useState<Photo | null>(null);

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [photoError, setPhotoError] = useState(false);
  const photoCache = useRef<Record<string, Photo[]>>({});

  const [clips, setClips] = useState<Clip[]>([]);
  const [clipError, setClipError] = useState(false);
  const clipsFetched = useRef(false);

  /** channelId -> current live video ID (from YouTube Data API when key is set) */
  const [liveVideoIds, setLiveVideoIds] = useState<Record<string, string | null>>({});

  const [articles, setArticles] = useState<Article[]>([]);
  const [articleError, setArticleError] = useState(false);
  const [socialTrendTerms, setSocialTrendTerms] = useState<string[]>([]);

  // Social trends for active country — used to enrich Flickr search (photos match conflict/social story)
  useEffect(() => {
    if (typeof window === 'undefined' || activeCountry === 'ALL') {
      setSocialTrendTerms([]);
      return;
    }
    const supabase = createClient();
    const countryValues = countryQueryValues(activeCountry);
    if (countryValues.length === 0) {
      setSocialTrendTerms([]);
      return;
    }
    void (async () => {
      try {
        let query = supabase
          .from('social_trends')
          .select('trend')
          .order('conflict_day', { ascending: false })
          .limit(5);
        query = countryValues.length === 1
          ? query.eq('country', countryValues[0])
          : query.in('country', countryValues);
        const { data } = await query;
        const terms: string[] = [];
        (data ?? []).forEach((r: { trend: string | null }) => {
          const t = (r.trend ?? '').trim();
          if (!t) return;
          const words = t.replace(/#/g, '').split(/\s+/).filter((w) => w.length > 2).slice(0, 3);
          terms.push(...words);
        });
        setSocialTrendTerms([...new Set(terms)].slice(0, 5));
      } catch {
        setSocialTrendTerms([]);
      }
    })();
  }, [activeCountry]);

  // Flickr: fetch when country or social terms change; tags = country + conflict/social terms so photos match filtered country and stories
  useEffect(() => {
    const baseTags = COUNTRY_PHOTO_TAGS[activeCountry] ?? COUNTRY_PHOTO_TAGS.ALL;
    const extra = socialTrendTerms.filter((w) => /^[a-z0-9]+$/i.test(w)).slice(0, 3);
    const tags = extra.length ? `${baseTags},${extra.join(',')}` : baseTags;
    if (photoCache.current[tags]?.length) {
      setPhotos(photoCache.current[tags]);
      setPhotoError(false);
      return;
    }
    setPhotoError(false);
    fetchFlickrPhotos(tags)
      .then((data) => {
        photoCache.current[tags] = data;
        setPhotos(data);
      })
      .catch(() => setPhotoError(true));
  }, [activeCountry, socialTrendTerms]);

  // YouTube clips: fetch once
  useEffect(() => {
    if (clipsFetched.current) return;
    clipsFetched.current = true;
    fetchYouTubeClips()
      .then(setClips)
      .catch(() => setClipError(true));
  }, []);

  // Live TV: resolve current live video IDs via API when YOUTUBE_API_KEY is set
  useEffect(() => {
    const ids = LIVE_CHANNELS.map((c) => c.id).join(',');
    fetch(`/api/youtube-live?ids=${encodeURIComponent(ids)}`)
      .then((r) => r.json())
      .then((arr: { channelId: string; videoId: string | null }[]) => {
        const map: Record<string, string | null> = {};
        arr.forEach((x) => { map[x.channelId] = x.videoId ?? null; });
        setLiveVideoIds(map);
      })
      .catch(() => {});
  }, []);

  // Supabase articles: fetch when country changes (client-only)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const supabase = createClient();
    const countryValues = activeCountry === 'ALL' ? [] : countryQueryValues(activeCountry);
    let query = supabase
      .from('articles')
      .select('id, title, url, source_name, source_type, country, published_at, tags, sentiment')
      .order('published_at', { ascending: false })
      .limit(40);
    if (activeCountry !== 'ALL' && countryValues.length > 0) {
      query = countryValues.length === 1
        ? query.eq('country', countryValues[0])
        : query.in('country', countryValues);
    }
    Promise.resolve(
      query.then(({ data, error }) => {
        if (error) {
          setArticleError(true);
          return;
        }
        setArticles((data as Article[]) ?? []);
        setArticleError(false);
      })
    ).catch(() => setArticleError(true));
  }, [activeCountry]);

  const loadChannel = useCallback((channelId: string) => {
    setLoadedChannels((prev) => new Set(prev).add(channelId));
  }, []);

  const filteredClips = activeCountry === 'ALL'
    ? clips
    : clips.filter((c) => {
        const kw = COUNTRY_KEYWORDS[activeCountry] ?? [];
        const t = c.title.toLowerCase();
        return kw.some((k) => t.includes(k));
      });

  const countryLabel = activeCountry === 'ALL' ? 'GLOBAL MENA' : (COUNTRIES.find((c) => c.code === activeCountry)?.label ?? activeCountry);

  const showSection = (section: FocusSection) => viewMode === 'grid' || focusSection === section;

  const wireList = articles.filter((a) => a.url);
  const wireTriple = [...wireList, ...wireList, ...wireList];

  const breakingAlerts = articles.filter((a) => {
    if (!a.published_at || !a.url) return false;
    const ageMinutes = (Date.now() - new Date(a.published_at).getTime()) / 60000;
    return (
      ageMinutes < 120 &&
      (a.source_type === 'official' || a.source_type === 'military') &&
      a.sentiment === 'negative'
    );
  });

  const coverageCluster = findTopCluster(articles);

  return (
    <div className="min-h-screen flex flex-col">
      {breakingAlerts.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            padding: '7px 16px',
            background: 'rgba(224,82,82,0.08)',
            borderBottom: '1px solid rgba(224,82,82,0.3)',
          }}
        >
          <span
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 8,
              color: 'var(--accent-red)',
              letterSpacing: '2px',
              border: '1px solid var(--accent-red)',
              padding: '2px 7px',
              animation: 'blink 1s step-end infinite',
              flexShrink: 0,
            }}
          >
            ◉ BREAKING
          </span>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            {breakingAlerts.slice(0, 2).map((a) => (
              <a
                key={a.id}
                href={a.url ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: 'block',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: 10,
                  color: 'var(--text-primary)',
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  marginBottom: breakingAlerts.length > 1 ? 2 : 0,
                }}
              >
                <span style={{ color: 'var(--accent-teal)' }}>[{a.source_name}]</span> {a.title}
              </a>
            ))}
          </div>
          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', flexShrink: 0 }}>
            {Math.round((Date.now() - new Date(breakingAlerts[0].published_at!).getTime()) / 60000)}m ago
          </span>
        </div>
      )}
      <PageBriefing
        title="MEDIA ROOM — LIVE COVERAGE MONITOR"
        description="Live television streams from 8 international broadcasters across four editorial perspectives: Western liberal (BBC, CNN, France 24), Gulf and Arab (Al Jazeera), Turkish geopolitical (TRT World), and Israeli security (i24). Photo wire and video clips from RSS feeds. All streams are embedded directly from YouTube — we do not control or modify their content."
        note="The Narrative Divergence Matrix below the TV grid shows analyst-assessed editorial positions for each channel. These are static assessments updated manually — not algorithmic scores."
      />
      <main className="flex-1 p-4 md:p-6 max-w-[1800px] mx-auto w-full">
        {/* Top bar: country chips + view mode */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <span className="font-mono text-[9px] text-[var(--text-muted)] uppercase tracking-widest mr-2">Filter:</span>
          {COUNTRIES.map((c) => (
            <button
              key={c.code}
              type="button"
              className={`country-chip ${activeCountry === c.code ? 'active' : ''}`}
              onClick={() => setActiveCountry(c.code)}
            >
              <span className="mr-1">{c.flag}</span>
              {c.label}
            </button>
          ))}
          <span className="flex-1" />
          <span className="font-mono text-[8px] text-[var(--text-muted)] uppercase tracking-widest mr-2">View:</span>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === 'grid' ? 'active' : ''}`}
            onClick={() => setViewMode('grid')}
          >
            GRID
          </button>
          <button
            type="button"
            className={`view-mode-btn ${viewMode === 'focus' ? 'active' : ''}`}
            onClick={() => setViewMode('focus')}
          >
            FOCUS
          </button>
          {viewMode === 'focus' && (
            <>
              <span className="font-mono text-[8px] text-[var(--text-muted)] ml-2">Section:</span>
              {(['tv', 'photos', 'clips', 'wire'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`view-mode-btn ${focusSection === s ? 'active' : ''}`}
                  onClick={() => setFocusSection(s)}
                >
                  {s.toUpperCase()}
                </button>
              ))}
            </>
          )}
        </div>

        {/* PRESS PHOTO WIRE — at top per request */}
        {showSection('wire') && (
          <section className="mb-4">
            <div className="media-section-header">
              ◈ PRESS PHOTO WIRE — ARTICLES WITH MEDIA
            </div>
            {articleError ? (
              <p className="redacted p-4">{'// FEED UNAVAILABLE'}</p>
            ) : wireList.length === 0 ? (
              <p className="redacted p-4">{'// LOADING ARTICLES...'}</p>
            ) : (
              <div className="wire-strip">
                <div className="wire-strip-inner">
                  {wireTriple.map((article, i) => (
                    <a
                      key={`${article.id}-${i}`}
                      href={article.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="wire-card"
                    >
                      <div className="wire-source-img">
                        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic favicon URLs */}
                        <img
                          src={`https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=${encodeURIComponent(article.url || '')}&size=128`}
                          alt={article.source_name || ''}
                          loading="lazy"
                          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                        />
                      </div>
                      <div className="wire-card-content">
                        <div className="wire-source">{article.source_name ?? '—'}</div>
                        <div className="wire-title">{article.title ?? '—'}</div>
                        <div className="wire-time">
                          {article.published_at ? formatRelativeTime(article.published_at) : '—'}
                        </div>
                      </div>
                    </a>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        {/* Section 1 — LIVE TV GRID */}
        {showSection('tv') && (
          <section className="mb-4">
            <div className="media-section-header">
              ◉ LIVE TELEVISION — 8 CHANNELS ACTIVE
            </div>
            <div
              className="channel-tile-grid grid gap-2 p-2"
              style={{
                gridTemplateColumns: activeChannel
                  ? `minmax(0, 3fr) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)`
                  : 'repeat(4, 1fr)',
              }}
            >
              {LIVE_CHANNELS.map((ch) => {
                const isActive = activeChannel === ch.id;
                const isLoaded = loadedChannels.has(ch.id);
                return (
                  <div
                    key={ch.id}
                    className={`channel-tile ${isActive ? 'active' : ''}`}
                    onClick={() => setActiveChannel(ch.id)}
                  >
                    <div className="bias-label">{ch.bias}</div>
                    <div className="live-indicator">
                      <span className="pulse-ring" />
                      <span>LIVE</span>
                    </div>
                    {isLoaded ? (
                      (() => {
                        const videoId = liveVideoIds[ch.id];
                        const embedUrl = videoId
                          ? `https://www.youtube.com/embed/${videoId}?autoplay=0`
                          : `https://www.youtube.com/embed/live_stream?channel=${ch.id}&autoplay=0&mute=1`;
                        return (
                          <div className="channel-embed-wrap">
                            <iframe
                              src={embedUrl}
                              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope"
                              allowFullScreen
                              className="channel-iframe"
                              title={ch.name}
                            />
                            {!videoId && (
                              <span className="live-fallback-label" title="Channel may be off air; stream URL is generic">
                                Off air?
                              </span>
                            )}
                          </div>
                        );
                      })()
                    ) : (
                      <div
                        className="channel-poster"
                        onClick={(e) => {
                          e.stopPropagation();
                          loadChannel(ch.id);
                        }}
                      >
                        <span className="channel-flag" style={{ fontSize: '48px' }}>{ch.flag}</span>
                        <span className="channel-name" style={{ color: ch.color }}>{ch.name}</span>
                        <span className="load-prompt">▶ CLICK TO LOAD STREAM</span>
                      </div>
                    )}
                    <div className="channel-bar">
                      <span className="channel-flag">{ch.flag}</span>
                      <span className="channel-name" style={{ color: ch.color }}>{ch.name}</span>
                      <a
                        href={`https://www.youtube.com/channel/${ch.id}/live`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="channel-open"
                        onClick={(e) => e.stopPropagation()}
                      >
                        ⬡ OPEN ↗
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Narrative Divergence Matrix — [STATIC CONFIG] */}
            <div style={{ marginTop: 12, padding: 12, border: '1px solid var(--border)', background: 'var(--bg-secondary)' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 7, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 8 }}>
                ANALYST-CURATED EDITORIAL POSITIONS — Updated manually
              </div>
              <div className="narrative-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10 }}>
                {CHANNEL_NARRATIVES.map((n) => {
                  const latest = getLatestArticleForNarrative(articles, n.channel);
                  return (
                    <div
                      key={n.channel}
                      style={{
                        padding: 10,
                        border: '1px solid var(--border)',
                        borderRadius: 2,
                      }}
                    >
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: n.color, letterSpacing: '1px', marginBottom: 4 }}>{n.channel}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-primary)', marginBottom: 2 }}>{n.frame}</div>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', marginBottom: 6 }}>{n.bias}</div>
                      {latest ? (
                        <a
                          href={latest.url ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'block',
                            fontSize: 9,
                            color: 'var(--accent-teal)',
                            textDecoration: 'none',
                            lineHeight: 1.3,
                            marginTop: 4,
                            borderTop: '1px solid var(--border)',
                            paddingTop: 6,
                          }}
                          title={latest.title ?? ''}
                        >
                          Latest: {(latest.title ?? '').slice(0, 52)}{(latest.title ?? '').length > 52 ? '…' : ''} ↗
                        </a>
                      ) : (
                        <div style={{ fontSize: 8, color: 'var(--text-muted)', marginTop: 4, fontStyle: 'italic' }}>No matching article in feed</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* Two-column row: Photos (55%) + Clips (45%) */}
        <div className="media-two-col grid gap-4 mb-4" style={{ gridTemplateColumns: showSection('photos') && showSection('clips') ? '55fr 45fr' : '1fr' }}>
          {/* Section 2 — PHOTO INTELLIGENCE */}
          {showSection('photos') && (
            <section>
              <div className="media-section-header">
                ◈ PHOTO INTELLIGENCE — {countryLabel} — FLICKR (country + social/conflict terms)
              </div>
              {photoError ? (
                <p className="redacted p-4">{'// PHOTO FEED UNAVAILABLE'}</p>
              ) : photos.length === 0 ? (
                <p className="redacted p-4">{'// LOADING IMAGES...'}</p>
              ) : (
                <div className="photo-masonry">
                  {photos.map((photo, i) => (
                    <div
                      key={`${photo.url}-${i}`}
                      className="photo-card"
                      onClick={() => setLightboxPhoto(photo)}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- dynamic Flickr CDN URLs */}
                      <img
                        src={photo.thumb}
                        alt={photo.title}
                        loading="lazy"
                        className="photo-img"
                      />
                      <div className="photo-overlay">
                        <div className="photo-title">{photo.title}</div>
                        <div className="photo-meta">
                          {photo.author?.replace('nobody@flickr.com ("', '').replace('")', '')}
                        </div>
                        <a
                          href={photo.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="photo-source"
                          onClick={(e) => e.stopPropagation()}
                        >
                          VIEW FULL ↗
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 3 — VIDEO CLIPS */}
          {showSection('clips') && (
            <section>
              <div className="media-section-header">
                ▶ VIDEO CLIPS — LATEST FROM FIELD
              </div>
              {clipError ? (
                <p className="redacted p-4">{'// FEED UNAVAILABLE'}</p>
              ) : filteredClips.length === 0 ? (
                <p className="redacted p-4">{clips.length === 0 ? '// LOADING CLIPS...' : '// NO CLIPS FOR THIS COUNTRY'}</p>
              ) : (
                <div className="overflow-y-auto" style={{ maxHeight: '60vh' }}>
                  {filteredClips.map((clip) => (
                    <a
                      key={clip.id}
                      href={clip.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="clip-card"
                    >
                      <div className="clip-thumbnail-wrap">
                        {/* eslint-disable-next-line @next/next/no-img-element -- dynamic YouTube thumbnails */}
                        <img
                          src={clip.thumbnail}
                          alt={clip.title}
                          loading="lazy"
                          className="clip-thumbnail"
                        />
                        <div className="play-overlay">▶</div>
                      </div>
                      <div className="clip-info">
                        <div className="clip-channel">{clip.channelName}</div>
                        <div className="clip-title">{clip.title}</div>
                        <div className="clip-date">{formatRelativeTime(clip.published)}</div>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Coverage Comparison — same event, 3 sources: findTopCluster picks 3 articles from last 24h that share 2+ tags, one per source_type (wire/broadcast/official etc.) */}
        {coverageCluster.length > 0 && (
          <section className="mb-4">
            <div className="media-section-header">
              ◈ COVERAGE COMPARISON — SAME EVENT, 3 SOURCES
            </div>
            <p className="font-mono text-[9px] text-[var(--text-muted)] px-3 pb-2" style={{ letterSpacing: '0.5px' }}>
              Same story covered by 3 different source types (e.g. wire, broadcast, official). Algorithm: recent 24h articles → cluster by shared tags → pick top 3 with distinct source_type.
            </p>
            <div className="coverage-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, padding: 12 }}>
              {coverageCluster.map((a) => (
                <a
                  key={a.id}
                  href={a.url ?? '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    padding: 12,
                    border: '1px solid var(--border)',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'background 0.15s',
                  }}
                >
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-teal)', letterSpacing: '1px', marginBottom: 4 }}>
                    {(a.source_type ?? 'wire').toUpperCase()}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.3 }}>{a.title ?? '—'}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', marginTop: 4 }}>{a.source_name ?? '—'}</div>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', marginTop: 2 }}>
                    {a.published_at ? formatRelativeTime(a.published_at) : '—'}
                  </div>
                </a>
              ))}
            </div>
          </section>
        )}

      </main>

      {/* Lightbox */}
      {lightboxPhoto && (
        <div
          className="lightbox-overlay"
          onClick={() => setLightboxPhoto(null)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Escape' && setLightboxPhoto(null)}
        >
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            {/* eslint-disable-next-line @next/next/no-img-element -- lightbox full-size external URL */}
            <img src={lightboxPhoto.full} alt={lightboxPhoto.title} />
            <div className="lightbox-caption">
              <span>{lightboxPhoto.title}</span>
              <a href={lightboxPhoto.url} target="_blank" rel="noopener noreferrer">
                FULL SOURCE ↗
              </a>
              <button type="button" onClick={() => setLightboxPhoto(null)}>✕ CLOSE</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
