#!/usr/bin/env node
// MENA Intel Desk — daily card renderer.
// Reads public data (PostgREST, publishable/anon key only) + data/chokepoints/latest.json, runs the
// data-quality gates, renders HTML to PNG with Playwright/Chromium at 1080x1350 and 1200x630.
// No model / AI API. Writes nothing to the database.
//
// Usage: node render-card.mjs [--out DIR] [--lang en|ar] [--allow-stale] [--fixture FILE]
//                             [--chokepoints FILE] [--now ISO] [--html-only]
// Exit codes: 0 ok · 1 error · 2 data-quality gate refused · 3 layout overflow refused
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { chokepointView, oddsView, selectChanges, conflictDay } from './lib/model.mjs';
import { runGates } from './lib/gates.mjs';
import { renderHtml, SIZES, fmtDate } from './lib/template.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');
const DEFAULT_SITE = 'mena-intel-desk.mores-cohorts9x.workers.dev';
const truthy = (v) => /^(1|true|yes)$/i.test(String(v || ''));

const { values: args } = parseArgs({
  options: {
    out: { type: 'string', default: join(HERE, 'out') },
    lang: { type: 'string', default: 'en' },
    'allow-stale': { type: 'boolean', default: false },
    fixture: { type: 'string' },
    chokepoints: { type: 'string', default: join(REPO, 'data', 'chokepoints', 'latest.json') },
    now: { type: 'string' },
    'html-only': { type: 'boolean', default: false },
  },
});

function fail(code, msg) {
  console.error(msg);
  process.exit(code);
}

// ---------------------------------------------------------------------------------------------
// Public data access (never a service key)
// ---------------------------------------------------------------------------------------------
function publicKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_PUBLISHABLE_KEY
    || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  if (!key) fail(1, 'card: no public Supabase key (NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY or NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  if (key.startsWith('sb_secret_')) fail(1, 'card: refusing a secret key; the card reads public data only');
  if (key.split('.').length === 3) {
    try {
      const claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8'));
      if (claims.role && claims.role !== 'anon') fail(1, `card: refusing a JWT with role "${claims.role}"; use the anon/publishable key`);
    } catch { /* not a JWT we can read: let PostgREST decide */ }
  }
  return key;
}

