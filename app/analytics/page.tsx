import { pageMetadata } from '@/lib/site';
import type { Metadata } from 'next';
import { createClient, getUser } from '@/utils/supabase/server';
import { buildTierFlags, tierHasFeature } from '@/lib/tier';
import { NAI_V2_METHOD, NAI_V2_RPC, NAI_V2_TABLE } from '@/lib/nai-v2';
import { rpcWithFallback } from '@/lib/supabase/rpc-fallback';
import { RESIDUAL_SCENARIO_CODE, getScenarioRegistryView, isResidual, residualComponentCodes } from '@/lib/scenario-registry';
import { residualRange } from '@/lib/scenario-range';
import AnalyticsClient, { type PostureRow, type ScenarioDayRow } from './AnalyticsClient';

export const metadata: Metadata = pageMetadata({
  title: 'Analytics — War Posture & Scenario Explorer — MENA Intel Desk',
  description:
    'Plot War Posture (expressed, latent band midpoint, gap) and market-anchored scenario probabilities against each other. Current methods only; retired Days 1–35 series are excluded.',
  path: '/analytics',
});

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
    // viewer_nai_v2 redacts latent/gap for the session's tier in SQL (the direct column read is
    // denied after migration 20261008090000); the old table read runs only while the RPC is missing.
    rpcWithFallback<Record<string, unknown>[]>(
      () =>
        supabase
          .rpc(NAI_V2_RPC, { p_ascending: true, p_limit: 1000, p_method: NAI_V2_METHOD })
          .select('country_code, conflict_day, expressed_score, latent_low, latent_high, gap'),
      () =>
        supabase
          .from(NAI_V2_TABLE)
          .select('country_code, conflict_day, expressed_score, latent_low, latent_high, gap')
          .eq('method_version', NAI_V2_METHOD)
          .order('conflict_day', { ascending: true })
          .limit(1000),
    ),
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
  // B (none of A, C, D) is a range, not a point: it is offered as its two bounds, never as the
  // single residual (which is only the low end when A, C and D can co-occur).
  const componentCodes = residualComponentCodes(registry.scenarios);
  const scenarioDays = Array.from(byDay.values())
    .sort((a, b) => a.conflict_day - b.conflict_day)
    .map((row) => {
      const resKey = `scenario_${RESIDUAL_SCENARIO_CODE.toLowerCase()}`;
      const comps = Object.fromEntries(componentCodes.map((c) => [c, row[`scenario_${c.toLowerCase()}`] as number | null]));
      const r = row[resKey] == null ? null : residualRange(comps);
      const { [resKey]: _published, ...rest } = row;
      void _published;
      return { ...rest, [`${resKey}_low`]: r ? r.low : null, [`${resKey}_high`]: r ? r.high : null } as ScenarioDayRow;
    });
  const scenarioCodes = registry.scenarios
    .filter((s) => s.group_code === 'core' && s.status !== 'retired')
    .flatMap((s) =>
      isResidual(s.code)
        ? [
            { code: `${s.code}_low`, name: `${s.name_en} — low end of range (100 − sum)` },
            { code: `${s.code}_high`, name: `${s.name_en} — high end of range (100 − largest)` },
          ]
        : [{ code: s.code, name: s.name_en }],
    );

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
