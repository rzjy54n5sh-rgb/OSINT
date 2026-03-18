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

export async function loginWithEmailPassword(page: Page, email: string, password: string) {
  await page.goto('/login?redirect=/account');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|login/i }).click();
  // Allow redirect back
  await page.waitForURL(/\/account/, { timeout: 30_000 });
}

