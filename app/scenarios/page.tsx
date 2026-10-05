import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { getConflictDay } from '@/lib/constants';
import { ScenariosClient } from '@/components/scenarios/ScenariosClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { maxConflictDay } from '@/lib/conflict-calendar';
import type { ScenarioProbability } from '@/types/supabase';

export default async function ScenariosPage() {
  const [user, supabase] = await Promise.all([
    getUser(),
    createClient(),
  ]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasDetailAccess = tierHasFeature(user?.tier, 'scenario_detail', flags);

  const { data: scenarioHistory } = await supabase
    .from('scenario_probabilities')
    .select('conflict_day, scenario_a, scenario_b, scenario_c, scenario_d, scenario_e')
    .order('conflict_day', { ascending: true });

  const history = (scenarioHistory ?? []) as ScenarioProbability[];
  // currentDay = calendar (DAY LOCK). The scenario row shown is the calendar day's row if it
  // exists, otherwise scenario_probabilities' OWN latest row — which is labelled below via
  // DataAsOf so a frozen scenario row can never read as today's probabilities.
  const currentDay = getConflictDay();
  const rowForDay = history.find((r) => r.conflict_day === currentDay);
  const serverLatest: ScenarioProbability | null =
    rowForDay ?? (history.length > 0 ? history[history.length - 1]! : null);
  const latestScenarioDay = maxConflictDay(history);

  return (
    <ScenariosClient
      hasDetailAccess={hasDetailAccess}
      conflictDayBadge={
        <>
          <ConflictDayBadge />
          <DataAsOf section="SCENARIOS" latestDay={latestScenarioDay} currentDay={currentDay} className="mt-2" />
        </>
      }
      scenarioHistory={history}
      serverLatest={serverLatest}
    />
  );
}
