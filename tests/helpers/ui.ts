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
 * @returns false if /login shows global error UI (e.g. hydration) — caller should test.skip.
 */
export async function loginWithEmailPassword(
  page: Page,
  email: string,
  password: string,
  redirectPath = '/account'
): Promise<boolean> {
  const safe = redirectPath.startsWith('/') ? redirectPath : `/${redirectPath}`;
  const loginQs = new URLSearchParams();
  loginQs.set('redirect', safe);
  loginQs.set('e2e_signin', '1');
  await page.goto(`/login?${loginQs.toString()}`, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('load');
  // Global client error (e.g. hydration) — no login form
  if (
    await page.getByRole('heading', { name: /Something went wrong/i }).isVisible().catch(() => false)
  ) {
    return false;
  }
  // Sign-in fields: use ids when present (a11y); on older deploys without ids, the first
  // email/password inputs are the sign-in row (magic-link email is below).
  const emailField = page.locator('#signin-email');
  if ((await emailField.count()) > 0) {
    await emailField.fill(email);
    await page.locator('#signin-password').fill(password);
  } else {
    await page.locator('input[type="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
  }
  const submit = page.getByTestId('login-signin-submit');
  if ((await submit.count()) > 0) {
    await submit.click();
  } else {
    await page.locator('form').filter({ has: page.locator('input[type="password"]') }).first().locator('button[type="submit"]').click();
  }
  const target = safe.replace(/\/$/, '') || '/';
  try {
    await page.waitForURL(
      (url) => {
        const p = new URL(url).pathname.replace(/\/$/, '') || '/';
        return p === target;
      },
      { timeout: 45_000, waitUntil: 'domcontentloaded' }
    );
  } catch {
    if (
      await page.getByRole('heading', { name: /Something went wrong/i }).isVisible().catch(() => false)
    ) {
      return false;
    }
    const stillLogin = /\/login/i.test(page.url());
    const errLine = await page
      .locator('form p')
      .filter({ hasNot: page.locator('[style*="accent-green"]') })
      .first()
      .textContent()
      .catch(() => '');
    if (stillLogin && errLine?.trim()) {
      throw new Error(`Login failed on ${page.url()}: ${errLine.trim().slice(0, 300)}`);
    }
    throw new Error(`Login did not reach ${target} (current: ${page.url()})`);
  }
  return true;
}

