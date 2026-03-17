import { apiFetch } from '@/lib/api/client';
import type { CountryApiResponse } from '@/types';

export async function getCountryReport(
  code: string,
  day?: number,
  token?: string
): Promise<CountryApiResponse> {
  return apiFetch<CountryApiResponse>('api-country', {
    params: { code, ...(day !== undefined && { day }) },
    token,
  });
}

export async function getAllCountryReports(
  day?: number,
  token?: string
): Promise<CountryApiResponse> {
  return apiFetch<CountryApiResponse>('api-country', {
    params: day !== undefined ? { day } : undefined,
    token,
  });
}
