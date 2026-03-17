import { cache } from 'react';
import type { UserTier } from '@/types';
import { createClient } from '@/utils/supabase/server';

export type TierFlagsMap = Record<
  string,
  { free_access: boolean; informed_access: boolean; pro_access: boolean }
>;

export function tierHasFeature(
  tier: UserTier | undefined | null,
  featureKey: string,
  flags: TierFlagsMap
): boolean {
  if (!tier) return false;
  const f = flags[featureKey];
  if (!f) return false;
  if (tier === 'free') return f.free_access;
  if (tier === 'informed') return f.informed_access;
  return f.pro_access;
}

/** Server-only: fetch tier_features from DB. */
export const getTierFlags = cache(async (): Promise<TierFlagsMap> => {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const map: TierFlagsMap = {};
  for (const r of rows ?? []) {
    map[r.feature_key] = {
      free_access: !!r.free_access,
      informed_access: !!r.informed_access,
      pro_access: !!r.pro_access,
    };
  }
  return map;
});
