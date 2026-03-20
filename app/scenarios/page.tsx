import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { ScenariosClient } from '@/components/scenarios/ScenariosClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';

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
    .select('conflict_day, scenario_a, scenario_b, scenario_c, scenario_d')
    .order('conflict_day', { ascending: true });

  return (
    <ScenariosClient
      hasDetailAccess={hasDetailAccess}
      conflictDayBadge={<ConflictDayBadge />}
      scenarioHistory={scenarioHistory ?? []}
    />
  );
}
