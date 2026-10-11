#!/usr/bin/env node
/**
 * Generates the brand-neutral link-preview image and site icons into public/:
 *   og-default.png  1200×630  masthead "MENA Intel Desk" + descriptor "Corridor risk, measured"
 *   icon.png        512×512
 *   apple-icon.png  180×180
 *   favicon.ico     16/32/48 (PNG-in-ICO)
 *
 * The images carry NO numbers or data (they are shared by every route and must never go stale).
 * Rendered with Playwright's Chromium from inline HTML. Fonts come from Google Fonts (Bebas Neue,
 * IBM Plex Mono); if they cannot be fetched the script stops instead of shipping fallback fonts.
 *
 * Usage:  node scripts/generate-brand-images.mjs
 *   (uses the Chromium that @playwright/test already installed; set PLAYWRIGHT_BROWSERS_PATH if
 *   it lives elsewhere. Behind a proxy, HTTPS_PROXY is passed to Chromium.)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = path.join(root, 'public');

const BG = '#070A0F';
const GOLD = '#E8C547';
const TEXT = '#E8EDF5';

const FONTS =
  '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
  '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@500&display=block" rel="stylesheet">';

const ogHtml = `<!doctype html><html><head><meta charset="utf-8">${FONTS}<style>
  html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:${BG};}
  .frame{position:relative;width:1200px;height:630px;box-sizing:border-box;padding:0 96px;
    display:flex;flex-direction:column;justify-content:center;
    background:
      radial-gradient(900px 520px at 78% 18%, rgba(232,197,71,0.10), transparent 60%),
      radial-gradient(700px 480px at 8% 110%, rgba(74,143,232,0.10), transparent 60%),
      ${BG};}
  .grid{position:absolute;inset:0;
    background-image:linear-gradient(rgba(232,197,71,0.045) 1px, transparent 1px),
      linear-gradient(90deg, rgba(232,197,71,0.045) 1px, transparent 1px);
    background-size:48px 48px;mask-image:linear-gradient(90deg, transparent 0%, #000 45%, #000 100%);}
  svg.routes{position:absolute;right:0;top:0}
  .eyebrow{position:relative;display:flex;align-items:center;gap:14px;margin-bottom:22px}
  .diamond{width:22px;height:22px;background:${GOLD};transform:rotate(45deg);box-shadow:0 0 28px rgba(232,197,71,0.45)}
  .rule{height:1px;width:120px;background:linear-gradient(90deg, ${GOLD}, transparent)}
  h1{position:relative;margin:0;font-family:'Bebas Neue',sans-serif;font-weight:400;font-size:168px;line-height:0.9;
    letter-spacing:6px;color:${TEXT};text-shadow:0 0 40px rgba(232,197,71,0.10)}
  p{position:relative;margin:28px 0 0;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:38px;
    letter-spacing:1px;color:${GOLD}}
  .base{position:absolute;left:96px;right:96px;bottom:56px;height:1px;
    background:linear-gradient(90deg, rgba(232,197,71,0.55), rgba(232,197,71,0.08) 70%, transparent)}
</style></head><body><div class="frame">
  <div class="grid"></div>
  <svg class="routes" width="1200" height="630" viewBox="0 0 1200 630" fill="none" aria-hidden="true">
    <path d="M1240 90 C 1040 140, 930 230, 860 330 S 760 520, 620 700" stroke="rgba(232,197,71,0.22)" stroke-width="2"/>
    <path d="M1240 210 C 1080 240, 1000 300, 950 380 S 880 560, 820 700" stroke="rgba(232,197,71,0.12)" stroke-width="1.5" stroke-dasharray="6 10"/>
    <path d="M1240 -20 C 1100 60, 980 90, 900 170 S 760 300, 700 360" stroke="rgba(74,143,232,0.18)" stroke-width="1.5"/>
    <circle cx="860" cy="330" r="5" fill="${GOLD}" opacity="0.7"/>
    <circle cx="950" cy="380" r="4" fill="${GOLD}" opacity="0.45"/>
    <circle cx="900" cy="170" r="4" fill="#4A8FE8" opacity="0.6"/>
  </svg>
  <div class="eyebrow"><div class="diamond"></div><div class="rule"></div></div>
  <h1>MENA Intel Desk</h1>
  <p>Corridor risk, measured</p>
  <div class="base"></div>
</div></body></html>`;

/** Square icon: gold diamond on the site background. `pad` is the inset as a share of the size. */
const iconHtml = (size, { rounded = false, pad = 0.2 } = {}) => {
  const d = Math.round(size * (1 - pad * 2) / Math.SQRT2); // side of the square before rotation
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
  .bg{width:${size}px;height:${size}px;background:${BG};display:flex;align-items:center;justify-content:center;
    ${rounded ? `border-radius:${Math.round(size * 0.22)}px;` : ''}}
  .d{width:${d}px;height:${d}px;background:${GOLD};transform:rotate(45deg);
    ${size >= 64 ? `box-shadow:0 0 ${Math.round(size * 0.12)}px rgba(232,197,71,0.35);` : ''}}
  .i{width:${Math.round(d * 0.42)}px;height:${Math.round(d * 0.42)}px;background:${BG};margin:auto;position:relative;top:${Math.round(d * 0.29)}px}
</style></head><body><div class="bg"><div class="d">${size >= 64 ? '<div class="i"></div>' : ''}</div></div></body></html>`;
};

/** Packs PNG buffers into one .ico (PNG-compressed entries; supported by every current browser). */
function buildIco(entries) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  const dir = Buffer.alloc(16 * entries.length);
  let offset = 6 + dir.length;
  entries.forEach(({ size, png }, i) => {
    const o = i * 16;
    dir.writeUInt8(size >= 256 ? 0 : size, o);
    dir.writeUInt8(size >= 256 ? 0 : size, o + 1);
    dir.writeUInt8(0, o + 2);
    dir.writeUInt8(0, o + 3);
    dir.writeUInt16LE(1, o + 4);
    dir.writeUInt16LE(32, o + 6);
    dir.writeUInt32LE(png.length, o + 8);
    dir.writeUInt32LE(offset, o + 12);
    offset += png.length;
  });
  return Buffer.concat([header, dir, ...entries.map((e) => e.png)]);
}

async function render(browser, html, width, height, { requireFonts = false } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  if (requireFonts) {
    const ok = await page.evaluate(
      () => document.fonts.check("168px 'Bebas Neue'") && document.fonts.check("500 38px 'IBM Plex Mono'"),
    );
    if (!ok) throw new Error('Brand fonts did not load (Google Fonts unreachable?) — not writing fallback-font images.');
  }
  const png = await page.screenshot({ type: 'png', omitBackground: true, clip: { x: 0, y: 0, width, height } });
  await page.close();
  return png;
}

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});
try {
  const og = await render(browser, ogHtml, 1200, 630, { requireFonts: true });
  fs.writeFileSync(path.join(publicDir, 'og-default.png'), og);

  fs.writeFileSync(path.join(publicDir, 'icon.png'), await render(browser, iconHtml(512, { pad: 0.16 }), 512, 512));
  fs.writeFileSync(path.join(publicDir, 'apple-icon.png'), await render(browser, iconHtml(180, { pad: 0.2 }), 180, 180));

  const icoEntries = [];
  for (const size of [16, 32, 48]) {
    icoEntries.push({ size, png: await render(browser, iconHtml(size, { pad: size <= 16 ? 0.06 : 0.12 }), size, size) });
  }
  fs.writeFileSync(path.join(publicDir, 'favicon.ico'), buildIco(icoEntries));

  for (const f of ['og-default.png', 'icon.png', 'apple-icon.png', 'favicon.ico']) {
    console.log(`wrote public/${f} (${fs.statSync(path.join(publicDir, f)).size} bytes)`);
  }
} finally {
  await browser.close();
}
