/**
 * Home page v2 (app/HomeDashboard.tsx, lib/home-v2.ts, components/home/ScenarioRow.tsx): what the page
 * actually renders (react-dom/server, frozen fixtures, no clock, no live file values):
 *   1. EG / AE / SA are never ranked or numbered on the home page (no posture row, no score, band or digit).
 *   2. Scenario B is rendered as a range (low–high), never as a single number.
 *   3. No emoji anywhere in the home body.
 *   4. Honest empty states when a source is missing, and no artboard sample value or annotation leaks in.
 *   5. The H1 states exact figures: no rounding word ("under", "nearly", "almost" …) before a number, and
 *      every figure equals the view's own published index.
 *   6. The relief sits in the figure beside the headline; its labels, the relief lanes and the strip chips
 *      come from the same corridors view.
 *   8. Overnight items: the brief's order, each item's first sentence verbatim (never cut inside a quote),
 *      a link to the full item, and each source's party label resolved like the brief reader (registry).
 *   9. Stated quotes carry the STATE/PARTY badge the /nai board shows; quote text exactly as captured.
 *  10. A board that is not War Posture v2 (the v2 read failed) shows "not available", never "nothing coded".
 *  11. Phone odds grid: real text per cell in the accessibility tree; E has no digit.
 *  12. Whitelist: every number in the home body comes from the input data (or fixed scale copy).
 * Each predicate is also run against a deliberately broken render (section 7): it must report the defect,
 * so an assertion that can never fail is caught here.
 *
 *   npx --yes tsx@4.23.13 tests/unit/home-v2.check.ts
 */
import '../helpers/render-env';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import issue1 from '../../scripts/card/test/fixtures/chokepoints-issue1.json';
import malformedBundle from '../../scripts/card/test/fixtures/malformed.json';
import { buildCorridors, fmtPct, type CorridorsView } from '../../lib/corridors';
import { fromV2Row, withheldPolicyRow, type PostureBoard, type PostureView } from '../../lib/posture';
import {
  ROUNDING_WORDS_BEFORE_NUMBER,
  briefSectionAnchor,
  changesSectionIndex,
  correctionNotice,
  corridorH1,
  firstSentence,
  homePosture,
  overnightItems,
  shownOvernightItems,
  splitLead,
  type HomePostureView,
} from '../../lib/home-v2';
import type { OutletRegistry } from '../../lib/outlet-lookup';
import { formatConflictDayDateGb, formatConflictDayShort } from '../../lib/conflict-calendar';
import { sectionAnchors } from '../../components/briefing/BriefSections';
import type { ScenarioRowView } from '../../lib/scenario-row';
import { reliefLaneStyles } from '../../components/home/relief/model';
import { CorridorStrip } from '../../components/corridors/CorridorStrip';
import { ScenarioRow } from '../../components/home/ScenarioRow';
import HomeDashboard, { type HomeServerData } from '../../app/HomeDashboard';
import { HeroScene } from '../../components/home/HeroScene';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(__dirname, '../..');

