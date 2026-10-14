/**
 * The stored theme (and the dismissed translation banner) survive a failed root hydration.
 *
 * When hydration fails at the root (React #418: the server HTML differs from the client render, which
 * in-page translators cause by rewriting text nodes, and which the site invites by recommending browser
 * translate), React re-renders the document and resets <html>'s attributes to its props, wiping the
 * boot script's data-theme and data-tb-dismissed. components/ThemeGuard.tsx re-applies them.
 *
 * Repro: the document response is served with one text node changed (the skip link, rendered at the
 * root), so hydration fails deterministically; a light reader must still be light afterwards.
 *
 *   PW_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/theme-persistence.spec.ts --reporter=list
 */
import { expect, test } from '@playwright/test';

for (const route of ['/', '/timeline'])
  for (const mismatch of [true, false])
    test(`light stays light on ${route}${mismatch ? ' after a forced hydration mismatch' : ''}`, async ({ browser, baseURL }) => {
      const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('mid-theme', 'light');
          localStorage.setItem('mena-translation-dismissed', '1');
        } catch {}
      });
      const errors: string[] = [];
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      if (mismatch)
        await page.route(`${baseURL}${route}`, async (r) => {
          if (r.request().resourceType() !== 'document') return r.continue();
          const res = await r.fetch();
          const html = await res.text();
          // What an in-page translator does: rewrite one rendered text node before React hydrates.
          const changed = html.replace('>Skip to content<', '>Zum Inhalt springen<');
          expect(changed, 'skip link text found in the server HTML').not.toBe(html);
          await r.fulfill({ response: res, body: changed, headers: { ...res.headers(), 'content-length': String(Buffer.byteLength(changed)) } });
        });
      await page.goto(route, { waitUntil: 'load' });
      await page.waitForTimeout(3000);
      if (mismatch) expect(errors.join('\n'), 'the repro must actually break hydration').toMatch(/418|hydrat/i);
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(page.locator('html')).toHaveAttribute('data-tb-dismissed', '');
      expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(255, 255, 255)');
      await ctx.close();
    });

/** The guard never fights the toggle: switching after load sticks, both ways. */
test('the toggle still switches with the guard running', async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem('mid-theme', 'light');
        sessionStorage.setItem('seeded', '1');
      }
    } catch {}
  });
  const page = await ctx.newPage();
  await page.goto('/scenarios', { waitUntil: 'load' });
  await page.waitForTimeout(1500);
  const open = page.locator('header').locator('button[aria-expanded]').filter({ visible: true }).first();
  await open.click();
  const toggle = page.locator('header').getByRole('button', { name: 'Light theme' });
  await toggle.click(); // light -> dark
  await page.waitForTimeout(500);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  expect(await page.evaluate(() => localStorage.getItem('mid-theme'))).toBe('dark');
  await toggle.click(); // dark -> light
  await page.waitForTimeout(500);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await ctx.close();
});
