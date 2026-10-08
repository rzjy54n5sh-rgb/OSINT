import type { UserTier } from '@/types';

export type TierFlags = Record<
  string,
  { free_access: boolean; informed_access: boolean; pro_access: boolean }
>;

export function tierHasFeature(
  tier: UserTier | undefined | null,
  featureKey: string,
  flags: TierFlags
): boolean {
  const f = flags[featureKey];
  if (!f) return false;
  if (tier === 'professional') return f.pro_access;
  if (tier === 'informed') return f.informed_access;
  // free, anonymous (null/undefined) and any unknown value: fail closed to the free tier — an
  // unexpected tier string must never unlock professional features.
  return f.free_access;
}

/** Build TierFlags from tier_features rows (use in Server Components). */
export function buildTierFlags(
  rows: Array<{
    feature_key: string;
    free_access: boolean | null;
    informed_access: boolean | null;
    pro_access: boolean | null;
  }>
): TierFlags {
  const flags: TierFlags = {};
  for (const r of rows) {
    flags[r.feature_key] = {
      free_access: !!r.free_access,
      informed_access: !!r.informed_access,
      pro_access: !!r.pro_access,
    };
  }
  return flags;
}