let failed = 0;
let n = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    n++;
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split("\n").slice(0, 12).join('\n     ') : String(err)}`);
  }
}

// ---- fixtures (frozen; no clock, no live latest.json) ------------------------------------------------
const FIX_CURRENT = buildCorridors(issue1, null, new Date('2026-10-13T09:00:00Z'));
const FIX_STALE = buildCorridors(issue1, null, new Date('2026-10-17T00:01:00Z'));
const FIX_WITHHELD = buildCorridors((malformedBundle as { chokepoints: unknown }).chokepoints, null, new Date('2026-10-08T12:30:00Z'));
const VIEWS: [string, CorridorsView][] = [
  ['current', FIX_CURRENT],
  ['stale', FIX_STALE],
  ['withheld', FIX_WITHHELD],
];

const ANON = { latent: false, gap: false };
const base = {
  actor: 'government', actor_display_name: null, score_day: 230, as_of: '2026-10-15', stance: 'position', label: 'continued_pressure',
  expressed_score: 70, defensive: false, confidence_base: 'medium', confidence_now: 'medium', evidence_kind: 'statement',
  position_quote: 'TEST quote', speaker: 'TEST speaker', speaker_office: 'TEST office', source_url: 'https://example.test/a',
  archive_url: null, party_source: false, stated_at: '2026-10-14T00:00:00+00:00', captured_at: '2026-10-15T00:00:00+00:00',
  evidence_age_days: 1, freshness: 'current', change_reason: 'new_evidence', previous_day: null, withheld: false,
};
const v2 = (o: Record<string, unknown>) => fromV2Row({ ...base, ...o }, ANON);
const CONFLICTS = ['us-iran', 'red-sea-houthi'].map((c, i) => ({
  conflict_code: c, name: c, short_name: `Front ${c}`, description: `TEST ${c}`, theatre: '-', started_on: null, status: 'active', sort_order: i,
}));
const board = (rows: PostureView[]): PostureBoard => ({
  schema: 'v2', day: 231, firstDay: 221, latestDay: 231, conflicts: CONFLICTS, rows, hasLatentAccess: false, hasGapAccess: false,
});
// Hostile rows included: a scored SA row and a scored AE row must never reach the home list.
const BOARD = board([
  v2({ country_code: 'IR', conflict_code: 'us-iran', expressed_score: 72 }),
  v2({ country_code: 'GB', conflict_code: 'us-iran', confidence_now: 'high', expressed_score: 68 }),
  v2({ country_code: 'US', conflict_code: 'red-sea-houthi', label: 'ambivalent', expressed_score: 47 }),
  v2({ country_code: 'AE', conflict_code: 'us-iran', withheld: true, stance: 'withheld', expressed_score: null, label: null, position_quote: 'TEST AE statement', speaker: 'TEST AE speaker' }),
  { ...v2({ country_code: 'SA', conflict_code: 'us-iran', expressed_score: 91, label: 'escalation' }), withheld: false, stance: 'position', expressed_score: 91, label: 'escalation' },
  { ...v2({ country_code: 'AE', conflict_code: 'red-sea-houthi', expressed_score: 33 }), withheld: false, stance: 'position', expressed_score: 33 },
  withheldPolicyRow('EG'),
]);

const SCEN: ScenarioRowView = {
  day: 231,
  method: 'market-anchored-v1',
  horizon: '2026-10-31',
  error: false,
  items: [
    { code: 'A', name: 'TEST deal', kind: 'point', text: '5%', p: 5, low: null, high: null, deltaText: '-18 pts since Day 221 (same method)', reason: null, independent: false, color: '' },
    { code: 'B', name: 'None of A, C or D', kind: 'range', text: '72–81%', p: null, low: 72, high: 81, deltaText: null, reason: null, independent: false, color: '' },
    { code: 'C', name: 'TEST closure', kind: 'point', text: '4%', p: 4, low: null, high: null, deltaText: '-1 pts since Day 221 (same method)', reason: null, independent: false, color: '' },
    { code: 'D', name: 'TEST strike', kind: 'point', text: '19%', p: 19, low: null, high: null, deltaText: '-9 pts since Day 221 (same method)', reason: null, independent: false, color: '' },
    { code: 'E', name: 'TEST UAE', kind: 'unmeasured', text: 'Unmeasured', p: null, low: null, high: null, deltaText: null, reason: 'no market meets the quality floor', independent: true, color: '' },
  ],
};
const SCEN_EMPTY: ScenarioRowView = { day: null, method: null, horizon: null, error: true, items: [] };

const SECTIONS = [
  { id: 'headline', heading: 'Headline', subsections: [{ id: 'h', paragraphs: [{ text: 'TEST headline paragraph.' }] }] },
  {
    id: 'changes',
    heading: 'Overnight changes',
    subsections: [
      {
        id: 'changes-main',
        paragraphs: [
          {
            text: 'TEST alpha strike reported in Aden overnight by the ministry. A second sentence follows here.',
            sources: [{ name: 'TEST Outlet (AFP)', url: 'https://example.test/1', party_source: false }],
          },
          {
            text: 'TEST bravo statement quoted the spokesman saying "Stop. Now we talk." before he left the podium. More detail after.',
            sources: [
              { name: 'Kurdistan 24', url: 'https://www.kurdistan24.net/en/story/1', party_source: false },
              { name: 'TEST State Agency', url: 'https://agency.test/2', party_source: true },
            ],
          },
          { text: 'TEST charlie single sentence without a break', sources: [] },
          { text: 'TEST delta (not shown).', sources: [] },
        ],
      },
    ],
  },
];
/** The registry the brief reader would read: Kurdistan 24 is state_aligned (operator registry, R1). */
const REGISTRY: OutletRegistry = new Map([['host:kurdistan24.net', { name: 'Kurdistan 24', party_status: 'state_aligned' as const }]]);
const OV_ITEMS = shownOvernightItems(overnightItems(SECTIONS), REGISTRY);
const OV_ANCHOR = briefSectionAnchor(SECTIONS, changesSectionIndex(SECTIONS));

const FULL: HomeServerData = {
  conflictDay: 231,
  corridorsView: FIX_CURRENT,
  brief: { day: 231, lead: 'TEST first sentence of the general lead on the Arabian Peninsula. TEST second sentence, kept below.' },
  briefTypes: ['general', 'overnight', 'horn'],
  overnight: { day: 231, generatedAt: '2026-10-16T01:55:19Z', items: OV_ITEMS, anchor: OV_ANCHOR },
  posture: homePosture(BOARD),
  postureConflicts: CONFLICTS,
  postureLabels: { 'https://example.test/sa': { name: 'TEST Saudi Press', known: true, party: true } },
  marketMetrics: [{ label: 'BRENT', value: '$101.01', change: '+1.2%', up: true, asOf: '16 Oct 00:02 UTC' }],
  marketDay: 231,
  trust: { latestCorrection: '2026-10-15T11:42:00Z', forecasts: { open: 2, resolved: 1, chainVerified: true } },
};
const EMPTY: HomeServerData = {
  conflictDay: 231,
  corridorsView: FIX_WITHHELD,
  brief: null,
  briefTypes: [],
  overnight: null,
  posture: homePosture(null),
  postureConflicts: [],
  postureLabels: {},
  marketMetrics: [],
  marketDay: null,
  trust: {},
};

function renderHome(d: HomeServerData, scen: ScenarioRowView = SCEN, opts: { postureOverride?: HomePostureView } = {}): string {
  const data = opts.postureOverride ? { ...d, posture: opts.postureOverride } : d;
  return renderToStaticMarkup(
    h(HomeDashboard, {
      serverData: data,
      corridors: h(CorridorStrip, { view: d.corridorsView, headingId: 'home-corridor-strip-h', compact: true, headless: true }),
      reliefLanes: reliefLaneStyles(d.corridorsView),
      scenarioRow: h(ScenarioRow, { row: scen, currentDay: d.conflictDay }),
    }),
  );
}

const decode = (t: string) =>
  t.replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const text = (html: string) => decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
/** Element `tag` whose opening tag contains `attr`, up to its matching close (counts same-tag nesting). */
function el(html: string, tag: string, attr: string, from = 0): string | null {
  const at = html.indexOf(attr, from);
  if (at < 0) return null;
  const open = html.lastIndexOf(`<${tag}`, at);
  if (open < 0) return null;
  const re = new RegExp(`<${tag}\\b|</${tag}>`, 'g');
  re.lastIndex = open;
  let depth = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0].startsWith('</') ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index + m[0].length);
  }
  return null;
}
function all(html: string, tag: string, attr: string): string[] {
  const out: string[] = [];
  for (let i = html.indexOf(attr); i >= 0; i = html.indexOf(attr, i + attr.length)) {
    const e = el(html, tag, attr, i);
    if (e) out.push(e);
  }
  return out;
}
/** DataAsOf belongs to another workstream (schedule-aware, clock-dependent): its blocks are checked by its own tests. */
const withoutDataAsOf = (html: string) => {
  let out = html;
  for (const e of all(html, 'div', 'data-testid="data-as-of"')) out = out.replace(e, '');
  return out;
};

// ---- predicates (each returns the defects it finds) ----------------------------------------------------
const NO_GRADE = { EG: 'Egypt', AE: 'United Arab Emirates', SA: 'Saudi Arabia' } as const;

function gradeLeaks(html: string, posture: HomePostureView): string[] {
  const out: string[] = [];
  const post = el(html, 'section', 'data-testid="home-posture"');
  if (!post) return ['no posture section'];
  const aside = el(post, 'aside', 'data-testid="home-stated"') ?? '';
  const list = post.replace(aside, '');
  for (const [code, name] of Object.entries(NO_GRADE)) {
    if (list.includes(`data-country="${code}"`)) out.push(`${code} has a scored row`);
    if (text(list).includes(name)) out.push(`${name} named in the scored list`);
  }
  // Each quote is exactly the captured text, in quotation marks: nothing added (no rank, no number).
  for (const b of posture.stated) {
    if (!b.evidence) continue;
    const q = el(aside, 'blockquote', `data-country="${b.code}"`);
    if (!q) { out.push(`${b.code} quote missing`); continue; }
    const p = /<p>([\s\S]*?)<\/p>/.exec(q)?.[1] ?? '';
    if (decode(p) !== `“${b.evidence.quote}”`) out.push(`${b.code} quote altered: ${decode(p)}`);
  }
  // Everything else in the aside, markup and attributes included: no digit, except inside the verbatim quote
  // paragraphs, <time> dates and link targets.
  const rest = aside
    .replace(/<blockquote([^>]*)>\s*<p>[\s\S]*?<\/p>/g, '<blockquote$1>')
    .replace(/<time\b[^>]*>[\s\S]*?<\/time>/g, '');
  const attrs = [...rest.matchAll(/\s([\w-]+)="([^"]*)"/g)].filter((m) => !['href', 'class'].includes(m[1])).map((m) => `${m[1]}="${m[2]}"`);
  for (const where of [text(rest), ...attrs]) {
    const d = /.{0,30}\d.{0,30}/.exec(where);
    if (d) out.push(`digit in the stated aside: "${d[0]}"`);
  }
  if (/data-band|--posture-|chip-num|of 100/.test(aside)) out.push('band or score markup in the stated aside');
  return out;
}

function oddsDefects(html: string): string[] {
  const out: string[] = [];
  const b = el(html, 'li', 'data-testid="home-scenario-B"');
  if (!b) return ['no B item'];
  if (!b.includes('data-kind="range"')) out.push('B is not marked as a range');
  const t = text(b);
  if (!/\d+\s*–\s*\d+%/.test(t)) out.push(`B shows no low–high range: "${t.trim()}"`);
  if (/(^|[^–\d])\d+%(?!\s*–)/.test(t.replace(/\d+\s*–\s*\d+%/g, ''))) out.push(`B shows a single number: "${t.trim()}"`);
  const grid = el(html, 'ul', 'data-testid="home-odds-grid"');
  if (!grid) return [...out, 'no phone odds grid'];
  if (/aria-hidden="true"[^>]*data-testid="home-odds-grid"|data-testid="home-odds-grid"[^>]*aria-hidden/.test(html)) out.push('phone grid hidden from assistive tech');
  const gb = el(grid, 'li', 'data-code="B"');
  const gbt = gb ? text(gb).replace(/\s+/g, ' ').trim() : '';
  if (!/^B \d+–\d+% range$/.test(gbt)) out.push(`phone grid B is not "B low–high% range": "${gbt}"`);
  const ge = el(grid, 'li', 'data-code="E"');
  const get = ge ? text(ge).replace(/\s+/g, ' ').trim() : '';
  if (!/^E — unmeasured, [a-z ]+$/.test(get)) out.push(`phone grid E is not "E — unmeasured, <reason>": "${get}"`);
  const e = el(html, 'li', 'data-testid="home-scenario-E"');
  if (e && /\d/.test(text(e).replace(/Independent · not part of the 100/, ''))) out.push(`E carries a digit: "${text(e).trim()}"`);
  return out;
}

/** Pictographic emoji, flags and the emoji presentation selector. */
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}]/u;
function emoji(html: string): string[] {
  const m = withoutDataAsOf(html).match(new RegExp(EMOJI.source, 'gu'));
  return m ? [`emoji: ${[...new Set(m)].join(' ')}`] : [];
}

/** Values and annotation text printed on the artboards (Day 227–228 sample data): never on the live page. */
const ARTBOARD_LEAKS = [
  '2.8%', '39.6%', '58.6%', '58–78%', '14%', '22%', 'Day 227', 'Day 228', '16:30–01:30', 'Nine days old', 'Explore in 3D', 'Gargash',
  'Abdul Aziz', 'ABC News', 'King Khalid', 'Khamis Mushayt', 'RAF Fairford', 'week 28 Sep', '8 Oct', '13 Oct 2026, 11:42', '3 open forecasts',
];
const stripGaugeTicks = (html: string) => html.replace(/<div class="gaugeScale[\s\S]*?<\/div>/g, '');
function emptyStateDefects(html: string): string[] {
  const out: string[] = [];
  const t = text(stripGaugeTicks(html));
  const need: [string, RegExp][] = [
    ['corridors withheld', /failed their data checks/],
    ['overnight', /No overnight brief has been published yet/],
    ['general brief', /No general briefing is available yet/],
    ['scenarios', /Scenario data is not available just now/],
    ['posture', /War Posture data is not available just now/],
    ['stated', /Statements are not available just now/],
    ['markets', /Market data is not available just now/],
    ['trust: corrections', /Log not available just now/],
    ['trust: track record', /Ledger not available just now/],
  ];
  for (const [what, re] of need) if (!re.test(t)) out.push(`no empty state for ${what}`);
  if (/No government position has been coded/.test(t)) out.push('"nothing coded" shown for an unavailable board');
  if (/\d+(?:\.\d+)?%/.test(t)) out.push(`a percentage with every source missing: "${t.match(/[^.]*\d+(?:\.\d+)?%[^.]*/)?.[0]}"`);
  for (const leak of ARTBOARD_LEAKS) if (t.includes(leak)) out.push(`artboard value "${leak}"`);
  return out;
}
function artboardLeaks(html: string): string[] {
  const t = text(html);
  return ARTBOARD_LEAKS.filter((leak) => t.includes(leak)).map((l) => `artboard value "${l}"`);
}

function h1Defects(html: string, v: CorridorsView): string[] {
  const out: string[] = [];
  const m = /<h1\b[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  if (!m) return ['no h1'];
  const t = text(m[1]).trim();
  if (ROUNDING_WORDS_BEFORE_NUMBER.test(t)) out.push(`rounding word before a number: "${t}"`);
  const printed = [...t.matchAll(/(\d+(?:\.\d+)?)%/g)].map((x) => `${x[1]}%`);
  const allowed = new Set(v.lanes.filter((l) => l.index !== null).map((l) => fmtPct(l.index as number)));
  for (const p of printed) if (!allowed.has(p)) out.push(`figure ${p} is not a published lane index (${[...allowed].join(', ')})`);
  if (v.state === 'withheld' && printed.length) out.push('a figure in the H1 while the file is withheld');
  if (v.state !== 'withheld' && v.lanes.some((l) => l.index !== null) && printed.length === 0) out.push('no exact figure in the H1');
  return out;
}

/** Exact overnight list: these heads, in this order, each with its "full item" link when cut, and these source labels. */
const OV_EXPECTED = [
  { head: 'TEST alpha strike reported in Aden overnight by the ministry.', cut: true, sources: ['TEST Outlet (AFP)'] },
  {
    head: 'TEST bravo statement quoted the spokesman saying "Stop. Now we talk." before he left the podium.',
    cut: true,
    sources: ['Kurdistan 24 State-aligned', 'TEST State Agency Party source'],
  },
  { head: 'TEST charlie single sentence without a break', cut: false, sources: [] },
];
function overnightDefects(html: string): string[] {
  const out: string[] = [];
  const sec = el(html, 'section', 'data-testid="home-since"');
  if (!sec) return ['no since-yesterday section'];
  const lis = all(sec, 'li', '<li');
  const items = lis.filter((li, i) => lis.indexOf(li) === i);
  if (items.length !== OV_EXPECTED.length) out.push(`${items.length} items, expected ${OV_EXPECTED.length}`);
  OV_EXPECTED.forEach((exp, i) => {
    const li = items[i] ?? '';
    const p = /<p class="sinceText">([\s\S]*?)<\/p>/.exec(li)?.[1];
    if (p === undefined || decode(p) !== exp.head) out.push(`item ${i + 1} text: "${p === undefined ? '(none)' : decode(p)}"`);
    const link = /href="([^"]*)"[^>]*>Read the full item/.exec(li)?.[1];
    if (exp.cut && link !== `/briefings/231/overnight#${OV_ANCHOR}`) out.push(`item ${i + 1}: no link to the full item (${link})`);
    if (!exp.cut && link) out.push(`item ${i + 1}: a full-item link on an uncut item`);
    const src = /<p class="sinceSrc">([\s\S]*?)<\/p>/.exec(li)?.[1] ?? '';
    const got = src ? src.split(/ · /).map((x) => text(x).trim()) : [];
    if (JSON.stringify(got) !== JSON.stringify(exp.sources)) out.push(`item ${i + 1} sources: ${JSON.stringify(got)}`);
  });
  return out;
}

