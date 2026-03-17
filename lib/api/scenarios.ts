import { apiFetch } from '@/lib/api/client';
import type { ScenariosApiResponse } from '@/types';

export async function getScenarios(
  day?: number,
  token?: string
): Promise<ScenariosApiResponse> {
  return apiFetch<ScenariosApiResponse>('api-scenarios', {
    params: day !== undefined ? { day } : undefined,
    token,
  });
}

export async function getScenariosWithHistory(
  day?: number,
  token?: string
): Promise<ScenariosApiResponse> {
  return apiFetch<ScenariosApiResponse>('api-scenarios', {
    params: { ...(day !== undefined && { day }), history: 'true' },
    token,
  });
}
