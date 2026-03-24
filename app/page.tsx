import { createClient } from '@/utils/supabase/server';
import { getConflictDay } from '@/utils/supabase/server';
import HomeDashboard from './HomeDashboard';
import { NaiBiggestMoveBanner } from '@/components/home/NaiBiggestMoveBanner';
import type { Article, ScenarioProbability } from '@/types/supabase';

export default async function Page() {
  const [supabase, conflictDay] = await Promise.all([
    createClient(),
    getConflictDay(),
  ]);

  // Parallel server-side fetches — data baked into HTML, no loading states
  const [articlesRes, countRes, scenariosRes, briefingRes, marketRes] = await Promise.all([
    supabase.from('articles').select('*').order('published_at', { ascending: false }).limit(3),
    supabase.from('articles').select('*', { count: 'exact', head: true }),
    supabase.from('scenario_probabilities').select('*').order('conflict_day', { ascending: true }),
    supabase.from('daily_briefings').select('lead').eq('conflict_day', conflictDay).eq('report_type', 'general').maybeSingle(),
    supabase.from('market_data').select('indicator, value, change_pct, unit, conflict_day').order('conflict_day', { ascending: false }).limit(50),
  ]);

  const articles = (articlesRes.data as Article[]) ?? [];
  const articleCount = countRes.count ?? 0;
  const scenarios = (scenariosRes.data as ScenarioProbability[]) ?? [];
  const topFindingLead = (briefingRes.data as { lead?: string } | null)?.lead ?? null;

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
        marketMetrics,
      }}
    >
      <NaiBiggestMoveBanner />
    </HomeDashboard>
  );
}
