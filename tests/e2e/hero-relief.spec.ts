/**
 * Home hero corridor relief in a real browser (components/home/HeroScene.tsx, relief/ReliefLayer.tsx).
 * Run against a local `next start` (or any deployment):
 *
 *   PW_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/hero-relief.spec.ts
 *
 * The GPU is spoofed (renderer string + 8 cores) so that a CAPABLE device is simulated: under reduced
 * motion the relief must still stay a static poster, with no fade and no WebGL. Without reduced motion
 * the WebGL path starts. Test harness only; production code has no override.
 */
import { expect, test, type Page } from '@playwright/test';

const SPOOF_CAPABLE_GPU = `(() => {
  Object.defineProperty(Navigator.prototype, 'hardwareConcurrency', { get: () => 8 });
  for (const C of [window.WebGLRenderingContext, window.WebGL2RenderingContext]) {
    if (!C) continue;
    const g = C.prototype.getParameter;
    C.prototype.getParameter = function (p) {
      if (p === 0x9246 || p === 0x1f01) return 'ANGLE (Test, Spoofed Hardware GPU)';
      return g.call(this, p);
    };
  }
})();`;

// New headless (full Chromium) + SwiftShader: the only way to get a context here; the spoof makes it "hardware".
test.use({ channel: 'chromium', launchOptions: { args: ['--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] } });

async function openHome(page: Page, reducedMotion: 'reduce' | 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.addInitScript(SPOOF_CAPABLE_GPU);
  await page.goto('/', { waitUntil: 'load' });
  await page.waitForSelector('.hero-scene[data-relief-motion]', { timeout: 20_000 });
  await expect(page.locator('[data-relief-poster] [data-lane]')).toHaveCount(3, { timeout: 20_000 });
}

test.describe('hero relief, prefers-reduced-motion: reduce', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('static poster: reduced flag kept, no fade, no WebGL', async ({ page }) => {
    await openHome(page, 'reduce');
    // Behaviour first: the poster is shown at once, with no fade.
    const poster = page.locator('[data-relief-poster]');
    await expect(poster).toHaveCount(1);
    const style = (await poster.getAttribute('style')) ?? '';
    expect(style, 'poster fades in under reduced motion').not.toContain('transition');
    expect(style).toMatch(/opacity:\s*1(;|$)/);
    const scene = page.locator('.hero-scene');
    await expect(scene).toHaveAttribute('data-relief-motion', 'reduced');
    await expect(scene).toHaveAttribute('data-hero-3d', 'off');
    await page.waitForTimeout(1500);
    await expect(page.locator('.hero-scene canvas')).toHaveCount(0);
  });
});

test.describe('hero relief, full motion', () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test('capable device: WebGL relief starts over the poster', async ({ page }) => {
    await openHome(page, 'no-preference');
    await expect(page.locator('.hero-scene')).toHaveAttribute('data-relief-motion', 'full');
    await expect(page.locator('.hero-scene canvas')).toHaveCount(1);
    await expect(page.locator('[data-relief]')).toHaveAttribute('data-relief', 'gl', { timeout: 20_000 });
  });

  test('relief lanes show the same statuses as the CorridorStrip chips', async ({ page }) => {
    await openHome(page, 'no-preference');
    const chips = await page.locator('#home-corridor-strip-h').locator('xpath=ancestor::section[1]').locator('.chip-status').evaluateAll((els) =>
      els.map((e) => e.getAttribute('data-status')),
    );
    const lanes = await page.locator('[data-relief-poster] [data-lane]').evaluateAll((els) =>
      els.map((e) => [e.getAttribute('data-lane'), e.getAttribute('data-status')]),
    );
    expect(chips).toHaveLength(3);
    expect(lanes.map(([, s]) => s)).toEqual(chips); // both in LANE_ORDER: hormuz, bam_redsea, suez
  });
});
