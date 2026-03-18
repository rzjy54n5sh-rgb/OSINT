import { test, expect } from '@playwright/test';
import { createConfirmedTestUser, deleteAuthUser, deleteTestRowsForUser } from '../helpers/supabaseAdmin';
import { loginWithEmailPassword, expectNoReportJsonLeak } from '../helpers/ui';

test.describe('Production smoke (live)', () => {
  const runTag = `prod-e2e-${new Date().toISOString().slice(0, 10)}`;
  let user: { userId: string; email: string; password: string };

  test.beforeAll(async () => {
    user = await createConfirmedTestUser(runTag);
  });

  test.afterAll(async () => {
    if (!user?.userId) return;
    await deleteTestRowsForUser(user.userId);
    await deleteAuthUser(user.userId);
  });

  test('Homepage loads and shows core nav', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/MENA INTEL DESK/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /FEED/i })).toBeVisible();
    await expect(page.getByRole('link', { name: /NAI/i })).toBeVisible();
  });

  test('Unauthed /account redirects to /login', async ({ page }) => {
    await page.goto('/account');
    await expect(page).toHaveURL(/\/login\?redirect=\/account/);
  });

  test('Email/password login works for test user', async ({ page }) => {
    await loginWithEmailPassword(page, user.email, user.password);
    await expect(page.getByText(/account/i)).toBeVisible();
  });

  test('Free-tier gating: Egypt report does not leak content_json', async ({ page }) => {
    await loginWithEmailPassword(page, user.email, user.password);
    await page.goto('/countries/egypt');
    await expectNoReportJsonLeak(page);
    // Basic signal that page rendered
    await expect(page.getByText(/egypt/i)).toBeVisible();
  });

  test('Security headers present (CSP)', async ({ request }) => {
    const res = await request.get('/');
    expect(res.headers()['content-security-policy']).toBeTruthy();
    expect(res.headers()['x-frame-options']).toBe('DENY');
    expect(res.headers()['x-content-type-options']).toBe('nosniff');
  });
});