async function rest(path) {
  const base = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) fail(1, 'card: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) not set');
  const key = publicKey();
  const res = await fetch(`${base}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) fail(1, `card: GET ${path.split('?')[0]} -> HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

async function loadLive() {
  const registry = await rest('scenarios?select=id,code,group_code,name_en,name_ar,status,display_order&order=display_order.asc');
  const latest = await rest('scenario_daily?select=conflict_day&is_published=is.true&order=conflict_day.desc&limit=1');
  const day = latest[0]?.conflict_day;
  const daily = Number.isInteger(day)
    ? await rest(`scenario_daily?select=scenario_id,conflict_day,method_version,probability,probability_raw,null_reason,horizon_end,recorded_at,is_published,inputs&conflict_day=eq.${day}&is_published=is.true`)
    : [];
  const briefs = await rest('daily_briefings?select=conflict_day,report_type,title,generated_at,updated_at,quality,sections,sections_ar&report_type=eq.general&order=conflict_day.desc&limit=1');
  return { registry, daily, brief: briefs[0] || null };
}

// ---------------------------------------------------------------------------------------------
async function main() {
  const lang = args.lang;
  if (!['en', 'ar'].includes(lang)) fail(1, `card: unknown --lang ${lang}`);
  // Arabic is prepared but disabled until a native Arabic editor has reviewed lib/i18n.mjs.
  // CARD_AR_PREVIEW=true renders a watermarked layout proof for that reviewer; it is never published.
  const arPreview = lang === 'ar' && !truthy(process.env.CARD_AR_REVIEWED) && truthy(process.env.CARD_AR_PREVIEW);
  if (lang === 'ar' && !truthy(process.env.CARD_AR_REVIEWED) && !arPreview) {
    fail(1, 'card: the Arabic card is disabled until a native Arabic editor has reviewed lib/i18n.mjs (set CARD_AR_REVIEWED=true only after that review; CARD_AR_PREVIEW=true renders a watermarked proof).');
  }
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) fail(1, `card: --now ${args.now} is not a date`);

  let data;
  if (args.fixture) {
    data = JSON.parse(readFileSync(args.fixture, 'utf8'));
  } else {
    data = await loadLive();
  }
  const chokepoints = data.chokepoints ?? JSON.parse(readFileSync(args.chokepoints, 'utf8'));

  const sectionsKey = lang === 'ar' ? 'sections_ar' : 'sections';
  const changes = selectChanges(data.brief, { max: 3, sectionsKey });
  const gate = runGates({ chokepoints, registry: data.registry, daily: data.daily, brief: data.brief, changes },
    { now, allowStale: args['allow-stale'] });
  for (const n of gate.notes) console.log(`card: note: ${n}`);
  if (!gate.ok) {
    fail(2, `card: REFUSED to render, ${gate.errors.length} data-quality gate failure(s):\n` + gate.errors.map((e) => `  - ${e}`).join('\n')
      + (gate.errors.some((e) => e.startsWith('STALE')) ? '\n  (re-run with --allow-stale to render stale blocks greyed with their as-of date)' : ''));
  }

  const cp = chokepointView(chokepoints);
  const odds = oddsView(data.registry, data.daily);
  const reviewed = truthy(process.env.CARD_REVIEWED);
  const siteUrl = process.env.CARD_SITE_URL || DEFAULT_SITE;
  const fontDir = pathToFileURL(join(HERE, 'node_modules', '@fontsource')).href;
  const today = conflictDay(now);
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });

  const watermark = arPreview ? 'ARABIC DRAFT · NOT REVIEWED · NOT FOR PUBLICATION' : null;
  const base = { lang, today, now, cp, odds, changes, brief: data.brief, stale: gate.stale, reviewed, siteUrl, fontDir, watermark };
  const files = [];
  let browser;
  try {
    if (!args['html-only']) {
      const { chromium } = await import('playwright-core');
      const launch = { headless: true };
      if (process.env.CARD_CHROME_PATH) launch.executablePath = process.env.CARD_CHROME_PATH;
      else if (process.env.CARD_CHROME_CHANNEL) launch.channel = process.env.CARD_CHROME_CHANNEL;
      browser = await chromium.launch(launch);
    }
    for (const layout of ['portrait', 'landscape']) {
      const { width, height } = SIZES[layout];
      const html = renderHtml({ ...base, layout });
      const stem = `card-${lang}-${width}x${height}${arPreview ? '-PREVIEW' : ''}`;
      const htmlPath = join(outDir, `${stem}.html`);
      writeFileSync(htmlPath, html);
      if (!browser) { files.push(htmlPath); continue; }
      const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
      page.setDefaultTimeout(60000);
      await page.goto(pathToFileURL(htmlPath).href, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      const problems = await page.evaluate(checkLayout);
      if (problems.length) {
        await page.screenshot({ path: join(outDir, `${stem}.REFUSED.png`) });
        fail(3, `card: REFUSED ${stem}: layout overflow:\n` + problems.map((p) => `  - ${p}`).join('\n'));
      }
      const png = join(outDir, `${stem}.png`);
      try {
        await page.screenshot({ path: png, type: 'png', animations: 'disabled' });
      } catch (e) { // one retry: a slow runner can time out while fonts settle
        console.error(`card: screenshot retry for ${stem}: ${String(e).split('\n')[0]}`);
        await page.screenshot({ path: png, type: 'png', animations: 'disabled' });
      }
      await page.close();
      files.push(png);
    }
  } finally {
    if (browser) await browser.close();
  }

  // Alt text (numbers in words for screen readers) and a Telegram caption carrying the source links.
  const lanesAlt = cp.lanes.map((l) => `${l.name} ${l.status.toLowerCase()}, ${l.index.toFixed(1)} percent of 2023 traffic, ${l.transits} transits in the week ${fmtDate(l.weekStart)} to ${fmtDate(l.weekEnd)}`).join('; ');
  const oddsAlt = odds.rows.map((r) => r.kind === 'range' ? `${r.code} ${r.name} between ${r.lo.toFixed(1)} and ${r.hi.toFixed(1)} percent` : `${r.code} ${r.name} ${r.lo.toFixed(1)} percent`).join('; ');
  const alt = `MENA Intel Desk daily card, Day ${today}. Chokepoints (IMF PortWatch, as of ${fmtDate(cp.asOf)}): ${lanesAlt}. `
    + `What changed (General brief Day ${data.brief?.conflict_day}): ${changes.length ? changes.map((c, i) => `${i + 1}. ${c.text} (${c.outlet})`).join(' ') : 'No sourced change today.'} `
    + `Scenario odds to ${fmtDate(odds.horizonEnd)}, market-implied, Day ${odds.day}: ${oddsAlt}. ${reviewed ? 'AI-assisted, analyst-reviewed.' : 'Automated edition.'}`;
  const caption = [
    `MENA Intel Desk · Day ${today} · ${reviewed ? 'AI-assisted, analyst-reviewed' : 'Automated edition'}`,
    `Chokepoints: ${cp.lanes.map((l) => `${l.name} ${l.status.toLowerCase()} (${l.index.toFixed(1)}%)`).join(' · ')}. Transits: IMF PortWatch ${cp.sourceHome || cp.lanes[0]?.sourceUrl || ''}, week ${fmtDate(cp.lanes[0]?.weekStart)}–${fmtDate(cp.lanes[0]?.weekEnd)}`,
    ...changes.map((c, i) => `${i + 1}. ${c.outlet}: ${c.url}`),
    `Odds: ${odds.venues.join(', ')} via market-anchored-v1, Day ${odds.day}. Not our forecast.`,
    `https://${siteUrl}`,
  ].join('\n');
  writeFileSync(join(outDir, `card-${lang}-alt.txt`), alt + '\n');
  writeFileSync(join(outDir, `card-${lang}-caption.txt`), caption.slice(0, 1024) + '\n');
  writeFileSync(join(outDir, `card-${lang}-manifest.json`), JSON.stringify({
    rendered_at: now.toISOString(), conflict_day: today, lang, reviewed, stale: gate.stale, notes: gate.notes,
    blocks: {
      chokepoints: { as_of: cp.asOf, week: cp.commonWeek, source: cp.sourceCredit, urls: [...new Set(cp.lanes.map((l) => l.sourceUrl))] },
      scenarios: { conflict_day: odds.day, recorded_at: odds.recordedAt, method: odds.method, venues: odds.venues, ranges: odds.rows.map(({ code, lo, hi, kind }) => ({ code, lo, hi, kind })), source_urls: odds.sourceUrls },
      brief: { conflict_day: data.brief?.conflict_day, generated_at: data.brief?.generated_at, changes },
    },
    files: files.map((f) => f.replace(outDir + '/', '')),
  }, null, 2) + '\n');
  console.log(`card: rendered Day ${today} (${lang}): ${files.map((f) => f.replace(outDir + '/', '')).join(', ')} -> ${outDir}`);
}

