import { createClient } from '@/utils/supabase/server';
import { getUser, getSessionToken } from '@/utils/supabase/server';
import { getDisinfo } from '@/lib/api/disinfo';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { DisinfoTrackerClient } from '@/components/disinfo/DisinfoTrackerClient';

export default async function DisinfoPage() {
  const [user, token, supabase] = await Promise.all([
    getUser(),
    getSessionToken(),
    createClient(),
  ]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  const hasFullAccess = tierHasFeature(user?.tier, 'disinformation_full', flags);

  let data: Array<{ id: string; conflict_day?: number; claim?: string; verdict?: string; source?: string; created_at?: string }> = [];
  let total = 0;
  try {
    const res = await getDisinfo(undefined, token ?? undefined);
    data = (res?.data ?? []) as typeof data;
    total = res?.total ?? data.length;
  } catch {
    data = [];
    total = 0;
  }
  const showing = data.length;

  return (
    <DisinfoTrackerClient
      claims={data}
      hasFullAccess={hasFullAccess}
      total={total}
      showing={showing}
    />
  );
}
