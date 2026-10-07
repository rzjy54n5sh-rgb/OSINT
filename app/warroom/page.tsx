'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { useConflictDay } from '@/hooks/useConflictDay';
import { countryCodeFromValue, countryMatches, formatEngagement, parseEngagementEstimate } from '@/lib/utils';
import { PageBriefing } from '@/components/PageBriefing';
import { ReactionBar } from '@/components/ReactionBar';
import { PageShareButton } from '@/components/PageShareButton';
import { PageShareCard } from '@/components/PageShareCard';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { NaiV2CategoryBadge } from '@/components/nai/NaiV2CategoryBadge';
import { NaiV2Evidence } from '@/components/nai/NaiV2Evidence';
import { NaiPostureLabel } from '@/components/nai/NaiPostureLabel';
import { maxConflictDay } from '@/lib/conflict-calendar';
import { TRACKED_COUNTRY_CODES, NO_SOURCED_DATA_TEXT } from '@/lib/countries';
import { getNaiV2Day, getNaiV2DayRange, formatBand, formatGap, NAI_V2_SCALE_TEXT, type NaiV2View } from '@/lib/nai-v2';
import { parseNarrative } from '@/lib/country-narrative';
import {
  deltaWithinMethod,
  getScenarioRegistryView,
  probabilityOn,
  scenarioColor,
  seriesByMethod,
  type ScenarioRegistryView,
} from '@/lib/scenario-registry';
import type { Article, MarketData, SocialTrend, DisinfoClaim } from '@/types/supabase';

const COUNTRY_EMOJI: Record<string, string> = {
  IR: '🇮🇷', IL: '🇮🇱', IQ: '🇮🇶', YE: '🇾🇪', AE: '🇦🇪', SA: '🇸🇦', EG: '🇪🇬',
  TR: '🇹🇷', RU: '🇷🇺', SY: '🇸🇾', LB: '🇱🇧', JO: '🇯🇴', QA: '🇶🇦', KW: '🇰🇼',
  BH: '🇧🇭', OM: '🇴🇲', PS: '🇵🇸', LY: '🇱🇾', SD: '🇸🇩', DZ: '🇩🇿', MA: '🇲🇦',
  TN: '🇹🇳', CN: '🇨🇳', US: '🇺🇸', GB: '🇬🇧', FR: '🇫🇷', DE: '🇩🇪', IN: '🇮🇳', PK: '🇵🇰',
  ET: '🇪🇹', ER: '🇪🇷', SO: '🇸🇴', DJ: '🇩🇯',
};

/** Only identity + the narrative keys the daily build maintains are read from country_reports. */
interface CountryRow {
  country_code: string;
  country_name: string | null;
  conflict_day: number | null;
  content_json: unknown;
}

