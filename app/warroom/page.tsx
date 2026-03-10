'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useConflictDay } from '@/hooks/useConflictDay';
import type {
  Article,
  CountryReport,
  MarketData,
  SocialTrend,
  ScenarioProbability,
  DisinfoClaim,
} from '@/types/supabase';

const COUNTRY_EMOJI: Record<string, string> = {
  IR: '🇮🇷', IL: '🇮🇱', IQ: '🇮🇶', YE: '🇾🇪', AE: '🇦🇪', SA: '🇸🇦', EG: '🇪🇬',
  TR: '🇹🇷', RU: '🇷🇺', SY: '🇸🇾', LB: '🇱🇧', JO: '🇯🇴', QA: '🇶🇦', KW: '🇰🇼',
  BH: '🇧🇭', OM: '🇴🇲', PS: '🇵🇸', LY: '🇱🇾', SD: '🇸🇩', DZ: '🇩🇿', MA: '🇲🇦',
  TN: '🇹🇳', CN: '🇨🇳', US: '🇺🇸', GB: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IN: '🇮🇳', PK: '🇵🇰',
};

interface ContentJson {
  elite_network?: Array<{ name?: string; role?: string; position?: string; red_line?: string }>;
  key_risks?: string[];
  stabilizers?: string[];
  economic_exposure?: Record<string, number | string>;
  key_flashpoints?: string[];
}

interface NaiRow {
  country_code: string;
  conflict_day: number;
  expressed_score: number;
  latent_score: number;
  gap_size: number;
  category: string;
}

interface ScenarioRow {
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
}

