import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { getConflictDay } from '@/lib/constants';
import { ScenariosClient } from '@/components/scenarios/ScenariosClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { getScenarioRegistryView } from '@/lib/scenario-registry';

export default async function ScenariosPage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);

  const [{ data: tierRows }, registry] = await Promise.all([
    supabase.from('tier_features').select('feature_key, free_access, informed_access, pro_access'),
    // Names, definitions, status and measurement state from the registry; probabilities from
    // scenario_daily (published rows, each stamped with its method); inputs/flags from scenario_runs.
    getScenarioRegistryView(supabase),
  ]);
  const flags = buildTierFlags(tierRows ?? []);
  const hasDetailAccess = tierHasFeature(user?.tier, 'scenario_detail', flags);

  // currentDay = calendar (DAY LOCK); latestDay = the registry's OWN latest published day.
  const currentDay = getConflictDay();

  return (
    <ScenariosClient
      hasDetailAccess={hasDetailAccess}
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
