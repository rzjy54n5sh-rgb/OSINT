import type { Metadata } from 'next';
import { createPublicClient } from '@/utils/supabase/server';
import { buildTierFlags } from '@/lib/tier';
import { getConflictDay } from '@/lib/constants';
import { ScenariosTierGate } from '@/components/scenarios/ScenariosTierGate';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { getScenarioRegistryView } from '@/lib/scenario-registry';

/**
 * ISR: the registry publishes once a day. Rendered for an anonymous visitor; the tier-dependent
 * panel state is resolved client-side (ScenariosTierGate).
 */
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Scenario Probabilities — Market-Anchored — MENA Intel Desk',
  description:
    'Daily conflict scenario probabilities from the scenario registry, computed by market-anchored-v1 with every driving market, horizon and run flag shown.',
};

export default async function ScenariosPage() {
  const supabase = createPublicClient();

  const [{ data: tierRows }, registry] = await Promise.all([
    supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access'),
    // Names, definitions, status and measurement state from the registry; probabilities from
    // scenario_daily (published rows, each stamped with its method); inputs/flags from scenario_runs.
    getScenarioRegistryView(supabase),
  ]);
  if (registry.error) {
    // Details stay in the server log; the client only gets a neutral flag (no raw DB error text).
    console.error('[scenarios] registry read failed:', registry.error);
    registry.error = 'unavailable';
  }
  const flags = buildTierFlags(tierRows ?? []);

  // currentDay = calendar (DAY LOCK); latestDay = the registry's OWN latest published day.
  const currentDay = getConflictDay();

  return (
    <ScenariosTierGate
      tierFlags={flags}
      registry={registry}
      currentDay={currentDay}
      conflictDayBadge={
        <>
          <ConflictDayBadge />
          <DataAsOf section="SCENARIOS" latestDay={registry.latestDay} currentDay={currentDay} className="mt-2" />
        </>
      }
    />
  );
}
