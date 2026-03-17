import { apiFetch } from '@/lib/api/client';
import type { NaiApiResponse } from '@/types';

export async function getNaiScores(
  day?: number,
  token?: string
): Promise<NaiApiResponse> {
  return apiFetch<NaiApiResponse>('api-nai', {
    params: day !== undefined ? { day } : undefined,
    token,
  });
}

export async function getNaiByCountry(
  code: string,
  day?: number,
  token?: string
): Promise<NaiApiResponse> {
  return apiFetch<NaiApiResponse>('api-nai', {
    params: { country: code, ...(day !== undefined && { day }) },
    token,
  });
}
