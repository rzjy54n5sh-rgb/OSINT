/**
 * Header layout (design system v2): on phones (360, 390, 414 px) and desktop (1024, 1280, 1440 px), with
 * fresh data, a previous-day stamp, stale data, stale + previous-day, no data and (on a
 * NEXT_PUBLIC_ENABLE_AR=1 build) the Arabic toggle and Arabic UI:
 *  - no two header children overlap and every visible control is clickable at its centre;
 *  - the visible stamp never shows a time without its date unless that time is today (UTC);
 *  - with stale data the stale chip and its visible word ("Stale") are on screen;
 *  - the theme toggle ("Light theme", in More on desktop and in the menu on phones) is reachable, switches
 *    <html> to data-theme="light", persists the choice, and the light header passes the same layout audit.
 *
 *   PW_BASE_URL=http://127.0.0.1:3000 npx playwright test tests/e2e/header-layout.spec.ts --reporter=list
 *   (AR build: also set HEADER_EXPECT_AR=1 so the Arabic cases run and the toggle must exist.)
 */
import { expect, test, type BrowserContext, type Page } from '@playwright/test';

const WIDTHS = [360, 390, 414, 1024, 1280, 1440] as const;
const EXPECT_AR = process.env.HEADER_EXPECT_AR === '1';

/** `articleAt: null` = no article at all; `today` = the newest article is from the (page clock's) UTC day. */
type Case = { name: string; articleAt: () => string | null; clock?: string; arUi?: boolean; today: boolean; stale: boolean };
const CASES: Case[] = [
  // 10 minutes ago, but never before 00:00 UTC today (so "today" holds just after midnight too).
  { name: 'fresh', articleAt: () => new Date(Math.max(Date.now() - 10 * 60_000, new Date().setUTCHours(0, 0, 0, 0))).toISOString(), today: true, stale: false },
  // 02:00 UTC with the newest article from 22:40 the day before: must read "13 Oct 22:40 UTC", never "22:40 UTC".
  { name: 'prev-day stamp', clock: '2026-10-14T02:00:00Z', articleAt: () => '2026-10-13T22:40:00Z', today: false, stale: false },
  // Newest article days old: stale chip AND a dated stamp.
  { name: 'stale', articleAt: () => '2026-10-10T00:00:00Z', today: false, stale: true },
  // 13:00 UTC, newest article 22:40 the day before (14 h): stale and from the previous day.
  { name: 'stale + prev-day', clock: '2026-10-14T13:00:00Z', articleAt: () => '2026-10-13T22:40:00Z', today: false, stale: true },
  // No article at all: stale, and no time to show.
  { name: 'no data', articleAt: () => null, today: false, stale: true },
  ...(EXPECT_AR ? [{ name: 'Arabic UI (stale)', arUi: true, articleAt: () => '2026-10-10T00:00:00Z', today: false, stale: true }] : []),
];

async function mockNewestArticle(ctx: BrowserContext, iso: string | null) {
  await ctx.route(/supabase\.co\/rest\/v1\/articles\?select=published_at/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*', 'content-range': '0-0/1' },
      body: JSON.stringify(iso ? [{ published_at: iso }] : []),
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

/** What a sighted visitor reads in the stamp and whether the stale word is on screen. */
async function stampAndStale(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('.sr-only');
    };
    const visibleText = (el: Element): string =>
      [...el.childNodes]
        .map((n) => (n.nodeType === 3 ? n.textContent ?? '' : n instanceof Element && shown(n) ? ` ${visibleText(n)} ` : ''))
        .join('');
    const stamp = document.querySelector('header > div .hdr-stamp');
    const stampText = stamp && shown(stamp) ? visibleText(stamp).replace(/\s+/g, ' ').trim() : null;
    const chip = [...document.querySelectorAll('header > div [data-kind="stale"]')].find(shown) ?? null;
    return { stampText, staleWord: chip ? visibleText(chip).trim() : null };
  });
}

for (const w of WIDTHS)
  for (const c of CASES)
    test(`header at ${w}px — ${c.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
      await mockNewestArticle(ctx, c.articleAt());
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
      if (c.stale) await expect(page.locator('header [data-kind="stale"]').first()).toBeAttached();
      const r = await audit(page);
      const st = await stampAndStale(page);
      await page.screenshot({ path: test.info().outputPath(`header-${w}-${c.name.replace(/\W+/g, '-')}.png`), clip: { x: 0, y: 0, width: w, height: 90 } });
      expect(r, JSON.stringify(r)).toMatchObject({ overlaps: [], notClickable: [], outside: [], pageOverflow: false });
      // A time (HH:MM) on screen carries its date unless it is today's.
      if (!c.today && st.stampText && /\d{2}:\d{2}/.test(st.stampText))
        expect(st.stampText, `stamp "${st.stampText}" shows a time without its date`).toMatch(/\b\d{1,2} [A-Z][a-z]{2}\b/);
      if (c.stale) expect(st.staleWord, 'stale chip with a visible word').toMatch(/Stale/i);
      if (EXPECT_AR) {
        // The language toggle is reachable: in More (desktop) or the menu (below 1200 px).
        const opener = page.locator('header').locator('button[aria-controls], button[aria-expanded]').filter({ visible: true }).first();
        await opener.click();
        await expect(page.locator('header').getByRole('button', { name: /Switch to (Arabic|English)/ })).toBeVisible();
      }
      // Theme toggle: reachable from the More / menu disclosure at every width and state.
      const disclosure = page.locator('header').locator('button[aria-expanded]').filter({ visible: true }).first();
      if ((await disclosure.getAttribute('aria-expanded')) !== 'true') await disclosure.click();
      const themeButton = page.locator('header').getByRole('button', { name: 'Light theme' });
      await expect(themeButton).toBeVisible();
      await expect(themeButton).toHaveAttribute('aria-pressed', 'false');
      await themeButton.click();
      await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
      await expect(themeButton).toHaveAttribute('aria-pressed', 'true');
      expect(await page.evaluate(() => localStorage.getItem('mid-theme'))).toBe('light');
      await page.keyboard.press('Escape');
      const light = await audit(page);
      expect(light, `light: ${JSON.stringify(light)}`).toMatchObject({ overlaps: [], notClickable: [], outside: [], pageOverflow: false });
      await ctx.close();
    });

/** The stored choice is applied before the first frame (no flash); without one the OS light preference is ignored. */
for (const stored of ['light', 'dark', null] as const)
  test(`theme before first paint — stored ${stored ?? 'none'} (OS prefers light)`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 800 }, colorScheme: 'light' });
    await ctx.addInitScript((s) => {
      try {
        if (s) localStorage.setItem('mid-theme', s);
      } catch {}
      requestAnimationFrame(() => {
        (window as unknown as { __firstFrameTheme: string | null }).__firstFrameTheme = document.documentElement.getAttribute('data-theme');
      });
    }, stored);
    const page = await ctx.newPage();
    await page.goto('/scenarios', { waitUntil: 'load' });
    const first = await page.evaluate(() => (window as unknown as { __firstFrameTheme: string | null }).__firstFrameTheme);
    expect(first).toBe(stored === 'light' ? 'light' : stored === 'dark' ? 'dark' : null);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(stored === 'light' ? 'rgb(255, 255, 255)' : 'rgb(11, 15, 20)');
    await ctx.close();
  });
