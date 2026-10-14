import { pageMetadata } from '@/lib/site';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import HomeDashboard from './HomeDashboard';
import { NaiBiggestMoveBanner } from '@/components/home/NaiBiggestMoveBanner';
import { ScenarioRow } from '@/components/home/ScenarioRow';
import { CorridorStrip } from '@/components/corridors/CorridorStrip';
import { getCorridors } from '@/lib/corridors';
import { reliefLaneStyles } from '@/components/home/relief/model';
import { getScenarioRegistryView } from '@/lib/scenario-registry';
import { buildScenarioRow } from '@/lib/scenario-row';
import type { Metadata } from 'next';
import type { Article, MarketData, ScenarioProbability } from '@/types/supabase';
import { filterHomeFeed, HOME_FEED_FETCH_ROWS } from '@/lib/home-feed';
import { buildHomeMarketMetrics, MARKET_LATEST_COLUMNS, MARKET_LATEST_ROWS } from '@/lib/market-latest';

/**
 * ISR: public, tier-agnostic data (collectors run every 30 min – 6 h, briefs daily). The HTML is
 * served with `s-maxage=300` (Next also appends stale-while-revalidate, which Cloudflare ignores
 * when s-maxage is present) so the edge cache answers repeat visits without running the Worker (Cloudflare 1102 under load). Nothing here depends on the visitor.
 */
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: 'MENA Intel Desk — Live Conflict & Corridor Risk Dashboard',
  description:
    "Today's sourced brief, War Posture by country, market-anchored scenario probabilities and shipping-sensitive market indicators for the US–Iran conflict, the Red Sea and the Horn of Africa.",
  path: '/',
});

export default async function Page() {
  const supabase = createPublicClient();
  const conflictDay = await getConflictDay();

  // Parallel server-side fetches — data baked into HTML, no loading states
  const [articlesRes, countRes, scenariosRes, briefingRes, marketRes, recentTypesRes, registry] = await Promise.all([
    // Read a window and keep the first 3 in-scope items (lib/home-feed.ts: scope flag, else the documented
    // off-theatre Telegram list). Only this tile is filtered; /feed and /warroom show everything.
    // Only the columns the tile renders plus what the scope filter reads (summary, content_json); the
    // filter inputs are dropped again below so they are not serialised into the cached HTML.
    supabase
      .from('articles')
      .select('id, title, summary, content_json, source_name, source_logo_url, source_type, conflict_day, published_at, confidence_score')
      .order('published_at', { ascending: false })
      .limit(HOME_FEED_FETCH_ROWS),
    // Estimated, not exact: a full COUNT(*) for a rough total (shown with "≈", lib/article-count.ts).
    supabase.from('articles').select('id', { count: 'estimated', head: true }),
    supabase.from('scenario_probabilities').select('*').order('conflict_day', { ascending: true }),
    // Latest general briefing by daily_briefings' OWN max day (not the nai_scores day, not
    // "exactly today"). Its day is passed through and labelled against the calendar day.
    supabase
      .from('daily_briefings')
      .select('lead, conflict_day')
      .eq('report_type', 'general')
      .order('conflict_day', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Canonical newest row per indicator (lib/market-latest.ts) — the same read and rule as the War Room.
    supabase
      .from('market_data')
      .select(MARKET_LATEST_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: true })
      .limit(MARKET_LATEST_ROWS),
    // Which brief types exist on the latest days (for the home strip: link only what was published).
    supabase.from('daily_briefings').select('conflict_day, report_type').order('conflict_day', { ascending: false }).limit(40),
    // The scenario row reads the SAME registry view /scenarios renders (never the legacy table).
    getScenarioRegistryView(supabase),
  ]);
  if (registry.error) console.error('[home] scenario registry read failed:', registry.error);
  const scenarioRow = buildScenarioRow(registry);

  const articles = filterHomeFeed((articlesRes.data as unknown as Article[]) ?? [], 3).map((a) => ({
    ...a,
    summary: null,
    content_json: null,
  }));
  const articleCount = countRes.error ? null : countRes.count ?? null;
  const scenarios = (scenariosRes.data as ScenarioProbability[]) ?? [];
  const briefingRow = briefingRes.data as { lead?: string | null; conflict_day?: number | null } | null;
  const topFindingLead = briefingRow?.lead ?? null;
  const briefingDay = briefingRow?.conflict_day ?? null;
  const briefingTypes = ((recentTypesRes.data ?? []) as { conflict_day: number; report_type: string }[])
    .filter((r) => r.conflict_day === briefingDay)
    .map((r) => r.report_type);

  // Market tiles: newest row per indicator by created_at, one rounding rule, each with its own timestamp.
  const { metrics: marketMetrics, latestDay } = buildHomeMarketMetrics((marketRes.data ?? []) as MarketData[]);

  // Corridors: ONE view per render, shared by the strip (text) and the hero relief (lane colours), so the
  // relief can never show a status the strip does not print (stale / withheld → UNKNOWN in both).
  const corridorsView = getCorridors(new Date());

  return (
    <HomeDashboard
      serverData={{
        conflictDay,
        articleCount,
        articles,
        scenarios,
        topFindingLead,
        briefingDay,
        briefingTypes,
        marketMetrics,
        marketDay: latestDay ?? null,
      }}
      corridors={<CorridorStrip view={corridorsView} headingId="home-corridor-strip-h" compact />}
      reliefLanes={reliefLaneStyles(corridorsView)}
      scenarioRow={<ScenarioRow row={scenarioRow} currentDay={conflictDay} />}
    >
      <NaiBiggestMoveBanner />
    </HomeDashboard>
  );
}
