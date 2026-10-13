/**
 * Header layout (design system v2): at 1024, 1280 and 1440 px, with fresh data, a previous-day stamp,
 * stale data and (on a NEXT_PUBLIC_ENABLE_AR=1 build) the Arabic toggle and Arabic UI, no two header
 * children overlap and every visible control is clickable at its centre (elementFromPoint returns it).
 *
 *   PW_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/header-layout.spec.ts --reporter=list
 *   (AR build: also set HEADER_EXPECT_AR=1 so the Arabic cases run and the toggle must exist.)
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const WIDTHS = [1024, 1280, 1440] as const;
const EXPECT_AR = process.env.HEADER_EXPECT_AR === '1';

type Case = { name: string; articleAt?: () => string; clock?: string; arUi?: boolean };
const CASES: Case[] = [
  { name: 'fresh', articleAt: () => new Date(Date.now() - 10 * 60_000).toISOString() },
  // 02:00 UTC with the newest article from 22:40 the day before: "Day N · 13 Oct 22:40 UTC".
  { name: 'prev-day stamp', clock: '2026-10-14T02:00:00Z', articleAt: () => '2026-10-13T22:40:00Z' },
  // Newest article three days old: stale chip AND a dated stamp.
  { name: 'stale', articleAt: () => '2026-10-10T00:00:00Z' },
  ...(EXPECT_AR ? [{ name: 'Arabic UI (stale)', arUi: true, articleAt: () => '2026-10-10T00:00:00Z' }] : []),
];

async function mockNewestArticle(ctx: BrowserContext, iso: string) {
  await ctx.route(/supabase\.co\/rest\/v1\/articles\?select=published_at/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
      body: JSON.stringify([{ published_at: iso }]),
    }),
  );
}

/** Visible top-level header controls and blocks in the bar, with boxes and centre hit-tests. */
async function audit(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector('header > div');
    if (!bar) return { error: 'no header bar' };
    const pick = [
      // logo, primary nav links + More, and each child of the right-hand cluster
      ...bar.querySelectorAll(':scope > a, :scope > nav > a, :scope > nav > button, :scope > div > *'),
    ].filter((e) => {
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none';
    });
    const items = pick.map((e) => {
      const r = e.getBoundingClientRect();
      const name = ((e as HTMLElement).innerText || e.getAttribute('aria-label') || e.tagName).trim().replace(/\s+/g, ' ').slice(0, 24);
      const control = e.matches('a, button') ? e : e.querySelector('a, button');
      let clickable = true;
      if (control) {
        const cr = control.getBoundingClientRect();
        const hit = document.elementFromPoint(cr.left + cr.width / 2, cr.top + cr.height / 2);
        clickable = !!hit && (hit === control || control.contains(hit));
      }
      return { name, l: r.left, r: r.right, t: r.top, b: r.bottom, clickable, isControl: !!control };
    });
    const overlaps: string[] = [];
    for (let i = 0; i < items.length; i++)
      for (let j = i + 1; j < items.length; j++) {
        const a = items[i], b = items[j];
        const x = Math.min(a.r, b.r) - Math.max(a.l, b.l);
        const y = Math.min(a.b, b.b) - Math.max(a.t, b.t);
        if (x > 0.5 && y > 0.5) overlaps.push(`${a.name} × ${b.name} (${x.toFixed(1)} px)`);
      }
    const barBox = bar.getBoundingClientRect();
    const outside = items.filter((i) => i.l < barBox.left - 0.5 || i.r > barBox.right + 0.5).map((i) => i.name);
    return {
      overlaps,
      notClickable: items.filter((i) => i.isControl && !i.clickable).map((i) => i.name),
      outside,
      names: items.map((i) => i.name),
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });
}

for (const w of WIDTHS)
  for (const c of CASES)
    test(`header at ${w}px — ${c.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      if (c.articleAt) await mockNewestArticle(ctx, c.articleAt());
      if (c.arUi) await ctx.addCookies([{ name: 'lang', value: 'ar', url: test.info().project.use.baseURL ?? 'http://127.0.0.1:3000' }]);
      await ctx.addInitScript(() => {
        try {
          localStorage.setItem('mena-translation-dismissed', '1');
        } catch {}
      });
      const page = await ctx.newPage();
      if (c.clock) await page.clock.install({ time: new Date(c.clock) });
      await page.goto('/scenarios', { waitUntil: 'load' });
      if (c.clock) await page.clock.runFor(3000);
      await page.waitForTimeout(2500);
      if (c.name.includes('stale')) await expect(page.locator('header [data-kind="stale"]').first()).toBeAttached();
      const r = await audit(page);
      await page.screenshot({ path: test.info().outputPath(`header-${w}-${c.name.replace(/\W+/g, '-')}.png`), clip: { x: 0, y: 0, width: w, height: 90 } });
      expect(r, JSON.stringify(r)).toMatchObject({ overlaps: [], notClickable: [], outside: [], pageOverflow: false });
      if (EXPECT_AR) {
        // The language toggle is reachable: in More (desktop) or the menu (below 1200 px).
        const opener = page.locator('header').locator('button[aria-controls], button[aria-expanded]').filter({ visible: true }).first();
        await opener.click();
        await expect(page.locator('header').getByRole('button', { name: /Switch to (Arabic|English)/ })).toBeVisible();
      }
      await ctx.close();
    });