/** Every number token, normalised ("4,187" → "4187", "01" → "1", "1.0" stays "1"). */
const nums = (t: string) => [...t.matchAll(/\d+(?:[.,]\d+)*/g)].map((m) => String(Number(m[0].replace(/,/g, ''))));
function collectStrings(x: unknown, out: string[] = []): string[] {
  if (x === null || x === undefined) return out;
  if (typeof x === 'string' || typeof x === 'number') out.push(String(x));
  else if (Array.isArray(x)) x.forEach((y) => collectStrings(y, out));
  else if (typeof x === 'object') Object.values(x as Record<string, unknown>).forEach((y) => collectStrings(y, out));
  return out;
}
/** Fixed copy: the posture scale (0 = de-escalate, 100 = escalate), "2023 level", gauge ticks, "of 100", "+ / −" counts. */
const FIXED_NUMBERS = ['0', '100', '2023', '50', '90'];
function numberWhitelist(d: HomeServerData, scen: ScenarioRowView): Set<string> {
  const strings = collectStrings([d, scen]);
  const days = [d.conflictDay, d.brief?.day, d.overnight?.day, d.marketDay, d.posture.day, scen.day].filter((x): x is number => typeof x === 'number');
  for (const day of days) strings.push(formatConflictDayDateGb(day), formatConflictDayShort(day));
  // Counts the page derives from the data: positions shown / more on the board, item numbers.
  strings.push(String(d.posture.total), String(d.posture.total - d.posture.positions.length));
  (d.overnight?.items ?? []).forEach((_, i) => strings.push(String(i + 1)));
  return new Set([...FIXED_NUMBERS, ...strings.flatMap(nums)]);
}
function unknownNumbers(html: string, d: HomeServerData, scen: ScenarioRowView): string[] {
  const allowed = numberWhitelist(d, scen);
  const body = stripGaugeTicks(withoutDataAsOf(html));
  // Visible text and every aria-label / title / alt: what a reader or a screen reader is told.
  const told = [text(body), ...[...body.matchAll(/\s(?:aria-label|title|alt)="([^"]*)"/g)].map((m) => decode(m[1]))].join(' ');
  const bad = [...new Set(nums(told).filter((n) => !allowed.has(n)))];
  return bad.map((n) => `number ${n} is not in the input: "${told.match(new RegExp(`.{0,40}\\b${n.replace('.', '\\.')}\\b.{0,20}`))?.[0] ?? n}"`);
}

// ---- 1–12 ------------------------------------------------------------------------------------------------
const FULL_HTML = renderHome(FULL);
const EMPTY_HTML = renderHome(EMPTY, SCEN_EMPTY);

check('1. EG / AE / SA never ranked or numbered on home (hostile scored SA and AE rows; aside scanned with attributes)', () => {
  assert.deepEqual(gradeLeaks(FULL_HTML, FULL.posture), []);
  assert.deepEqual(gradeLeaks(EMPTY_HTML, EMPTY.posture), []);
  const p = homePosture(BOARD);
  assert.deepEqual(p.positions.map((r) => r.country_code), ['IR', 'GB', 'US'], 'scored list (score order) without SA / AE');
  assert.equal(p.total, 3);
  // Alphabetical by name (Egypt, Saudi Arabia, United Arab Emirates): never by any score.
  assert.deepEqual(p.stated.map((s) => [s.code, s.evidence?.quote ?? null]), [['EG', null], ['SA', 'TEST quote'], ['AE', 'TEST AE statement']]);
  assert.ok(text(FULL_HTML).includes('Egypt: no statement on record.'));
});

check('2 + 11. B a range in the list and the phone grid; phone grid is real text in the a11y tree; E has no digit', () => {
  assert.deepEqual(oddsDefects(FULL_HTML), []);
  assert.ok(text(el(FULL_HTML, 'li', 'data-testid="home-scenario-B"')!).includes('72–81%'));
  assert.ok(text(el(FULL_HTML, 'li', 'data-testid="home-scenario-E"')!).includes('Unmeasured'), 'E says unmeasured');
});

check('3. no emoji in the home body (full and empty renders, every corridor state)', () => {
  assert.deepEqual(emoji(FULL_HTML), []);
  assert.deepEqual(emoji(EMPTY_HTML), []);
  for (const [, v] of VIEWS) assert.deepEqual(emoji(renderHome({ ...FULL, corridorsView: v })), []);
});

check('4 + 10. honest empty states (a v1 board counts as unavailable); no artboard value or annotation anywhere', () => {
  assert.deepEqual(emptyStateDefects(EMPTY_HTML), []);
  const v1Board = { ...BOARD, schema: 'v1' as const };
  assert.equal(homePosture(v1Board).schema, null, 'a v1 board is not a v2 read');
  assert.deepEqual(emptyStateDefects(renderHome({ ...EMPTY, posture: homePosture(v1Board) }, SCEN_EMPTY)), []);
  // The corridor fixture IS Chokepoint Weekly #1 (the artboard's week), so the leak scan uses a view with no
  // corridor figures; every other section's fixture values differ from the artboard's.
  assert.deepEqual(artboardLeaks(renderHome({ ...FULL, corridorsView: FIX_WITHHELD })), []);
  const t = text(FULL_HTML);
  for (const live of ['TEST first sentence', 'TEST second sentence', '$101.01', 'Front us-iran']) assert.ok(t.includes(live), `live value missing: ${live}`);
});

check('5. H1: exact published figures, no rounding word before a number (current, stale, withheld)', () => {
  for (const [label, v] of VIEWS) assert.deepEqual(h1Defects(renderHome({ ...FULL, corridorsView: v }), v), [], label);
  const cur = corridorH1(FIX_CURRENT);
  const low = [...FIX_CURRENT.lanes].sort((a, b) => a.index! - b.index!);
  assert.equal(cur.lead, `${low[0].shortName} traffic is at ${fmtPct(low[0].index!)} of its 2023 level.`);
  assert.equal(cur.rest, `${low[1].shortName} is at ${fmtPct(low[1].index!)}.`);
  assert.match(corridorH1(FIX_STALE).lead, /^Last published week: .* was at \d+\.\d%/);
});

check('6. relief scene in the figure; labels, relief lanes and strip chips: one view; stale copy never "this week"', () => {
  for (const [label, v] of VIEWS) {
    const html = renderHome({ ...FULL, corridorsView: v });
    const fig = el(html, 'figure', '<figure') ?? '';
    assert.match(fig, /<div class="hero-scene" aria-hidden="true" data-hero-3d="off"><\/div>/, `${label}: relief not in the figure`);
    const strip = el(html, 'div', 'data-headless="true"') ?? '';
    const chips = [...strip.matchAll(/class="chip-status" data-status="([A-Z]+)"/g)].map((m) => m[1]);
    assert.deepEqual(chips, v.lanes.map((l) => l.status), `${label}: strip chips`);
    const labels = Object.fromEntries([...fig.matchAll(/data-relief-label="([a-z_]+)" data-status="([A-Z]+)"/g)].map((m) => [m[1], m[2]]));
    for (const l of v.lanes) {
      assert.equal(labels[l.id], l.status, `${label}: ${l.id} label vs strip`);
    }
    const hero = html.indexOf('id="home-corridor-strip-h"');
    assert.ok(hero > 0 && hero < html.indexOf('<figure'), 'H1 before the figure (text column first)');
    if (v.state !== 'current') {
      const copy = text((/<p class="eyebrow">[\s\S]*?<\/p>/.exec(html)?.[0] ?? '') + (/<figcaption[\s\S]*?<\/figcaption>/.exec(html)?.[0] ?? ''));
      assert.ok(!/this week/i.test(copy), `${label}: "this week" in the eyebrow / caption: ${copy}`);
    }
  }
});

check('8. overnight: brief order, first sentence verbatim (never inside a quote), full-item link, registry party labels', () => {
  assert.deepEqual(overnightDefects(FULL_HTML), []);
  assert.equal(OV_ANCHOR, sectionAnchors(SECTIONS as never)[1], 'home anchor = reader anchor');
  assert.equal(OV_ANCHOR, 's-changes');
  assert.deepEqual(firstSentence('He said "Stop. Now." and left the room quietly at night. Then more.'), {
    head: 'He said "Stop. Now." and left the room quietly at night.',
    cut: true,
  });
  assert.deepEqual(firstSentence('He said “Stop. Now we wait for the others to arrive” and nothing else'), {
    head: 'He said “Stop. Now we wait for the others to arrive” and nothing else',
    cut: false,
  });
  // Live shape (Day 232): the first sentence ends on a two-letter word inside closing quotes.
  assert.deepEqual(firstSentence('The US said it had halted exports "with the exception of assistance we have allowed in". He said the US had acted.'), {
    head: 'The US said it had halted exports "with the exception of assistance we have allowed in".',
    cut: true,
  });
  assert.equal(firstSentence('Talks with Mr. Smith and the U.S. Treasury continued through the night at length. More.').head, 'Talks with Mr. Smith and the U.S. Treasury continued through the night at length.');
  const items = overnightItems(SECTIONS);
  assert.equal(items[1].text, SECTIONS[1].subsections![0].paragraphs[1].text, 'raw item verbatim');
  assert.deepEqual(overnightItems(null), []);
});

check('9. stated quotes: verbatim text, STATE/PARTY badge exactly as on /nai (registry label or stored flag)', () => {
  const ae = el(el(FULL_HTML, 'aside', 'data-testid="home-stated"')!, 'blockquote', 'data-country="AE"')!;
  assert.ok(!ae.includes('STATE/PARTY'), 'AE source is not a party source');
  const party = renderHome({ ...FULL, posture: homePosture(board([v2({ country_code: 'SA', conflict_code: 'us-iran', withheld: true, stance: 'withheld', expressed_score: null, label: null, source_url: 'https://example.test/sa' })])) });
  const sa = el(el(party, 'aside', 'data-testid="home-stated"')!, 'blockquote', 'data-country="SA"')!;
  assert.match(sa, />TEST Saudi Press<\/a> <span class="chip-party">STATE\/PARTY<\/span>/, 'registry party label');
  const stored = renderHome({ ...FULL, posture: homePosture(board([v2({ country_code: 'EG', conflict_code: 'us-iran', withheld: true, stance: 'withheld', expressed_score: null, label: null, party_source: true, source_url: 'https://ahram.test/x' })])) });
  assert.match(el(stored, 'blockquote', 'data-country="EG"')!, /<span class="chip-party">STATE\/PARTY<\/span>/, 'stored party flag');
});

check('6b. Save-Data: HeroScene marks the skip after hydration and the figure hides its frame, caption and labels', () => {
  const scene = readFileSync(join(ROOT, 'components/home/HeroScene.tsx'), 'utf8');
  assert.match(scene, /=== 'none'\) \{\s*setSkipped\(true\);\s*return;\s*\}/, 'Save-Data branch does not mark the skip');
  assert.match(scene, /data-relief-skip=\{skipped \? 'save-data' : undefined\}/);
  assert.match(readFileSync(join(ROOT, 'components/home/home.module.css'), 'utf8'), /\.figure:has\(\[data-relief-skip\]\) \{\s*visibility: hidden;/);
  assert.match(renderToStaticMarkup(h(HeroScene, {})), /^<div class="hero-scene" aria-hidden="true" data-hero-3d="off"><\/div>$/, 'first render changed');
});

check('13. odds card takes any number of scenarios (7 with F, G unmeasured); freshness wrapper always mounted', () => {
  const extra = [
    // The reasons lib/scenario-registry unmeasuredReason writes for a born scenario (production F and G, Day 232).
    { code: 'F', name: 'TEST new F', kind: 'unmeasured' as const, text: 'Unmeasured', p: null, low: null, high: null, deltaText: null, reason: 'Born on Day 233, after the latest published day (Day 231); no reading yet.', independent: true, color: '' },
    { code: 'G', name: 'TEST new G', kind: 'unmeasured' as const, text: 'Unmeasured', p: null, low: null, high: null, deltaText: null, reason: 'No market is linked to this scenario: the Day 231 market-anchored-v1 run read no market for G, so it has no number. Shown as unmeasured, never estimated.', independent: true, color: '' },
  ];
  const seven = { ...SCEN, items: [...SCEN.items, ...extra] };
  const html = renderHome(FULL, seven);
  const grid = el(html, 'ul', 'data-testid="home-odds-grid"')!;
  assert.match(grid, /--odds-cols:4/, 'seven scenarios: two balanced rows of four and three');
  assert.equal((grid.match(/<li /g) ?? []).length, 7);
  assert.equal(all(el(html, 'ul', 'data-testid="home-odds-list"')!, 'li', 'data-testid="home-scenario-').length, 7);
  for (const [code, reason] of [['F', 'No reading yet'], ['G', 'No market linked']]) {
    const li = el(html, 'li', `data-testid="home-scenario-${code}"`)!;
    assert.ok(text(li).includes(`Unmeasured: ${reason}`), `${code} reason: ${text(li)}`);
    const cell = text(el(grid, 'li', `data-code="${code}"`)!).replace(/\s+/g, ' ').trim();
    assert.equal(cell, `${code} — unmeasured, ${reason.toLowerCase()}`, `${code} phone cell (screen-reader text)`);
    assert.ok(!/\d/.test(text(li).replace('Independent · not part of the 100', '')), `${code} carries a digit`);
  }
  assert.match(el(renderHome(FULL), 'ul', 'data-testid="home-odds-grid"')!, /--odds-cols:5/);
  assert.match(html, /<p class="oddsGridNote" aria-hidden="true">Unmeasured · E: no market meets the quality floor · F: no reading yet · G: no market linked<\/p>/, 'phone reason line');
  assert.ok(!/repeat\(5,/.test(readFileSync(join(ROOT, 'components/home/home.module.css'), 'utf8')), 'fixed five-column grid');
  const src = readFileSync(join(ROOT, 'components/home/ScenarioRow.tsx'), 'utf8');
  assert.match(src, /\{currentDay != null && <DataAsOf section="SCENARIOS" latestDay=\{row\.day\} currentDay=\{currentDay\} hideWhenCurrent \/>\}/, 'freshness note not always mounted');
});

check('12. whitelist: every number in the home body comes from the input data (full, empty, every corridor state)', () => {
  assert.deepEqual(unknownNumbers(FULL_HTML, FULL, SCEN), []);
  assert.deepEqual(unknownNumbers(EMPTY_HTML, EMPTY, SCEN_EMPTY), []);
  for (const [label, v] of VIEWS) assert.deepEqual(unknownNumbers(renderHome({ ...FULL, corridorsView: v }), { ...FULL, corridorsView: v }, SCEN), [], label);
});

/** Day 228 overnight, item 1 (published text), from its second sentence. */
const DAY228 =
  'The Saudi-led coalition said it destroyed a ballistic missile heading toward Khamis Mushayt, Arab News reported, citing coalition spokesman Maj. Gen. Turki Al-Maliki. Saudi authorities extended the closure of Riyadh\'s King Khalid International Airport until 17 October.';
check('14. abbreviations, initials and single quotes never end a sentence (real Day 228 text)', () => {
  assert.deepEqual(firstSentence(DAY228), {
    head: 'The Saudi-led coalition said it destroyed a ballistic missile heading toward Khamis Mushayt, Arab News reported, citing coalition spokesman Maj. Gen. Turki Al-Maliki.',
    cut: true,
  });
  assert.equal(splitLead(DAY228).head, firstSentence(DAY228).head);
  const cases: [string, string][] = [
    ['CENTCOM commander Rear Adm. Brad Cooper said the strait stayed open overnight. Tehran denied it.', 'CENTCOM commander Rear Adm. Brad Cooper said the strait stayed open overnight.'],
    ['The match-up framed as Iran vs. Israel dominated state television coverage on Tuesday. Then more.', 'The match-up framed as Iran vs. Israel dominated state television coverage on Tuesday.'],
    ['Brig. Gen. Yahya Saree said the strike hit its target, according to Saba overnight. More.', 'Brig. Gen. Yahya Saree said the strike hit its target, according to Saba overnight.'],
    ['The ministry dated the order 3 Oct. Officials said nothing further about it later. More.', 'The ministry dated the order 3 Oct. Officials said nothing further about it later.'],
    ['Lt. Col. A. Smith of the U.S. Navy confirmed the transit to reporters on Monday. More.', 'Lt. Col. A. Smith of the U.S. Navy confirmed the transit to reporters on Monday.'],
    ['The foreign minister told the assembly that it was ‘a red line for the region. Nobody crosses it’ and walked out. Then more.', 'The foreign minister told the assembly that it was ‘a red line for the region. Nobody crosses it’ and walked out.'],
    ['Iran’s envoy said the talks’ next round would follow within the week as planned. More.', 'Iran’s envoy said the talks’ next round would follow within the week as planned.'],
  ];
  for (const [t, head] of cases) assert.equal(firstSentence(t).head, head, t);
});

check('15. a corrected brief: the correction notice is a small "Corrected" note, never the top-finding headline', () => {
  const lead =
    'Corrected 13 Oct 2026, 11:28 UTC: an earlier version cited a source the desk is not licensed to use; the affected statements have been removed. Day 220 is defined by a measurement dispute, not a battlefield event. CENTCOM said more.';
  assert.deepEqual(correctionNotice(lead).notice, {
    when: '13 Oct 2026, 11:28 UTC',
    text: 'an earlier version cited a source the desk is not licensed to use; the affected statements have been removed.',
  });
  const html = renderHome({ ...FULL, brief: { day: 220, lead } });
  const h2 = text(/<h2 id="home-tf-h"[^>]*>([\s\S]*?)<\/h2>/.exec(html)![1]).trim();
  assert.equal(h2, 'Day 220 is defined by a measurement dispute, not a battlefield event.');
  const note = el(html, 'p', 'data-testid="home-tf-correction"')!;
  assert.match(note, /href="\/corrections"/);
  assert.ok(text(note).includes('Corrected') && text(note).includes('13 Oct 2026, 11:28 UTC') && text(note).includes('the affected statements have been removed.'));
  assert.equal(correctionNotice('Day 231 was quiet in the Gulf overnight.').notice, null);
  assert.deepEqual(unknownNumbers(html, { ...FULL, brief: { day: 220, lead } }, SCEN), []);
});

check('lead split keeps every word; "U.S." never ends a sentence', () => {
  const lead = 'Washington and the U.S. Treasury named three firms on 15 October in Aden. Tehran denied it.';
  const s = splitLead(lead);
  assert.equal(s.head, 'Washington and the U.S. Treasury named three firms on 15 October in Aden.');
  assert.equal(s.rest, 'Tehran denied it.');
  assert.equal(`${s.head} ${s.rest}`, lead);
  assert.deepEqual(splitLead('Short. Lead.'), { head: 'Short. Lead.', rest: null });
});

// ---- 7. every predicate catches a deliberately broken render ----------------------------------------------
check('7a. grade predicate: scored SA row in the list, rank inside a quote, rank in an aria-label', () => {
  const sa = BOARD.rows.find((r) => r.country_code === 'SA' && r.stance === 'position')!;
  const base = homePosture(BOARD);
  const broken: HomePostureView = { ...base, positions: [sa, ...base.positions], total: 4 };
  assert.ok(gradeLeaks(renderHome(FULL, SCEN, { postureOverride: broken }), broken).some((x) => x.startsWith('SA has a scored row')));
  const rank = FULL_HTML.replace('<p>“TEST quote”</p>', '<p>#2 “TEST quote”</p>');
  assert.ok(gradeLeaks(rank, FULL.posture).some((x) => x.startsWith('SA quote altered')), 'rank in quote not caught');
  const aria = FULL_HTML.replace('data-country="SA">', 'data-country="SA" aria-label="Rank 2">');
  assert.ok(gradeLeaks(aria, FULL.posture).some((x) => x.startsWith('digit in the stated aside')), 'aria rank not caught');
});

check('7b. odds predicate: B as a point (list, grid), E with a number, grid hidden', () => {
  const brokenRow = { ...SCEN, items: SCEN.items.map((i) => (i.code === 'B' ? { ...i, kind: 'point' as const, text: '72%' } : i)) };
  assert.ok(oddsDefects(renderHome(FULL, brokenRow)).length >= 2);
  const grid = el(FULL_HTML, 'ul', 'data-testid="home-odds-grid"')!;
  assert.ok(oddsDefects(FULL_HTML.replace(grid, grid.replace(/72–81%/, '81%'))).some((x) => x.startsWith('phone grid B')));
  assert.ok(oddsDefects(FULL_HTML.replace('<span aria-hidden="true">—</span>', '<span>12%</span>')).some((x) => x.startsWith('E carries')));
  assert.ok(oddsDefects(FULL_HTML.replace('data-testid="home-odds-grid"', 'data-testid="home-odds-grid" aria-hidden="true"')).some((x) => x.includes('hidden')));
});

check('7c. emoji predicate fails on an emoji in the body', () => {
  assert.equal(emoji(FULL_HTML.replace('Since yesterday', 'Since yesterday \u{1F6A8}')).length, 1);
  assert.equal(emoji(FULL_HTML.replace('BRENT', '\u{1F1EE}\u{1F1F7} BRENT')).length, 1, 'flag not caught');
});

check('7d. empty-state predicate fails when artboard sample numbers fill a missing source, or "nothing coded" shows', () => {
  const d = emptyStateDefects(EMPTY_HTML.replace('Market data is not available just now.', 'Hormuz 2.8% · B 58–78%'));
  assert.ok(d.includes('no empty state for markets') && d.some((x) => x.includes('2.8%')), JSON.stringify(d));
  const coded = EMPTY_HTML.replace('War Posture data is not available just now.', 'No government position has been coded under method v2 yet.');
  assert.ok(emptyStateDefects(coded).some((x) => x.includes('nothing coded')));
});

check('7e. H1 predicate fails on the artboard phrasing ("is under 40%") and on a rounded figure', () => {
  const good = renderHome(FULL);
  const h1 = /<h1\b[^>]*>[\s\S]*?<\/h1>/.exec(good)![0];
  const under = good.replace(h1, '<h1 id="home-corridor-strip-h">Hormuz traffic is at 4.3% of its 2023 level. Bab al-Mandeb is under 40%.</h1>');
  assert.ok(h1Defects(under, FIX_CURRENT).some((x) => x.startsWith('rounding word')), 'under not caught');
  const nearly = good.replace(h1, '<h1 id="home-corridor-strip-h">Hormuz traffic is nearly 4% of its 2023 level.</h1>');
  const d = h1Defects(nearly, FIX_CURRENT);
  assert.ok(d.some((x) => x.startsWith('rounding word')) && d.some((x) => x.includes('not a published lane index')), JSON.stringify(d));
});

check('7f. overnight predicate: paraphrase, rewording, reorder, dropped sources, missing party label', () => {
  const p1 = '<p class="sinceText">TEST alpha strike reported in Aden overnight by the ministry.</p>';
  assert.ok(overnightDefects(FULL_HTML.replace(p1, '<p class="sinceText">TEST alpha strike in Aden.</p>')).some((x) => x.startsWith('item 1 text')));
  const sec = el(FULL_HTML, 'section', 'data-testid="home-since"')!;
  const lis = all(sec, 'li', '<li');
  const swapped = FULL_HTML.replace(sec, sec.replace(lis[0], '@@0@@').replace(lis[1], lis[0]).replace('@@0@@', lis[1]));
  assert.ok(overnightDefects(swapped).some((x) => x.startsWith('item 1 text')), 'reorder not caught');
  assert.ok(overnightDefects(FULL_HTML.replace(' <span class="chip-party">State-aligned</span>', '')).some((x) => x.startsWith('item 2 sources')), 'missing registry label not caught');
  assert.ok(overnightDefects(FULL_HTML.replace(/<p class="sinceSrc">[\s\S]*?<\/p>/, '')).some((x) => x.startsWith('item 1 sources')), 'dropped sources not caught');
});

check('7g. whitelist predicate fails on an invented count or percentage', () => {
  const a = FULL_HTML.replace('Day 231 overnight brief', 'Day 231 overnight brief · 12 changes tracked');
  assert.ok(unknownNumbers(a, FULL, SCEN).some((x) => x.startsWith('number 12')), JSON.stringify(unknownNumbers(a, FULL, SCEN)));
  const b = FULL_HTML.replace('TEST second sentence, kept below.', 'TEST second sentence, kept below. Confidence: 87%.');
  assert.ok(unknownNumbers(b, FULL, SCEN).some((x) => x.startsWith('number 87')));
});

console.log(`\n${n} passed, ${failed} failed`);
if (failed) process.exit(1);
