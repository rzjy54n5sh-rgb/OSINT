import { test, expect } from '@playwright/test';
import { mustGetEnv } from '../helpers/env';

function baseSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  return url.replace(/\/$/, '');
}

test.describe('Edge Functions smoke (live)', () => {
  test('api-scenarios returns JSON', async ({ request }) => {
    const res = await request.get(`${baseSupabaseUrl()}/functions/v1/api-scenarios`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json).toBeTruthy();
  });

  test('api-nai rejects missing API key when required (status should be 200 or 401/403 depending config)', async ({ request }) => {
    const res = await request.get(`${baseSupabaseUrl()}/functions/v1/api-nai?country=egypt`);
    // Some deployments allow public tiered reads; accept ok or auth error, but never 500
    expect([200, 401, 403]).toContain(res.status());
  });

  test('manage-api-keys requires auth', async ({ request }) => {
    const res = await request.get(`${baseSupabaseUrl()}/functions/v1/manage-api-keys`);
    expect([401, 403, 405]).toContain(res.status());
  });

  test('CSP is present on app HTML response', async ({ request }) => {
    const baseURL = mustGetEnv('PW_BASE_URL');
    const res = await request.get(`${baseURL}/`);
    expect(res.headers()['content-security-policy']).toBeTruthy();
  });
});

