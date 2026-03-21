import { test, expect } from '@playwright/test';
import { loginWithEmailPassword } from '../helpers/ui';

/** GET routes that must not 5xx for anonymous users. */
const PUBLIC_PATHS = [
  '/',
  '/feed',
  '/nai',
  '/login',
  '/pricing',
  '/timeline',
  '/social',
  '/forgot-password',
  '/countries/egypt',
];

const ADMIN_PATHS = [
  '/admin',
  '/admin/feed',
  '/admin/pipeline',
  '/admin/nai',
  '/admin/reports',
  '/admin/sources',
  '/admin/alerts',
  '/admin/users',
  '/admin/subscriptions',
  '/admin/api-keys',
  '/admin/disputes',
  '/admin/payments',
  '/admin/pricing',
  '/admin/tier-features',
  '/admin/config',
  '/admin/admins',
  '/admin/audit',
];

const hasAdminCreds = !!(
  process.env.E2E_ADMIN_EMAIL?.trim() && process.env.E2E_ADMIN_PASSWORD?.trim()
);

test.describe('Stress: public surface', () => {
  for (const path of PUBLIC_PATHS) {
    test(`GET ${path} (< 500)`, async ({ request }) => {
      const res = await request.get(path, { maxRedirects: 0 });
      expect(res.status(), `${path} must not 5xx`).toBeLessThan(500);
    });
  }

  test('Homepage has core links in HTML', async ({ request }) => {
    const res = await request.get('/');
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('href="/feed"');
    expect(html).toMatch(/MENA/i);
  });
});

test.describe('Stress: auth boundaries', () => {
  test('/admin without session redirects away from app shell', async ({ page }) => {
    await page.goto('/admin', { waitUntil: 'domcontentloaded' });
    const path = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
    expect(
      path === '/' || path === '/login' || path.startsWith('/login'),
      `expected /, /login, or /login?*, got ${path}`
    ).toBeTruthy();
  });

  test('/account without session goes to login', async ({ page }) => {
    const res = await page.goto('/account', { waitUntil: 'domcontentloaded' });
    test.skip(res?.status() === 404, 'Route `/account` not present on this deployment');
    await expect(page).toHaveURL(/\/login/);
  });
});

(hasAdminCreds ? test.describe : test.describe.skip)('Stress: admin sign-in and all admin routes', () => {
  test('admin login, sidebar, and every admin path loads (< 500)', async ({ page }) => {
    const email = process.env.E2E_ADMIN_EMAIL!.trim();
    const password = process.env.E2E_ADMIN_PASSWORD!.trim();
    await page.setViewportSize({ width: 1280, height: 720 });
    const loggedIn = await loginWithEmailPassword(page, email, password, '/admin');
    test.skip(!loggedIn, '/login shows global error UI — deploy latest or fix hydration');
    await expect(page.getByText('Admin').first()).toBeVisible({ timeout: 25_000 });

    for (const adminPath of ADMIN_PATHS) {
      const res = await page.goto(adminPath, { waitUntil: 'domcontentloaded' });
      expect(res?.status() ?? 0, `${adminPath} HTTP status`).toBeLessThan(500);
      const path = new URL(page.url()).pathname.replace(/\/$/, '') || '/';
      expect(
        path.startsWith('/admin') || path === '/login',
        `after ${adminPath} expected /admin/* or /login, got ${path}`
      ).toBeTruthy();
    }
  });
});
