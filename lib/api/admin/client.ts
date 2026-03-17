import { apiFetch } from '@/lib/api/client';

/**
 * Admin API base fetch. Always sends the provided token (Bearer).
 * Use from Server Components or Server Actions that have the session.
 */
export async function adminFetch<T>(
  functionName: string,
  options: {
    method?: 'GET' | 'POST' | 'DELETE' | 'PATCH';
    body?: unknown;
    params?: Record<string, string | number | undefined>;
    token: string;
  }
): Promise<T> {
  const { token, ...rest } = options;
  return apiFetch<T>(functionName, { ...rest, token });
}
