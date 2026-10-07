import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import HomeDashboard from './HomeDashboard';
import { NaiBiggestMoveBanner } from '@/components/home/NaiBiggestMoveBanner';
import type { Metadata } from 'next';
import type { Article, ScenarioProbability } from '@/types/supabase';

/**
 * ISR: public, tier-agnostic data (collectors run every 30 min – 6 h, briefs daily). The HTML is
 * served with `s-maxage=300, stale-while-revalidate` so the edge cache answers repeat visits
 * without running the Worker (Cloudflare 1102 under load). Nothing here depends on the visitor.
 */
export const revalidate = 300;

export const metadata: Metadata = {
  title: 'MENA Intel Desk · Live US-Iran Conflict Dashboard',
};

export default async function Page() {
  const supabase = createPublicClient();
  const conflictDay = await getConflictDay();

  // Parallel server-side fetches — data baked into HTML, no loading states
  const [articlesRes, countRes, scenariosRes, briefingRes, marketRes] = await Promise.all([
    supabase.from('articles').select('*').order('published_at', { ascending: false }).limit(3),
    supabase.from('articles').select('*', { count: 'exact', head: true }),
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
    supabase.from('market_data').select('indicator, value, change_pct, unit, conflict_day').order('conflict_day', { ascending: false }).limit(50),
  ]);

  const articles = (articlesRes.data as Article[]) ?? [];
  const articleCount = countRes.count ?? 0;
  const scenarios = (scenariosRes.data as ScenarioProbability[]) ?? [];
  const briefingRow = briefingRes.data as { lead?: string | null; conflict_day?: number | null } | null;
  const topFindingLead = briefingRow?.lead ?? null;
  const briefingDay = briefingRow?.conflict_day ?? null;

  // Build market metrics from latest day
  const marketRows = (marketRes.data ?? []) as { indicator: string; value: number; change_pct: number; unit: string; conflict_day: number }[];
  const latestDay = marketRows[0]?.conflict_day;
  const latest = marketRows.filter((r) => r.conflict_day === latestDay);
  const seen = new Map<string, typeof marketRows[0]>();
  for (const r of latest) {
    const key = (r.indicator ?? '').toLowerCase();
    if (!seen.has(key)) seen.set(key, r);
  }
  const marketMetrics: { label: string; value: string; change: string; up: boolean }[] = [];
  const brent = seen.get('brent crude oil');
  if (brent) marketMetrics.push({ label: 'BRENT', value: `$${brent.value?.toFixed(2) ?? '--'}`, change: brent.change_pct != null ? `${brent.change_pct >= 0 ? '+' : ''}${brent.change_pct.toFixed(1)}%` : '--', up: (brent.change_pct ?? 0) >= 0 });
  const gold = seen.get('gold');
  if (gold) marketMetrics.push({ label: 'GOLD', value: `$${gold.value?.toFixed(0) ?? '--'}`, change: gold.change_pct != null ? `${gold.change_pct >= 0 ? '+' : ''}${gold.change_pct.toFixed(1)}%` : '--', up: (gold.change_pct ?? 0) >= 0 });
  const vix = seen.get('vix (fear index)');
  if (vix) marketMetrics.push({ label: 'VIX', value: vix.value?.toFixed(1) ?? '--', change: vix.change_pct != null ? `${vix.change_pct >= 0 ? '+' : ''}${vix.change_pct.toFixed(1)}%` : '--', up: (vix.change_pct ?? 0) < 0 });
  const sp = seen.get('s&p 500');
  if (sp) marketMetrics.push({ label: 'S&P 500', value: sp.value?.toLocaleString('en-US', { maximumFractionDigits: 0 }) ?? '--', change: sp.change_pct != null ? `${sp.change_pct >= 0 ? '+' : ''}${sp.change_pct.toFixed(1)}%` : '--', up: (sp.change_pct ?? 0) >= 0 });

  return (
    <HomeDashboard
      serverData={{
        conflictDay,
        articleCount,
        articles,
        scenarios,
        topFindingLead,
        briefingDay,
        marketMetrics,
        marketDay: latestDay ?? null,
      }}
    >
      <NaiBiggestMoveBanner />
    </HomeDashboard>
  );
}