/** Sparkline over ONE method's days only (callers never pass mixed methods). */
function buildPoints(values: (number | null)[], w: number, h: number): string {
  const v = values.filter((x): x is number => x !== null);
  if (v.length === 0) return '';
  const min = Math.min(...v);
  const max = Math.max(...v);
  const range = max - min || 1;
  return values
    .map((val, i) => {
      if (val === null) return null;
      const x = values.length === 1 ? w / 2 : (i / (values.length - 1)) * w;
      const y = h - ((val - min) / range) * (h - 2) - 1;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .filter(Boolean)
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

/** "HH:MM UTC" for today, otherwise "YYYY-MM-DD HH:MM UTC" (never a bare time for another day). */
function stamp(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const today = new Date().toISOString().slice(0, 10);
  const day = d.toISOString().slice(0, 10);
  return `${day === today ? '' : `${day} `}${d.toISOString().slice(11, 16)} UTC`;
}

/**
 * Mobile-only layout rules, scoped to this page (beat the global !important rules by specificity).
 * - Fixed-height, scrollable country list and feed: content that loads after first paint no longer
 *   pushes the page (CLS) and the page no longer grows to ~22,000 px.
 * - Panel headers are NOT sticky on mobile and wrap, so the freshness notice cannot overlap the
 *   country block underneath it.
 */
const MOBILE_CSS = `
@media (max-width: 768px) {
  .warroom-page .warroom-grid .warroom-left-panel { height: 42vh !important; max-height: 42vh; overflow-y: auto; }
  .warroom-page .warroom-panel-header { position: static; flex-wrap: wrap; gap: 6px 10px; }
  .warroom-page .warroom-center-head { align-items: flex-start; }
  .warroom-page .warroom-feed { flex: none !important; height: 60vh; }
  .warroom-page .country-row { min-height: 44px; }
}
`;

export default function WarRoomPage() {
  // Calendar day (DAY LOCK); each section labels its OWN table's latest day via DataAsOf.
  const CONFLICT_DAY = useConflictDay();
  const [activeCountry, setActiveCountry] = useState<string>('IR');
  const [lastRefresh, setLastRefresh] = useState<string>('--:--');
  const [countryReports, setCountryReports] = useState<CountryRow[]>([]);
  const [articles, setArticles] = useState<Article[]>([]);
  const [articleCountByCountry, setArticleCountByCountry] = useState<Record<string, number>>({});
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [socialTrends, setSocialTrends] = useState<SocialTrend[]>([]);
  const [registry, setRegistry] = useState<ScenarioRegistryView | null>(null);
  const [disinfoClaims, setDisinfoClaims] = useState<DisinfoClaim[]>([]);
  const [totalArticleCount, setTotalArticleCount] = useState<number>(0);
  const [pipelineTimestamps, setPipelineTimestamps] = useState<Record<string, string | null>>({});
  const [naiRows, setNaiRows] = useState<NaiV2View[]>([]);
  const [naiDay, setNaiDay] = useState<number | null>(null);
  const [tickerArticles, setTickerArticles] = useState<Article[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

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
        { data: disinfoRows, error: disinfoErr },
        { data: tickerRows },
        naiRange,
        reg,
      ] = await Promise.all([
        supabase.from('country_reports').select('country_code, country_name, conflict_day, content_json'),
        supabase.from('articles').select('*').order('published_at', { ascending: false }).limit(500),
        supabase.from('articles').select('*', { count: 'exact', head: true }),
        supabase.from('market_data').select('*').order('created_at', { ascending: false }).limit(200),
        supabase.from('social_trends').select('*').order('conflict_day', { ascending: false }).limit(200),
        supabase.from('disinfo_claims').select('*').order('published_at', { ascending: false }).limit(5),
        supabase.from('articles').select('id, title, url, country, source_name, published_at').order('published_at', { ascending: false }).limit(20),
        // War Posture (nai_scores_v2) — the same scale /nai and /countries show. Legacy nai_scores is never read.
        getNaiV2DayRange(supabase),
        // Scenario registry: names, measurement state, method-stamped probabilities.
        getScenarioRegistryView(supabase),
      ]);
      const wp = naiRange.latestDay != null ? await getNaiV2Day(supabase, naiRange.latestDay, { latent: true, gap: true }) : [];

      const errMsg = reportsErr?.message ?? articlesErr?.message ?? marketErr?.message ?? socialErr?.message ?? disinfoErr?.message ?? reg.error;
      if (errMsg) setFetchError(errMsg);

      setCountryReports((reports as CountryRow[]) ?? []);
      setTotalArticleCount(totalCount ?? 0);

      const arts = (articlesData as Article[]) ?? [];
      setArticles(arts);
      const byCountry: Record<string, number> = {};
      arts.forEach((a) => {
        const c = countryCodeFromValue(a.country) ?? 'OTHER';
        byCountry[c] = (byCountry[c] ?? 0) + 1;
      });
      setArticleCountByCountry(byCountry);

      const markets = (marketRows as MarketData[]) ?? [];
      const social = (socialRows as SocialTrend[]) ?? [];
      const disinfo = (disinfoRows as DisinfoClaim[]) ?? [];
      setMarketData(markets);
      setSocialTrends(social);
      setDisinfoClaims(disinfo);
      setTickerArticles((tickerRows as Article[]) ?? []);
      setNaiRows(wp);
      setNaiDay(naiRange.latestDay);
      setRegistry(reg);

      // Real timestamps from each table's newest row (never the browser clock).
      setPipelineTimestamps({
        articles: arts[0]?.fetched_at ?? arts[0]?.published_at ?? null,
        markets: markets[0]?.created_at ?? null,
        social: social.reduce<string | null>((m, s) => (s.created_at && (!m || s.created_at > m) ? s.created_at : m), null),
        disinfo: disinfo[0]?.published_at ?? null,
      });
      setLastRefresh(new Date().toISOString().slice(11, 16) + ' UTC');
    } catch (e) {
      setFetchError(e instanceof Error ? e.message : 'Failed to load war room data');
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    if (CONFLICT_DAY == null) return;
    fetchAll();
    const interval = setInterval(fetchAll, 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAll uses CONFLICT_DAY from closure
  }, [CONFLICT_DAY]);

  const filteredArticles = activeCountry
    ? articles.filter((a) => countryMatches(a.country, activeCountry)).slice(0, 30)
    : articles.slice(0, 30);

  const reportFor = (code: string) => countryReports.find((r) => r.country_code.toUpperCase() === code) ?? null;
  const activeReport = reportFor(activeCountry);
  const activeName = activeReport?.country_name ?? activeCountry;
  // Only the maintained narrative keys (assessment/key_risks/stabilizers/sources/…); legacy keys ignored.
  const narrative = parseNarrative(activeReport?.content_json ?? null);
  const keyRisks = narrative?.key_risks ?? [];
  const stabilizers = narrative?.stabilizers ?? [];

  const socialForCountry = socialTrends.find((s) => countryMatches(s.country, activeCountry));
  const socialEngagement = parseEngagementEstimate(socialForCountry?.engagement_estimate ?? null);

  // Newest collection per indicator (rows are ordered by created_at desc).
  const latestByIndicator = marketData.reduce<Record<string, MarketData>>((acc, row) => {
    const k = row.indicator ?? 'OTHER';
    if (!acc[k]) acc[k] = row;
    return acc;
  }, {});

  const sentimentByCountry = socialTrends.reduce<Record<string, string>>((acc, s) => {
    const c = countryCodeFromValue(s.country);
    if (c && !acc[c]) acc[c] = s.sentiment ?? 'NEU';
    return acc;
  }, {});

  const pipelineStatus = (key: string): 'green' | 'orange' | 'red' => {
    const raw = pipelineTimestamps[key];
    if (!raw) return 'red';
    const d = new Date(raw);
    if (isNaN(d.getTime())) return 'red';
    const hours = (Date.now() - d.getTime()) / (1000 * 60 * 60);
    if (hours <= 1) return 'green';
    if (hours <= 6) return 'orange';
    return 'red';
  };

  const naiByCode = new Map(naiRows.map((r) => [r.country_code, r]));
  const countries = [...TRACKED_COUNTRY_CODES].sort((a, b) => a.localeCompare(b));
  const posture = naiByCode.get(activeCountry) ?? null;

  // Scenarios: latest published day; sparklines and deltas use ONLY that day's method.
  const scenarioDay = registry?.latestDay ?? null;
  const methodSeries = registry ? seriesByMethod(registry.history) : [];
  const currentSeries = methodSeries.find((m) => m.method === registry?.latestMethod) ?? null;
  const visibleScenarios = (registry?.scenarios ?? []).filter((s) => s.status !== 'retired');
  const scenarioSummary =
    scenarioDay != null && registry
      ? visibleScenarios
          .map((s) => {
            const p = probabilityOn(registry.history, s.code, scenarioDay);
            return `${s.code} ${s.name_en}: ${p === null ? 'unmeasured' : `${p}%`}`;
          })
          .join(' · ') + ` (Day ${scenarioDay}, ${registry.latestMethod})`
      : 'Scenario data loading';

  const marketDay = maxConflictDay(marketData);

  const breakingAlerts = (articles ?? []).filter((a) => {
    if (!a.published_at || !a.url) return false;
    const ageMinutes = (Date.now() - new Date(a.published_at).getTime()) / 60000;
    return (
      ageMinutes < 120 &&
      (a.source_type === 'official' || a.source_type === 'military') &&
      a.sentiment === 'negative'
    );
  });

  const countryRecentCount = (articles ?? []).filter((a) => {
    if (!a.published_at) return false;
    return countryMatches(a.country, activeCountry) && Date.now() - new Date(a.published_at).getTime() < 86400000;
  }).length;
  const confidence = countryRecentCount > 15 ? 'HIGH' : countryRecentCount > 5 ? 'MEDIUM' : 'LOW';
  const confColor = confidence === 'HIGH' ? 'var(--nai-safe)' : confidence === 'MEDIUM' ? 'var(--accent-gold)' : 'var(--accent-red)';

  const mono = { fontFamily: 'IBM Plex Mono' } as const;

  return (
    <div className="warroom-page">
      <style>{MOBILE_CSS}</style>
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
          War room data error: {fetchError}.
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
              fontSize: 11,
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
                  fontSize: 12,
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
              fontSize: 11,
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
          fontSize: 11,
          letterSpacing: '1.5px',
          color: 'var(--text-muted)',
          background: 'var(--bg-secondary)',
          borderBottom: '1px solid var(--border)',
        }}
      >
        <span style={{ color: 'var(--accent-gold)' }}>◆ MENA WAR ROOM</span>
        <span>|</span>
        <span>CONFLICT DAY {CONFLICT_DAY ?? '—'}</span>
        <span>|</span>
        {/* min-widths (incl. 1.5px letter-spacing) reserve the loaded text width so the wrapped mobile bar does not shift (CLS) */}
        <span style={{ display: 'inline-block', minWidth: '25ch' }}>{loaded ? totalArticleCount : '—'} ITEMS IN DB</span>
        <span>|</span>
        <span style={{ display: 'inline-block', minWidth: '32ch' }}>PAGE REFRESHED: {lastRefresh}</span>
        <span>|</span>
        <span>AUTO-REFRESH: 60s</span>
        <span style={{ marginLeft: 'auto', paddingRight: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <PageShareCard label={`WAR ROOM · DAY ${CONFLICT_DAY ?? '—'}`} summary={scenarioSummary} />
          <PageShareButton
            label="SHARE"
            getCopyText={() => {
              const p = naiByCode.get(activeCountry);
              const base = typeof window !== 'undefined' ? window.location.origin : '';
              return p
                ? `${activeName} War Posture ${p.expressed_score ?? '—'} (0 = ceasefire, 100 = escalate) · ${p.category ?? '—'} · Day ${p.conflict_day} — ${base}/warroom`
                : `${activeName} War Posture: ${NO_SOURCED_DATA_TEXT} — ${base}/warroom`;
            }}
          />
        </span>
      </div>

      <PageBriefing
        title="WAR ROOM — UNIFIED INTELLIGENCE VIEW"
        description="A single-screen overview combining live intelligence, War Posture, market indicators, scenario probabilities and disinformation claims. Select a country to focus the panels on it. The page re-reads the database every 60 seconds; each section shows the day its own data belongs to."
        note={`War Posture uses one party-neutral scale for every state: ${NAI_V2_SCALE_TEXT}. Scenario changes are only compared within one method.`}
      />

      <div className="warroom-grid">
        {/* LEFT PANEL */}
        <aside className="warroom-panel warroom-left-panel" style={{ width: 280, minWidth: 0 }} aria-label="Theatre countries">
          <div className="warroom-panel-header">
            <span>◆ THEATRE COUNTRIES</span>
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {countries.length} TRACKED · WAR POSTURE DAY {naiDay ?? '—'}
            </span>
          </div>
          <div>
            {countries.map((code) => {
              const r = naiByCode.get(code) ?? null;
              const name = reportFor(code)?.country_name ?? code;
              const isActive = activeCountry === code;
              const count = articleCountByCountry[code] ?? 0;
              const d = r?.delta ?? null;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => setActiveCountry(code)}
                  className="country-row"
                  data-active={isActive}
                  data-nai={r?.category ?? 'NONE'}
                  aria-pressed={isActive}
                >
                  <span
                    translate="no"
                    title={d === null ? 'No previous War Posture day' : `Expressed score change vs Day ${r?.prevDay}`}
                    style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, fontWeight: 'bold', color: 'var(--text-secondary)', flexShrink: 0, width: 16 }}
                  >
                    {/* neutral colour: a move toward escalation or ceasefire is not "good" or "bad" */}
                    {d === null ? '·' : d > 0 ? '↑' : d < 0 ? '↓' : '→'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }} translate="no">
                    <div className="country-name" style={{ color: 'var(--text-primary)', fontSize: 12, fontWeight: 500 }}>
                      {name}
                    </div>
                    <div className="country-meta" style={{ color: 'var(--text-secondary)', fontSize: 11, marginTop: 2 }}>
                      {r && r.expressed_score !== null ? (
                        <>
                          WP {r.expressed_score}
                          {d !== null && d !== 0 ? ` (${formatGap(d)})` : ''} · {r.category ?? '—'}
                        </>
                      ) : (
                        <>WP — · {NO_SOURCED_DATA_TEXT}</>
                      )}
                    </div>
                  </div>
                  <span className="article-count" style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)' }} title="Articles in the last 500 collected">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
          <div style={{ padding: '12px 0', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1.5px', color: 'var(--accent-gold)', marginBottom: 8, padding: '0 14px' }}>
              SCENARIOS — DAY {scenarioDay ?? '—'}
            </div>
            <DataAsOf section="SCENARIOS" latestDay={scenarioDay} currentDay={CONFLICT_DAY} className="mx-3 mb-2" />
            {registry &&
              visibleScenarios.map((s, i) => {
                const p = probabilityOn(registry.history, s.code, scenarioDay);
                const delta = deltaWithinMethod(registry.history, s.code, scenarioDay);
                const color = scenarioColor(s.code, i);
                const spark = currentSeries ? currentSeries.rows.map((r) => (r[s.code] ?? null) as number | null) : [];
                return (
                  <div
                    key={s.code}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderBottom: '1px solid var(--border)' }}
                    data-testid={`warroom-scenario-${s.code}`}
                  >
                    <span style={{ fontFamily: 'Bebas Neue', fontSize: 14, color, width: 12, flexShrink: 0 }}>{s.code}</span>
                    <span style={{ ...mono, fontSize: 11, color: 'var(--text-secondary)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.name_en}
                    </span>
                    {spark.filter((v) => v !== null).length > 1 && (
                      <svg width={40} height={16} style={{ flexShrink: 0, overflow: 'visible' }} aria-hidden="true">
                        <polyline points={buildPoints(spark, 40, 16)} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity={0.9} />
                      </svg>
                    )}
                    <span style={{ ...mono, fontSize: 12, color: p === null ? 'var(--text-muted)' : color, fontWeight: 500, minWidth: 32, textAlign: 'right', flexShrink: 0 }}>
                      {p === null ? '—' : `${p}%`}
                    </span>
                    <span style={{ ...mono, fontSize: 11, color: 'var(--text-secondary)', minWidth: 30, textAlign: 'right' }} title={delta ? `since Day ${delta.sinceDay}, same method` : undefined}>
                      {p === null ? 'unmeasured' : delta ? `${delta.delta > 0 ? '+' : ''}${delta.delta}` : '—'}
                    </span>
                  </div>
                );
              })}
            <div style={{ padding: '6px 14px', fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', borderTop: '1px solid var(--border)', lineHeight: 1.5 }}>
              {currentSeries
                ? `Changes since Day ${currentSeries.firstDay}, ${currentSeries.method} only. Earlier days used a retired method and are not compared.`
                : 'No published scenario day yet.'}{' '}
              <Link href="/scenarios#method" style={{ color: 'var(--accent-gold)' }}>
                Method →
              </Link>
            </div>
          </div>
        </aside>

        {/* CENTER PANEL */}
        <main className="warroom-panel" style={{ display: 'flex', flexDirection: 'column', borderRight: 'none' }}>
          {/* Selected country header — wraps (never overlaps) on narrow screens */}
          <div className="warroom-panel-header warroom-center-head" style={{ flexShrink: 0, flexWrap: 'wrap', gap: '6px 12px', minHeight: 44 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minWidth: 0 }}>
              <span style={{ fontSize: 18 }} aria-hidden="true">{COUNTRY_EMOJI[activeCountry] ?? '🏳️'}</span>
              <span style={{ color: 'var(--text-primary)', fontSize: 14, fontFamily: 'Bebas Neue' }} data-testid="warroom-country">
                {activeName}
              </span>
              <span style={{ color: 'var(--text-secondary)', fontSize: 11 }} translate="no" data-testid="warroom-wp">
                WAR POSTURE {posture?.expressed_score ?? '—'}
              </span>
              <NaiPostureLabel expressed={posture?.expressed_score ?? null} hideHeading />
              <span style={{ color: 'var(--text-muted)', fontSize: 11 }} translate="no">
                AS OF DAY {posture?.conflict_day ?? naiDay ?? '—'}
              </span>
            </div>
            <DataAsOf section="WAR POSTURE" latestDay={naiDay} currentDay={CONFLICT_DAY} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '5px 14px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1px' }}>FEED COVERAGE</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: confColor, letterSpacing: '2px', border: `1px solid ${confColor}`, padding: '1px 7px' }}>{confidence}</span>
            <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)' }}>{countryRecentCount} articles / 24h</span>
          </div>

          {/* War Posture block — fixed min-height so loading never shifts the feed below it */}
          <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', minHeight: 132 }} data-testid="warroom-posture">
            {!loaded ? (
              <p style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>LOADING WAR POSTURE…</p>
            ) : !posture ? (
              <p style={{ ...mono, fontSize: 12, color: 'var(--text-secondary)' }}>
                No sourced data available{naiDay != null ? ` for Day ${naiDay}` : ''}. No score or category is shown rather than a guessed one.
              </p>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 8, alignItems: 'center' }}>
                  <div>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 3 }}>EXPRESSED</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--text-primary)', lineHeight: 1 }}>{posture.expressed_score ?? '—'}</div>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>Official posture</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0 12px', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1px' }}>GAP</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, lineHeight: 1, color: 'var(--text-primary)' }}>{formatGap(posture.gap)}</div>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>E − band midpoint</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)', letterSpacing: '1px', marginBottom: 3 }}>LATENT</div>
                    <div style={{ fontFamily: 'Bebas Neue', fontSize: 28, color: 'var(--text-primary)', lineHeight: 1 }}>
                      {posture.latent_low === null ? '—' : formatBand(posture.latent_low, posture.latent_high)}
                    </div>
                    <div style={{ ...mono, fontSize: 11, color: 'var(--text-muted)' }}>
                      {posture.latent_low === null ? 'No admissible evidence' : 'Society (band)'}
                    </div>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <NaiV2CategoryBadge
                    category={posture.category}
                    locked={posture.categoryLocked}
                    latentEvidence={posture.latentEvidence}
                    expressed={posture.expressed_score}
                  />
                </div>
              </>
            )}
          </div>

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
                  fontSize: 11,
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
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                        letterSpacing: '0.3px',
                      }}
                    >
                      <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>{(a.country ?? 'INTL').toUpperCase().slice(0, 6)}</span>
                      <span style={{ color: 'var(--border-bright)' }}>|</span>
                      {(a.title ?? '').slice(0, 80)}
                      {(a.title?.length ?? 0) > 80 ? '…' : ''}
                    </a>
                  ))}
                </div>
              </div>
            </div>
            {/* Live feed - top ~55% */}
            <div className="warroom-feed" style={{ flex: '0 0 55%', display: 'flex', flexDirection: 'column', minHeight: 0, borderBottom: '1px solid var(--border)' }}>
              <div style={{ padding: '8px 14px', fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '1px' }}>
                ▸ LIVE INTELLIGENCE — {activeName} — REFRESHES EVERY 60s
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
                          <span className={`source-type-badge ${(a.source_type ?? '').toLowerCase().replace(/\s+/g, '_')}`} translate="no">
                            {a.source_type}
                          </span>
                        )}
                        {a.sentiment && (
                          <span className={`sentiment-badge ${(a.sentiment ?? 'neutral').toLowerCase()}`} style={{ fontSize: 11 }} translate="no">
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
                      <ReactionBar articleId={a.id} articleUrl={a.url} />
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Bottom row — War Posture evidence, risks/stabilizers (daily build), social */}
            <div className="warroom-intel-bottom" style={{ flex: '0 0 45%', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, minHeight: 0, overflow: 'hidden' }}>
              <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12 }} tabIndex={0} aria-label="War Posture evidence">
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '1px', marginBottom: 8 }}>▸ WAR POSTURE EVIDENCE</div>
                <hr className="data-rule" />
                {posture ? (
                  <div style={{ marginTop: 8 }}>
                    <NaiV2Evidence row={posture} compact />
                    <Link href={`/countries/${activeCountry.toLowerCase()}`} style={{ ...mono, fontSize: 11, color: 'var(--accent-gold)', display: 'inline-block', marginTop: 6 }}>
                      Full country page →
                    </Link>
                  </div>
                ) : (
                  <p className="redacted" style={{ fontSize: 12, marginTop: 8 }}>{'// NO SOURCED DATA'}</p>
                )}
              </div>
              <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 12 }} tabIndex={0} aria-label="Key risks and stabilizers">
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '1px', marginBottom: 8 }}>
                  ▸ KEY RISKS{activeReport?.conflict_day != null && narrative ? ` · DAY ${activeReport.conflict_day}` : ''}
                </div>
                <hr className="data-rule" />
                {keyRisks.length === 0 ? <p className="redacted" style={{ fontSize: 12, marginTop: 8 }}>{'// NONE'}</p> : keyRisks.map((r, i) => <div key={i} style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}><span style={{ color: 'var(--accent-red)' }} aria-hidden="true">▸ </span>{r}</div>)}
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '1px', marginTop: 12, marginBottom: 8 }}>▸ STABILIZERS</div>
                <hr className="data-rule" />
                {stabilizers.length === 0 ? <p className="redacted" style={{ fontSize: 12, marginTop: 8 }}>{'// NONE'}</p> : stabilizers.map((s, i) => <div key={i} style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 6 }}><span style={{ color: 'var(--accent-green)' }} aria-hidden="true">▸ </span>{s}</div>)}
              </div>
              <div style={{ overflowY: 'auto', padding: 12 }}>
                <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '1px', marginBottom: 8 }}>▸ SOCIAL PULSE</div>
                <hr className="data-rule" />
                {!socialForCountry ? (
                  <p className="redacted" style={{ fontSize: 12, marginTop: 8 }}>{'// NO DATA AVAILABLE'}</p>
                ) : (
                  <>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Platform: {socialForCountry.platform ?? '—'}</div>
                    <div style={{ fontSize: 12, color: 'var(--text-primary)', marginTop: 4 }}>Trend: {socialForCountry.trend ?? '—'}</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={{ fontSize: 11, color: mapSentimentDisplay(socialForCountry.sentiment).color, fontFamily: 'IBM Plex Mono', letterSpacing: '0.5px' }}>{mapSentimentDisplay(socialForCountry.sentiment).label}</span>
                    </div>
                    {socialForCountry.engagement_estimate != null && (
                      <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4 }}>
                        Engagement: {formatEngagement(socialForCountry.engagement_estimate)}
                        {socialEngagement != null && socialEngagement > 0 && (
                          <span style={{ color: 'var(--text-muted)' }}> ({Math.round(socialEngagement).toLocaleString()})</span>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </main>

        {/* RIGHT PANEL */}
        <aside className="warroom-panel warroom-right-panel" style={{ width: 300 }} aria-label="Markets, sentiment, disinformation">
          <div className="warroom-panel-header">
            <span>▸ MARKET WATCH — {marketDay != null && marketDay === CONFLICT_DAY ? 'LIVE' : 'LATEST'}</span>
          </div>
          {Object.entries(latestByIndicator).length > 0 && (
            <DataAsOf section="MARKETS" latestDay={marketDay} currentDay={CONFLICT_DAY} className="mx-3 my-2" />
          )}
          {Object.entries(latestByIndicator).length === 0 ? (
            <p className="redacted" style={{ padding: 14 }}>{'// NO DATA AVAILABLE'}</p>
          ) : (
            Object.entries(latestByIndicator).map(([name, row]) => (
              <div key={row.id} className="indicator-row" title={row.source ?? undefined}>
                <span className="indicator-name">{name}</span>
                <span className="indicator-value">
                  {row.value != null ? row.value : '—'} {row.unit ?? ''}
                </span>
                {row.change_pct != null && (
                  <span className={`change ${row.change_pct >= 0 ? 'up' : 'down'}`}>
                    {row.change_pct >= 0 ? '▲' : '▼'} {Math.abs(row.change_pct).toFixed(1)}%
                  </span>
                )}
              </div>
            ))
          )}

          <div className="warroom-panel-header" style={{ marginTop: 8 }}>
            <span>▸ SENTIMENT MATRIX</span>
          </div>
          <div style={{ padding: 10, display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px 12px', fontSize: 11, fontFamily: 'IBM Plex Mono' }}>
            {countries.slice(0, 12).map((code) => {
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
                    fontSize: 11,
                    padding: '2px 5px',
                    marginRight: 8,
                    color: c.verdict === 'FALSE' ? 'var(--accent-red)' : c.verdict === 'MISLEADING' ? 'var(--accent-orange)' : c.verdict === 'TRUE' ? 'var(--accent-green)' : 'var(--text-muted)',
                    border: '1px solid currentColor',
                  }}
                >
                  {c.verdict ?? 'UNVERIFIED'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{(c.claim_text ?? '').slice(0, 80)}…</span>
              </div>
            ))
          )}

          <div className="warroom-panel-header" style={{ marginTop: 8 }}>
            <span>▸ LATEST ROW PER FEED</span>
          </div>
          <div style={{ padding: '8px 14px', fontSize: 11, fontFamily: 'IBM Plex Mono' }}>
            {['articles', 'markets', 'social', 'disinfo'].map((key) => {
              const status = pipelineStatus(key);
              const color = status === 'green' ? 'var(--accent-green)' : status === 'orange' ? 'var(--accent-orange)' : 'var(--accent-red)';
              return (
                <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ textTransform: 'uppercase', color: 'var(--text-muted)', width: 70 }}>{key}</span>
                  <span style={{ color: 'var(--text-secondary)', flex: 1 }}>{stamp(pipelineTimestamps[key])}</span>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} aria-label={status === 'green' ? 'under 1 hour old' : status === 'orange' ? '1 to 6 hours old' : 'over 6 hours old or missing'} />
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
