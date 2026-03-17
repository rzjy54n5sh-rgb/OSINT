import { adminFetch } from '@/lib/api/admin/client';
import type { TierFeature, PlatformConfig } from '@/types';

export async function getPricing(
  token: string
): Promise<Record<string, unknown>> {
  return adminFetch<Record<string, unknown>>('admin-config-pricing', {
    token,
  });
}

export async function updatePricing(
  key: string,
  value: unknown,
  token: string
): Promise<void> {
  await adminFetch('admin-config-pricing', {
    method: 'PATCH',
    token,
    body: { key, value },
  });
}

export async function getFeatureFlags(
  token: string
): Promise<TierFeature[]> {
  const data = await adminFetch<{ features: TierFeature[] }>(
    'admin-config-features',
    { token }
  );
  return data?.features ?? [];
}

export async function updateFeatureFlag(
  featureKey: string,
  tier: string,
  enabled: boolean,
  token: string
): Promise<void> {
  await adminFetch('admin-config-features', {
    method: 'PATCH',
    token,
    body: { featureKey, tier, enabled },
  });
}

export async function getAllConfig(
  token: string
): Promise<PlatformConfig[]> {
  const data = await adminFetch<{ config: PlatformConfig[] }>(
    'admin-config-all',
    { token }
  );
  return data?.config ?? [];
}

export async function updateConfig(
  key: string,
  value: unknown,
  token: string
): Promise<void> {
  await adminFetch('admin-config-all', {
    method: 'PATCH',
    token,
    body: { key, value },
  });
}
