import { test, expect } from '@playwright/test';
function baseSupabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL');
  return url.replace(/\/$/, '');
}

/** Same fallbacks as playwright.config.ts baseURL */
function appBaseUrl(): string {
  const u =
    process.env.PW_BASE_URL ||
    process.env.STAGING_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL;
  if (!u) {
    return 'https://mena-intel-desk.mores-cohorts9x.workers.dev';
  }
  return u.replace(/\/$/, '');
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

  test('api-country responds without 500', async ({ request }) => {
    const res = await request.get(`${baseSupabaseUrl()}/functions/v1/api-country?code=EGY`);
    expect(res.status()).toBeLessThan(500);
  });

  test('api-disinfo responds without 500', async ({ request }) => {
    const res = await request.get(`${baseSupabaseUrl()}/functions/v1/api-disinfo`);
    expect(res.status()).toBeLessThan(500);
  });

  test('manage-api-keys requires auth', async ({ request }) => {
    const res = await request.get(`${baseSupabaseUrl()}/functions/v1/manage-api-keys`);
    expect([401, 403, 405]).toContain(res.status());
  });

  test('CSP is present on app HTML response', async ({ request }) => {
    const res = await request.get(`${appBaseUrl()}/`);
    expect(res.headers()['content-security-policy']).toBeTruthy();
  });
});