// Runs inside the page. Returns a list of layout problems (empty = OK).
function checkLayout() {
  const out = [];
  const card = document.getElementById('card');
  const cs = getComputedStyle(card);
  const limit = card.getBoundingClientRect().bottom - parseFloat(cs.paddingBottom) + 0.5;
  const right = card.getBoundingClientRect().right - parseFloat(cs.paddingRight) + 0.5;
  const left = card.getBoundingClientRect().left + parseFloat(cs.paddingLeft) - 0.5;
  for (const el of card.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    if (el.closest('.trk,.bar,.axl,.wmbox')) continue; // drawn marks may sit on the axis ends
    const id = `${el.tagName.toLowerCase()}.${el.className || ''} "${(el.textContent || '').trim().slice(0, 40)}"`;
    if (r.bottom > limit) { out.push(`${id} ends at y=${Math.round(r.bottom)} beyond ${Math.round(limit)}`); continue; }
    if (r.right > right || r.left < left) { out.push(`${id} spills horizontally (${Math.round(r.left)}-${Math.round(r.right)})`); continue; }
    if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).whiteSpace === 'nowrap') out.push(`${id} text is clipped`);
  }
  if (!document.fonts.check('500 20px "IBM Plex Mono"') || !document.fonts.check('600 20px "IBM Plex Sans"')) out.push('IBM Plex fonts did not load');
  return [...new Set(out)].slice(0, 20);
}

main().catch((e) => fail(1, `card: ${e?.stack || e}`));