function buildPoints(history: ScenarioRow[], key: keyof ScenarioRow, w: number, h: number): string {
  const values = history.map((r) => Number(r[key]));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / Math.max(history.length - 1, 1)) * w;
      const y = h - ((v - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
}

function mapSentimentDisplay(s: string | null): { label: string; color: string } {
  switch (s) {
    case 'pro_war':
      return { label: 'PRO-WAR', color: 'var(--accent-red)' };
    case 'anti_war':
      return { label: 'ANTI-WAR', color: 'var(--accent-green)' };
    case 'fearful':
      return { label: 'FEARFUL', color: 'var(--accent-orange)' };
    case 'neutral':
      return { label: 'NEUTRAL', color: 'var(--text-muted)' };
    default:
      return { label: s?.toUpperCase() ?? '—', color: 'var(--text-muted)' };
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return '--:--';
  const d = new Date(iso);
  return d.toISOString().slice(11, 16);
}

export default function WarRoomPage() {
  const conflictDayFromDb = useConflictDay();
  const CONFLICT_DAY = conflictDayFromDb ?? 10;
  const [activeCountry, setActiveCountry] = useState<string>('IR');
  const [lastRefresh, setLastRefresh] = useState<string>('--:--');
  const [countryReports, setCountryReports] = useState<CountryReport[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleCountByCountry, setArticleCountByCountry] = useState<Record<string, number>>({});
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [socialTrends, setSocialTrends] = useState<SocialTrend[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioProbability | null>(null);
  const [disinfoClaims, setDisinfoClaims] = useState<DisinfoClaim[]>([]);
  const [totalArticleCount, setTotalArticleCount] = useState<number>(0);
  const [pipelineTimestamps, setPipelineTimestamps] = useState<Record<string, string>>({});
  const [naiHistory, setNaiHistory] = useState<NaiRow[]>([]);
  const [scenarioHistory, setScenarioHistory] = useState<ScenarioRow[]>([]);
  const [tickerArticles, setTickerArticles] = useState<Article[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchAll = async () => {
    const supabase = createClient();
    setFetchError(null);
    try {
      const [
        { data: reports, error: reportsErr },
        { data: articlesData, error: articlesErr },
        { count: totalCount },
        { data: marketRows, error: marketErr },
        { data: socialRows, error: socialErr },
        { data: scenarioRows, error: scenarioErr },
        { data: disinfoRows, error: disinfoErr },
        { data: naiRows, error: naiErr },
        { data: scenarioHistoryRows, error: scenarioHistoryErr },
        { data: tickerRows },
      ] = await Promise.all([
        supabase.from('country_reports').select('*').order('conflict_day', { ascending: false }),
        supabase.from('articles').select('*').order('published_at', { ascending: false }).limit(500),
        supabase.from('articles').select('*', { count: 'exact', head: true }),
        supabase.from('market_data').select('*').order('created_at', { ascending: false }),
        supabase.from('social_trends').select('*').order('conflict_day', { ascending: false }),
        supabase.from('scenario_probabilities').select('*').eq('conflict_day', CONFLICT_DAY).limit(1).maybeSingle(),
        supabase.from('disinfo_claims').select('*').order('published_at', { ascending: false }).limit(5),
        supabase.from('nai_scores').select('country_code, conflict_day, expressed_score, latent_score, gap_size, category').order('conflict_day', { ascending: false }).limit(60),
        supabase.from('scenario_probabilities').select('conflict_day, scenario_a, scenario_b, scenario_c, scenario_d').order('conflict_day', { ascending: true }),
        supabase.from('articles').select('id, title, url, country, source_name, published_at').order('published_at', { ascending: false }).limit(20),
      ]);

      const errMsg = reportsErr?.message ?? articlesErr?.message ?? marketErr?.message ?? socialErr?.message ?? scenarioErr?.message ?? disinfoErr?.message ?? naiErr?.message ?? scenarioHistoryErr?.message;
      if (errMsg) setFetchError(errMsg);

      const reportsList = (reports as CountryReport[]) ?? [];
      const latestByCountry = new Map<string, CountryReport>();
      reportsList.forEach((r) => {
        if (!latestByCountry.has(r.country_code)) latestByCountry.set(r.country_code, r);
      });
      setCountryReports(Array.from(latestByCountry.values()));
      setTotalArticleCount(totalCount ?? 0);

      const arts = (articlesData as Article[]) ?? [];
      setArticles(arts);

      const byCountry: Record<string, number> = {};
      arts.forEach((a) => {
        const c = (a.country ?? '').toUpperCase().trim() || 'OTHER';
        byCountry[c] = (byCountry[c] ?? 0) + 1;
      });
      setArticleCountByCountry(byCountry);

      setMarketData((marketRows as MarketData[]) ?? []);
      setSocialTrends((socialRows as SocialTrend[]) ?? []);
      setScenarios(scenarioRows as ScenarioProbability | null);
      setDisinfoClaims((disinfoRows as DisinfoClaim[]) ?? []);
      setTickerArticles((tickerRows as Article[]) ?? []);

      const naiArr = (naiRows as NaiRow[]) ?? [];
      setNaiHistory(naiArr);

      let scenarioArr = (scenarioHistoryRows as ScenarioRow[]) ?? [];
      if (scenarioArr.length === 0 && scenarioRows) {
        scenarioArr = [scenarioRows as unknown as ScenarioRow];
      }
      setScenarioHistory(scenarioArr);

      const nowIso = new Date().toISOString();
      setPipelineTimestamps({
        articles: (arts[0]?.fetched_at ?? arts[0]?.published_at) ?? nowIso,
        markets: (marketRows as MarketData[])?.[0] ? nowIso : '—',
        social: (socialRows as SocialTrend[])?.[0] ? nowIso : '—',
        disinfo: (disinfoRows as DisinfoClaim[])?.[0]?.published_at ?? nowIso,
      });
      setLastRefresh(nowIso.slice(11, 16) + ' UTC');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Failed to load war room data';
      setFetchError(msg);
    }
  };

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAll uses CONFLICT_DAY from closure
  }, [CONFLICT_DAY]);

  const filteredArticles = activeCountry
    ? articles.filter((a) => (a.country ?? '').toUpperCase().trim() === activeCountry).slice(0, 30)
    : articles.slice(0, 30);

  const activeReport = countryReports.find(
    (r) => r.country_code.toUpperCase() === activeCountry
  ) ?? countryReports[0];

  const contentJson = (activeReport?.content_json ?? null) as ContentJson | null;
  const eliteNetwork = contentJson?.elite_network ?? [];
  const keyRisks = contentJson?.key_risks ?? [];
  const stabilizers = contentJson?.stabilizers ?? [];

  const socialForCountry = socialTrends.filter(
    (s) => (s.country ?? '').toUpperCase() === activeCountry
  )[0];

  const latestByIndicator = marketData.reduce<Record<string, MarketData>>((acc, row) => {
    const k = row.indicator ?? 'OTHER';
    if (!acc[k]) acc[k] = row;
    return acc;
  }, {});

  const scenarioLatest: Record<string, number> = scenarios
    ? {
        scenario_a: scenarios.scenario_a,
        scenario_b: scenarios.scenario_b,
        scenario_c: scenarios.scenario_c,
        scenario_d: scenarios.scenario_d,
      }
    : { scenario_a: 0, scenario_b: 0, scenario_c: 0, scenario_d: 0 };

  const sentimentByCountry = socialTrends.reduce<Record<string, string>>((acc, s) => {
    const c = (s.country ?? '').toUpperCase().trim();
    if (c && !acc[c]) acc[c] = s.sentiment ?? 'NEU';
    return acc;
  }, {});

  const pipelineStatus = (key: string): 'green' | 'orange' | 'red' => {
    const raw = pipelineTimestamps[key];
    if (!raw || raw === '—') return 'red';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return 'red';
    const hours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    if (hours <= 1) return 'green';
    if (hours <= 6) return 'orange';
    return 'red';
  };

  const pipelineLabel = (key: string): string => {
    const raw = pipelineTimestamps[key];
    if (!raw || raw === '—') return '—';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    return d.toISOString().slice(11, 16) + ' UTC';
  };

  const uniqueCountries = Array.from(
    new Set(countryReports.map((r) => r.country_code.toUpperCase()))
  ).sort();

  const velocityMap: Record<string, number> = {};
  const naiLatestMap: Record<string, NaiRow> = {};
  const seen: Record<string, number> = {};
  for (const row of naiHistory) {
    const cc = row.country_code?.toUpperCase?.() ?? row.country_code;
    if (!naiLatestMap[cc]) {
      naiLatestMap[cc] = row;
    } else if (!seen[cc]) {
      seen[cc] = 1;
      velocityMap[cc] = naiLatestMap[cc].expressed_score - row.expressed_score;
    }
  }

  const naiLatest = activeCountry ? naiLatestMap[activeCountry] : null;

  const breakingAlerts = (articles ?? []).filter((a) => {
    if (!a.published_at || !a.url) return false;
    const ageMinutes = (Date.now() - new Date(a.published_at).getTime()) / 60000;
    return (
      ageMinutes < 120 &&
      (a.source_type === 'official' || a.source_type === 'military') &&
      a.sentiment === 'negative'
    );
  });

  const recentCount = (articles ?? []).filter((a) => {
    if (!a.published_at) return false;
    return Date.now() - new Date(a.published_at).getTime() < 86400000;
  }).length;
  const countryRecentCount = (articles ?? []).filter((a) => {
    if (!a.published_at) return false;
    const c = (a.country ?? '').toUpperCase().trim();
    return c === activeCountry && Date.now() - new Date(a.published_at).getTime() < 86400000;
  }).length;
  const confidence = countryRecentCount > 15 ? 'HIGH' : countryRecentCount > 5 ? 'MEDIUM' : 'LOW';
  const confColor = confidence === 'HIGH' ? 'var(--nai-safe)' : confidence === 'MEDIUM' ? 'var(--accent-gold)' : 'var(--accent-red)';

  return (
    <div className="warroom-page">
      {fetchError && (
        <div
          style={{
            padding: '10px 16px',
            background: 'rgba(224,82,82,0.1)',
            borderBottom: '1px solid var(--accent-red)',
            fontFamily: 'IBM Plex Mono',
            fontSize: 11,
            color: 'var(--accent-red)',
          }}
          role="alert"
        >
          War room data error: {fetchError}. Check Supabase env (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY) and table access.
        </div>
      )}
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
          <span
            style={{
              fontFamily: 'IBM Plex Mono',
              fontSize: 8,
              color: 'var(--text-muted)',
              flexShrink: 0,
            }}
          >
            {Math.round((Date.now() - new Date(breakingAlerts[0].published_at!).getTime()) / 60000)}m ago
          </span>
        </div>
      )}
      {/* Top status bar */}
      <div
        className="warroom-status-bar"
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 16,
          fontFamily: 'IBM Plex Mono, monospace',
          fontSize: 9,
          letterSpacing: '1.5px',
          color: 'var(--text-muted)',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ color: 'var(--accent-gold)' }}>◆ MENA WAR ROOM</span>
        <span>|</span>
        <span>CONFLICT DAY {CONFLICT_DAY}</span>
        <span>|</span>
        <span style={{ color: 'var(--accent-red)' }}>● LIVE</span>
        <span>PIPELINE ACTIVE</span>
        <span>|</span>
        <span>{totalArticleCount} ITEMS IN DB</span>
        <span>|</span>
        <span>LAST REFRESH: {lastRefresh}</span>
        <span>|</span>
        <span>AUTO-REFRESH: 60s</span>
      </div>

      <div className="warroom-grid">
        {/* LEFT PANEL */}
        <aside className="warroom-panel warroom-left-panel" style={{ width: 280 }}>
          <div className="warroom-panel-header">
            <span>◆ THEATRE COUNTRIES</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 8 }}>
              {uniqueCountries.length} MONITORED
            </span>
          </div>
          <div>
            {uniqueCountries.map((code) => {
              const report = countryReports.find((r) => r.country_code.toUpperCase() === code);
              const naiRow = naiLatestMap[code];
              const naiCategory = (naiRow?.category ?? report?.nai_category ?? 'STABLE').toUpperCase().replace(/\s+/g, '_');
              const isActive = activeCountry === code;
              const count = articleCountByCountry[code] ?? 0;
              const gapSize = naiRow?.gap_size ?? 0;
              const v = velocityMap[code] ?? 0;
              const showRedLine = (naiRow?.gap_size ?? 0) > 30 || v <= -2;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveCountry(code)}
                  className="country-row"
                  data-active={isActive}
                  data-nai={naiCategory}
                >
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono',
                      fontSize: 11,
                      fontWeight: 'bold',
                      color:
                        v <= -2
                          ? 'var(--accent-red)'
                          : v < 0
                            ? 'var(--accent-orange)'
                            : v >= 2
                              ? 'var(--accent-green)'
                              : v > 0
                                ? 'var(--nai-stable)'
                                : 'var(--text-muted)',
                      animation: v <= -2 ? 'blink 2s step-end infinite' : 'none',
                      flexShrink: 0,
                    }}
                  >
                    {v <= -2 ? '↓↓' : v < 0 ? '↓' : v >= 2 ? '↑↑' : v > 0 ? '↑' : '→'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="country-name" style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>
                      {report?.country_name ?? code}
                    </div>
                    <div className="country-meta" style={{ color: 'var(--text-muted)', fontSize: 9, marginTop: 2 }}>
                      NAI {(naiRow?.expressed_score ?? report?.nai_score ?? 0).toFixed(1)} · {naiRow?.category ?? report?.nai_category ?? '—'}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 2 }}>
                      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 7, color: 'var(--text-muted)', letterSpacing: '1px' }}>GAP</span>
                      <div
                        style={{
                          height: 2,
                          borderRadius: 1,
                          width: `${Math.min(gapSize * 0.6, 60)}px`,
                          background: gapSize > 30 ? 'var(--accent-red)' : gapSize > 15 ? 'var(--accent-orange)' : 'var(--border-bright)',
                          boxShadow: gapSize > 30 ? '0 0 6px rgba(224,82,82,0.7)' : 'none',
                          transition: 'width 0.5s',
                        }}
                      />
                      <span
                        style={{
                          fontFamily: 'IBM Plex Mono',
                          fontSize: 8,
                          color: gapSize > 30 ? 'var(--accent-red)' : gapSize > 15 ? 'var(--accent-orange)' : 'var(--text-muted)',
                        }}
                      >
                        {gapSize}
                      </span>
                    </div>
                    {showRedLine && (
                      <span
                        style={{
                          fontFamily: 'IBM Plex Mono',
                          fontSize: 7,
                          color: 'var(--accent-red)',
                          letterSpacing: '1px',
                          border: '1px solid rgba(224,82,82,0.4)',
                          padding: '1px 4px',
                          flexShrink: 0,
                          animation: 'blink 2s step-end infinite',
                          display: 'inline-block',
                          marginTop: 2,
                        }}
                      >
                        ⚠ RED LINE
                      </span>
                    )}
                  </div>
                  <span className="article-count" style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)' }}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1.5px', color: 'var(--accent-gold)', marginBottom: 8, padding: '0 14px' }}>
              SCENARIO DRIFT — DAY {CONFLICT_DAY}
            </div>
            {[
              { key: 'scenario_a' as const, label: 'A', name: 'Contained', color: 'var(--accent-gold)' },
              { key: 'scenario_b' as const, label: 'B', name: 'Regional Spread', color: 'var(--accent-blue)' },
              { key: 'scenario_c' as const, label: 'C', name: 'Nuclear Threat', color: 'var(--accent-orange)' },
              { key: 'scenario_d' as const, label: 'D', name: 'Full War', color: 'var(--accent-red)' },
            ].map((sc) => {
              const latest = scenarioHistory.at(-1)?.[sc.key] ?? scenarioLatest[sc.key] ?? 0;
              const first = scenarioHistory.at(0)?.[sc.key] ?? 0;
              const delta = Number(latest) - Number(first);
              return (
                <div
                  key={sc.key}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 14px',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontFamily: 'Bebas Neue', fontSize: 14, color: sc.color, width: 12, flexShrink: 0 }}>{sc.label}</span>
                  <svg width={56} height={18} style={{ flexShrink: 0, overflow: 'visible' }}>
                    <polyline
                      points={buildPoints(scenarioHistory, sc.key, 56, 18)}
                      fill="none"
                      stroke={sc.color}
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                      opacity={0.9}
                    />
                  </svg>
                  <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: sc.color, fontWeight: 500, width: 32, textAlign: 'right', flexShrink: 0 }}>{latest}%</span>
                  <span
                    style={{
                      fontFamily: 'IBM Plex Mono',
                      fontSize: 8,
                      color: delta > 0 ? 'var(--accent-red)' : delta < 0 ? 'var(--accent-green)' : 'var(--text-muted)',
                      letterSpacing: '0.5px',
                    }}
                  >
                    {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : '—'}
                  </span>
                </div>
              );
            })}
            <div style={{ padding: '6px 14px', fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', borderTop: '1px solid var(--border)' }}>
              ↑ Scenario B +{((scenarioHistory.at(-1)?.scenario_b ?? 0) - (scenarioHistory.at(0)?.scenario_b ?? 0))}pts since Day 1
            </div>
          </div>
        </aside>

        {/* CENTER PANEL */}
        <main className="warroom-panel" style={{ display: 'flex', flexDirection: 'column', borderRight: 'none' }}>
          {/* Selected country header */}
          <div
            className="warroom-panel-header"
            style={{ flexShrink: 0 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 18 }}>{COUNTRY_EMOJI[activeCountry] ?? '🏳️'}</span>
              <span style={{ color: 'var(--text-primary)', fontSize: 14, fontFamily: 'Bebas Neue' }}>
                {activeReport?.country_name ?? activeCountry}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>NAI: {(naiLatest?.expressed_score ?? activeReport?.nai_score ?? 0).toFixed(1)}</span>
              <span
                className="nai-badge"
                style={{
                  color: `var(--nai-${(naiLatest?.category ?? activeReport?.nai_category ?? 'stable').toLowerCase()})`,
                  background: 'transparent',
                  border: '1px solid currentColor',
                  padding: '2px 6px',
                  fontSize: 8,
                }}
              >
                {naiLatest?.category ?? activeReport?.nai_category ?? '—'}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: 9 }}>CONFLICT DAY {CONFLICT_DAY}</span>
            </div>
            <div className="nai-bar-track" style={{ width: 120, height: 4 }}>
              <div
                className="nai-bar-fill tension"
                style={{
                  width: `${Math.min(100, naiLatest?.expressed_score ?? activeReport?.nai_score ?? 0)}%`,
                  background: 'var(--accent-gold)',
                  boxShadow: '0 0 6px rgba(232,197,71,0.5)',
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 14px', borderBottom: '1px solid var(--border)' }}>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1px' }}>INTEL CONFIDENCE</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: confColor, letterSpacing: '2px', border: `1px solid ${confColor}`, padding: '1px 7px' }}>{confidence}</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)' }}>{countryRecentCount} sources / 24h</span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr auto 1fr',
              padding: '10px 14px',
              borderBottom: '1px solid var(--border)',
              gap: 8,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 3 }}>EXPRESSED</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--accent-blue)', lineHeight: 1 }}>{naiLatest?.expressed_score ?? '—'}</div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)' }}>Official behavior</div>
            </div>
            <div style={{ textAlign: 'center', padding: '0 12px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 7, color: 'var(--text-muted)', letterSpacing: '1px' }}>PRESSURE GAP</div>
              <div
                style={{
                  fontFamily: 'Bebas Neue',
                  fontSize: 36,
                  lineHeight: 1,
                  color: (naiLatest?.gap_size ?? 0) > 30 ? 'var(--accent-red)' : (naiLatest?.gap_size ?? 0) > 15 ? 'var(--accent-orange)' : 'var(--text-muted)',
                  textShadow: (naiLatest?.gap_size ?? 0) > 30 ? '0 0 20px rgba(224,82,82,0.4)' : 'none',
                }}
              >
                +{naiLatest?.gap_size ?? 0}
              </div>
              <div
                style={{
                  fontFamily: 'IBM Plex Mono',
                  fontSize: 7,
                  letterSpacing: '1px',
                  color: (naiLatest?.gap_size ?? 0) > 30 ? 'var(--accent-red)' : 'var(--text-muted)',
                }}
              >
                {(naiLatest?.gap_size ?? 0) > 30 ? '⚠ CRITICAL' : (naiLatest?.gap_size ?? 0) > 15 ? '△ ELEVATED' : '● NORMAL'}
              </div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 3 }}>LATENT</div>
              <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--accent-orange)', lineHeight: 1 }}>{naiLatest?.latent_score ?? '—'}</div>
              <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)' }}>Hidden pressure</div>
            </div>
          </div>

          {(naiLatest?.gap_size ?? 0) > 30 && (
            <div
              style={{
                margin: '8px 14px',
                padding: '8px 12px',
                background: 'rgba(224,82,82,0.07)',
                borderLeft: '3px solid var(--accent-red)',
                border: '1px solid rgba(224,82,82,0.25)',
                fontFamily: 'IBM Plex Mono',
                fontSize: 10,
                color: 'var(--accent-red)',
                letterSpacing: '0.5px',
                lineHeight: 1.5,
              }}
            >
              ⚠ RED LINE PROXIMITY — Expressed/latent gap: {naiLatest!.gap_size} points. Pressure significantly exceeds public behavior.
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            {/* Global live ticker */}
            <div
              style={{
                overflow: 'hidden',
                height: 28,
                background: 'rgba(224,82,82,0.04)',
                borderBottom: '1px solid var(--border)',
                borderTop: '1px solid rgba(224,82,82,0.15)',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <span
                style={{
                  flexShrink: 0,
                  padding: '0 10px',
                  fontFamily: 'IBM Plex Mono',
                  fontSize: 8,
                  color: 'var(--accent-red)',
                  letterSpacing: '2px',
                  borderRight: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                ◉ LIVE
              </span>
              <div style={{ overflow: 'hidden', flex: 1 }}>
                <div className="war-ticker-inner">
                  {[...(tickerArticles ?? []), ...(tickerArticles ?? [])].map((a, i) => (
                    <a
                      key={`${a.id}-${i}`}
                      href={a.url ?? '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 8,
                        padding: '0 20px',
                        borderRight: '1px solid var(--border)',
                        textDecoration: 'none',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                        fontFamily: 'IBM Plex Mono',
                        fontSize: 9,
                        color: 'var(--text-secondary)',
                        letterSpacing: '0.3px',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontSize: 8 }}>{(a.country ?? 'INTL').toUpperCase().slice(0, 6)}</span>
                      <span style={{ color: 'var(--border-bright)' }}>|</span>
                      {(a.title ?? '').slice(0, 80)}
                      {(a.title?.length ?? 0) > 80 ? '…' : ''}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            {/* Live feed - top ~55% */}
            <div style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '8px 14px', fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '1px' }}>
                ▸ LIVE INTELLIGENCE — {activeReport?.country_name ?? activeCountry} — UPDATING EVERY 60s
              </div>
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredArticles.length === 0 ? (
                  <p className="redacted" style={{ padding: 14 }}>{'// NO DATA AVAILABLE'}</p>
                ) : (
                  filteredArticles.map((a) => (
                    <div key={a.id} className="warroom-item">
                      <div className="warroom-item-meta">
                        <span className="timestamp">{formatTime(a.published_at)}</span>
                        <span className="source-name">{a.source_name ?? '—'}</span>
                        {a.source_type && (
                          <span className={`source-type-badge ${(a.source_type ?? '').toLowerCase().replace(/\s+/g, '_')}`}>
                            {a.source_type}
                          </span>
                        )}
                        {a.sentiment && (
                          <span className={`sentiment-badge ${(a.sentiment ?? 'neutral').toLowerCase()}`} style={{ fontSize: 8 }}>
                            {a.sentiment}
                          </span>
                        )}
                      </div>
                      <a href={a.url ?? '#'} target="_blank" rel="noopener noreferrer" className="warroom-title">
                        {a.title ?? '—'} ↗
                      </a>
                      {a.summary && <p className="warroom-summary">{a.summary}</p>}
                      {a.tags && a.tags.length > 0 && (
                        <div className="warroom-tags">
                          {a.tags.map((tag) => (
                            <span key={tag} className="tag">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom row - 3 or 4 columns: Elite, Risks/Stabilizers, Social, optional Economic Stress */}
            <div style={{ flex: '0 0 45%', display: 'grid', gridTemplateColumns: contentJson?.economic_exposure ? '1fr 1fr 1fr 1fr' : '1fr 1fr 1fr', gap: 0, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12 }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '1px', marginBottom: 8 }}>▸ ELITE NETWORK</div>
                <hr className="data-rule" />
                {eliteNetwork.length === 0 ? (
                  <p className="redacted" style={{ fontSize: 10, marginTop: 8 }}>{'// NO DATA AVAILABLE'}</p>
                ) : (
                  eliteNetwork.map((p, i) => (
                    <div key={i} style={{ marginTop: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 11 }}>{p.name ?? '—'}</div>
                      <div style={{ color: 'var(--accent-gold)', fontFamily: 'IBM Plex Mono', fontSize: 9 }}>{p.role ?? '—'}</div>
                      {p.position && <div style={{ color: 'var(--text-secondary)', fontSize: 10, marginTop: 4 }}>{p.position}</div>}
                      {p.red_line && <div style={{ color: 'var(--accent-red)', fontSize: 10, marginTop: 4 }}>⚠ {p.red_line}</div>}
                    </div>
                  ))
                )}
              </div>
              <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12 }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '1px', marginBottom: 8 }}>▸ KEY RISKS</div>
                <hr className="data-rule" />
                {keyRisks.length === 0 ? <p className="redacted" style={{ fontSize: 10, marginTop: 8 }}>{'// NONE'}</p> : keyRisks.map((r, i) => <div key={i} style={{ color: 'var(--accent-red)', fontSize: 10, marginTop: 6 }}>▸ {r}</div>)}
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '1px', marginTop: 12, marginBottom: 8 }}>▸ STABILIZERS</div>
                <hr className="data-rule" />
                {stabilizers.length === 0 ? <p className="redacted" style={{ fontSize: 10, marginTop: 8 }}>{'// NONE'}</p> : stabilizers.map((s, i) => <div key={i} style={{ color: 'var(--accent-green)', fontSize: 10, marginTop: 6 }}>▸ {s}</div>)}
              </div>
              <div style={{ borderRight: contentJson?.economic_exposure ? '1px solid var(--border)' : 'none', overflowY: 'auto', padding: 12 }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '1px', marginBottom: 8 }}>▸ SOCIAL PULSE</div>
                <hr className="data-rule" />
                {!socialForCountry ? (
                  <p className="redacted" style={{ fontSize: 10, marginTop: 8 }}>{'// NO DATA AVAILABLE'}</p>
                ) : (
                  <>
                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>Platform: {socialForCountry.platform ?? '—'}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-primary)', marginTop: 4 }}>Trend: {socialForCountry.trend ?? '—'}</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 8, color: mapSentimentDisplay(socialForCountry.sentiment).color, fontFamily: 'IBM Plex Mono', letterSpacing: '0.5px' }}>{mapSentimentDisplay(socialForCountry.sentiment).label}</span>
                    </div>
                    {socialForCountry.engagement_estimate != null && (
                      <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 4 }}>Engagement: {socialForCountry.engagement_estimate >= 1e6 ? `${(socialForCountry.engagement_estimate / 1e6).toFixed(1)}M` : `${(socialForCountry.engagement_estimate / 1e3).toFixed(0)}K`}</div>
                    )}
                  </>
                )}
              </div>
              {contentJson?.economic_exposure && (
                <div style={{ padding: '10px 14px', borderLeft: '1px solid var(--border)', overflowY: 'auto' }}>
                  <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-orange)', letterSpacing: '2px', marginBottom: 10, textTransform: 'uppercase' }}>▸ Economic Stress</div>
                  {Object.entries(contentJson.economic_exposure).map(([key, val]) => {
                    const numVal = typeof val === 'number' ? val : null;
                    const displayVal = typeof val === 'number' ? (val > 1000000 ? `$${(val / 1000000).toFixed(1)}M` : `${val}${key.includes('pct') ? '%' : ''}`) : String(val);
                    const barPct = numVal !== null ? Math.min(numVal > 100 ? 100 : numVal, 100) : null;
                    return (
                      <div key={key} style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 7, color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>{key.replace(/_/g, ' ')}</span>
                          <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: numVal && numVal > 50 ? 'var(--accent-red)' : 'var(--accent-orange)' }}>{displayVal}</span>
                        </div>
                        {barPct !== null && (
                          <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1, marginTop: 3 }}>
                            <div style={{ height: '100%', borderRadius: 1, width: `${barPct}%`, background: barPct > 75 ? 'var(--accent-red)' : barPct > 50 ? 'var(--accent-orange)' : 'var(--accent-gold)', transition: 'width 0.5s ease' }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {contentJson?.key_flashpoints && contentJson.key_flashpoints.length > 0 && (
                    <>
                      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-red)', letterSpacing: '2px', margin: '10px 0 6px', textTransform: 'uppercase' }}>▸ Flashpoints</div>
                      {contentJson.key_flashpoints.map((f: string, i: number) => (
                        <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 4, alignItems: 'flex-start' }}>
                          <span style={{ color: 'var(--accent-red)', fontSize: 9, fontFamily: 'IBM Plex Mono', flexShrink: 0 }}>⚠</span>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>{f}</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside className="warroom-panel warroom-right-panel" style={{ width: 300 }}>
          <div className="warroom-panel-header">
            <span>▸ MARKET WATCH — LIVE</span>
          </div>
          {Object.entries(latestByIndicator).length === 0 ? (
            <p className="redacted" style={{ padding: 14 }}>{'// NO DATA AVAILABLE'}</p>
          ) : (
            Object.entries(latestByIndicator).map(([name, row]) => {
              const isOil = /brent|wti|crude|oil/i.test(name);
              const isVix = /vix/i.test(name);
              const isGold = /gold/i.test(name);
              const isUsdIrr = /usd|irr/i.test(name);
              return (
                <div key={row.id} className="indicator-row">
                  <span className="indicator-name">{name}</span>
                  <span
                    className="indicator-value"
                    style={{
                      color: isOil ? 'var(--accent-gold)' : isVix && (row.change_pct ?? 0) > 0 ? 'var(--accent-red)' : isGold ? 'var(--accent-gold)' : isUsdIrr ? 'var(--accent-orange)' : undefined,
                    }}
                  >
                    {row.value != null ? row.value : '—'} {row.unit ?? ''}
                  </span>
                  <span className={`change ${(row.change_pct ?? 0) >= 0 ? 'up' : 'down'}`}>
                    {(row.change_pct ?? 0) >= 0 ? '▲' : '▼'} {Math.abs(row.change_pct ?? 0).toFixed(1)}%
                  </span>
                </div>
              );
            })
          )}

          <div className="warroom-panel-header" style={{ marginTop: 8 }}>
            <span>▸ SENTIMENT MATRIX</span>
          </div>
          <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px', fontSize: 9, fontFamily: 'IBM Plex Mono' }}>
            {uniqueCountries.slice(0, 12).map((code) => {
              const sentRaw = sentimentByCountry[code] ?? null;
              const { label, color } = mapSentimentDisplay(sentRaw);
              return (
                <span key={code} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span style={{ width: 20 }}>{code}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                  <span style={{ color: 'var(--text-muted)' }}>{label}</span>
                </span>
              );
            })}
          </div>

          <div className="warroom-panel-header" style={{ marginTop: 8 }}>
            <span>▸ ACTIVE DISINFO CLAIMS</span>
          </div>
          {disinfoClaims.length === 0 ? (
            <p className="redacted" style={{ padding: 14 }}>{'// NO DATA AVAILABLE'}</p>
          ) : (
            disinfoClaims.map((c) => (
              <div key={c.id} className="disinfo-row" style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)' }}>
                <span
                  className="verdict-badge"
                  style={{
                    fontSize: 8,
                    padding: '2px 5px',
                    marginRight: 8,
                    color: c.verdict === 'FALSE' ? 'var(--accent-red)' : c.verdict === 'MISLEADING' ? 'var(--accent-orange)' : c.verdict === 'TRUE' ? 'var(--accent-green)' : 'var(--text-muted)',
                    border: '1px solid currentColor',
                  }}
                >
                  {c.verdict ?? 'UNVERIFIED'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--text-secondary)' }}>{(c.claim_text ?? '').slice(0, 80)}…</span>
              </div>
            ))
          )}

          <div className="warroom-panel-header" style={{ marginTop: 8 }}>
            <span>▸ PIPELINE STATUS</span>
          </div>
          <div style={{ padding: '8px 14px', fontSize: 9, fontFamily: 'IBM Plex Mono' }}>
            {['articles', 'markets', 'social', 'disinfo'].map((key) => {
              const status = pipelineStatus(key);
              const color = status === 'green' ? 'var(--accent-green)' : status === 'orange' ? 'var(--accent-orange)' : 'var(--accent-red)';
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ textTransform: 'uppercase', color: 'var(--text-muted)', width: 70 }}>{key}</span>
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{pipelineLabel(key)}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
