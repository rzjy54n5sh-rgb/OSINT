import type { Metadata } from 'next';
import { createClient, getUser } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { NAI_V2_METHOD, NAI_V2_TABLE } from '@/lib/nai-v2';
import { getScenarioRegistryView } from '@/lib/scenario-registry';
import AnalyticsClient, { type PostureRow, type ScenarioDayRow } from './AnalyticsClient';

export const metadata: Metadata = {
  title: 'Analytics — War Posture & Scenario Explorer — MENA Intel Desk',
  description:
    'Plot War Posture (expressed, latent band midpoint, gap) and market-anchored scenario probabilities against each other. Current methods only; retired Days 1–35 series are excluded.',
};

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

export default async function AnalyticsPage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const [{ data: tierRows }, { data: wp }, registry] = await Promise.all([
    supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access'),
    // War Posture only (nai_scores_v2, current method). Legacy nai_scores (Days 1-35) is a retired,
    // non-comparable axis and is never plotted here.
    supabase
      .from(NAI_V2_TABLE)
      .select('country_code, conflict_day, expressed_score, latent_low, latent_high, gap')
      .eq('method_version', NAI_V2_METHOD)
      .order('conflict_day', { ascending: true })
      .limit(1000),
    getScenarioRegistryView(supabase),
  ]);
  const flags = buildTierFlags(tierRows ?? []);
  const latentAccess = tierHasFeature(user?.tier, 'nai_latent_score', flags);
  const gapAccess = tierHasFeature(user?.tier, 'nai_gap_analysis', flags);

  // Tier-gated fields are nulled here, server-side, same as /nai.
  const posture: PostureRow[] = ((wp ?? []) as Record<string, unknown>[]).map((r) => {
    const lo = num(r.latent_low);
    const hi = num(r.latent_high);
    return {
      country_code: String(r.country_code),
      conflict_day: Number(r.conflict_day),
      expressed_score: num(r.expressed_score),
      latent_mid: latentAccess && lo !== null && hi !== null ? (lo + hi) / 2 : null,
      gap: gapAccess ? num(r.gap) : null,
    };
  });

  // Scenarios: only the latest published method (market-anchored-v1); legacy desk days excluded.
  const method = registry.latestMethod;
  const byDay = new Map<number, ScenarioDayRow>();
  for (const p of registry.history) {
    if (p.method_version !== method) continue;
    const row = byDay.get(p.conflict_day) ?? { conflict_day: p.conflict_day };
    row[`scenario_${p.code.toLowerCase()}`] = p.probability;
    byDay.set(p.conflict_day, row);
  }
  const scenarioDays = Array.from(byDay.values()).sort((a, b) => a.conflict_day - b.conflict_day);
  const scenarioCodes = registry.scenarios
    .filter((s) => s.group_code === 'core' && s.status !== 'retired')
    .map((s) => ({ code: s.code, name: s.name_en }));

  return (
    <AnalyticsClient
      posture={posture}
      scenarioDays={scenarioDays}
      scenarioCodes={scenarioCodes}
      scenarioMethod={method}
      latentAccess={latentAccess}
      gapAccess={gapAccess}
    />
  );
}
