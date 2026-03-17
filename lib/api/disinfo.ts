import { apiFetch } from '@/lib/api/client';
import type { DisinfoApiResponse } from '@/types';

export async function getDisinfo(
  day?: number,
  token?: string
): Promise<DisinfoApiResponse> {
  return apiFetch<DisinfoApiResponse>('api-disinfo', {
    params: day !== undefined ? { day } : undefined,
    token,
  });
}
