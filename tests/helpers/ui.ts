import { expect, type Page } from '@playwright/test';

export async function expectCspPresent(page: Page) {
  const res = await page.request.get(page.url() || '/');
  const csp = res.headers()['content-security-policy'];
  expect(csp, 'CSP header must be present').toBeTruthy();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
}

export async function expectNoReportJsonLeak(page: Page) {
  const html = await page.content();
  expect(html).not.toContain('content_json');
}

/**
 * Sign in via email/password. Waits until browser lands on redirectPath (default /account).
 */
export async function loginWithEmailPassword(
  page: Page,
  email: string,
  password: string,
  redirectPath = '/account'
) {
  const safe = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`;
  await page.goto(`/login?redirect=${encodeURIComponent(safe)}`);
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  const target = safe.replace(/\/$/, '') || '/';
  await page.waitForURL(
    (url) => {
      const p = new URL(url).pathname.replace(/\/$/, '') || '/';
      return p === target;
    },
    { timeout: 30_000 }
  );
}

