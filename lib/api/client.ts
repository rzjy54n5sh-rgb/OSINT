/**
 * Base fetch for Supabase Edge Functions. Used by all API wrappers.
 * Do not call Supabase or Edge Functions directly from components.
 */

import { resolveSupabasePublicKey, resolveSupabasePublicUrl } from '@/lib/supabase/resolve-public-env';

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public body?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  functionName: string,
  options?: {
    method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
    body?: unknown;
    params?: Record<string, string | number | undefined>;
    token?: string;
    apiKey?: string;
  }
): Promise<T> {
  const { method = 'GET', body, params, token, apiKey } = options ?? {};
  const BASE = resolveSupabasePublicUrl();
  const ANON_KEY = resolveSupabasePublicKey();
  const url = new URL(`${BASE}/functions/v1/${functionName}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined) url.searchParams.set(k, String(v));
    });
  }
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    apikey: ANON_KEY,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (apiKey) headers['X-MENA-API-Key'] = apiKey;

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
    throw new ApiError(res.statusText, res.status, body);
  }

  const text = await res.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    return text as unknown as T;
  }
}
