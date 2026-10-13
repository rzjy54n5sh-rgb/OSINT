/**
 * Brief reader v2: key figures (R2), chart title (R3), table only (R4), provenance (R5), no-sources
 * layout (R6), contents marker (R8), subsections (R11), no read marks (R12), correction notice.
 *
 *   npx --yes tsx@4.23.13 tests/unit/brief-figures.check.ts
 *
 * Fixtures are copies of production rows (Day 228 general sources, its cited market_data collection and
 * the committed data/chokepoints/latest.json), read 2026-10-13.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { collectBriefSources } from '../../lib/briefing-sources';
import {
  chartLanes,
  chartTitle,
  citedChokepointEdition,
  citedMarketCollection,
  indicatorNamed,
  marketFigures,
  parseCoverStats,
  type MarketRow,
} from '../../lib/brief-figures';
import { getCorridors } from '../../lib/corridors';

(globalThis as unknown as { React: typeof React }).React = React;
require.extensions['.css'] = (m: NodeJS.Module) => {
  m.exports = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? undefined : String(k)) });
};
const { BriefReader } = require('../../components/briefing/BriefReader') as typeof import('../../components/briefing/BriefReader');

const NOW = new Date('2026-10-13T12:00:00Z');
const view = getCorridors(NOW);
const CW = {
  name: 'MENA Intel Desk Chokepoint Weekly #1 (IMF PortWatch, UN Global Platform, AIS-based)',
  url: 'https://raw.githubusercontent.com/rzjy54n5sh-rgb/OSINT/main/data/chokepoints/latest.json',
  published_at: view.asOf,
  tier: 1,
  party_source: false,
};
const MD = {
  name: 'MENA Intel Desk market_data (collector feed: Yahoo Finance)',
  url: 'https://mena-intel-desk.mores-cohorts9x.workers.dev/',
  published_at: '2026-10-13T00:53:01Z',
  tier: 1,
  party_source: false,
};
const ARAB = { name: 'Arab News', url: 'https://www.arabnews.com/node/2614001', published_at: '2026-10-12T01:28:18Z', tier: 2, party_source: false };
const MD_TEXT =
  'Brent Crude Oil stood at 105.77 US dollars a barrel, down 0.83 percent, and Gold at 4,185.9 US dollars an ounce, down 0.11 percent, in the desk’s conflict day 228 rows collected 2026-10-13 at 00:53 UTC. VIX stood at 15.21, up 2.49 percent, in the same collection.';
const ROWS: MarketRow[] = [
  { indicator: 'Brent Crude Oil', value: 105.77, change_pct: -0.83, unit: 'USD/bbl', source: 'Yahoo Finance', conflict_day: 228, created_at: '2026-10-13T00:53:01.98084+00:00' },
  { indicator: 'Gold', value: '4185.9', change_pct: '-0.11', unit: 'USD/oz', source: 'Yahoo Finance', conflict_day: 228, created_at: '2026-10-13T00:53:01.98084+00:00' },
  { indicator: 'VIX (Fear Index)', value: 15.21, change_pct: 2.49, unit: 'index', source: 'Yahoo Finance', conflict_day: 228, created_at: '2026-10-13T00:53:01.98084+00:00' },
  { indicator: 'WTI Crude Oil', value: 93, change_pct: -0.79, unit: 'USD/bbl', source: 'Yahoo Finance', conflict_day: 228, created_at: '2026-10-13T00:53:01.98084+00:00' },
  // Newer collection of the same indicator: not the one the brief cites.
  { indicator: 'Brent Crude Oil', value: 105.79, change_pct: -0.81, unit: 'USD/bbl', source: 'Yahoo Finance', conflict_day: 228, created_at: '2026-10-13T15:10:00+00:00' },
];

const sections = [
  {
    id: 'headline',
    heading: 'Headline',
    subsections: [
      { id: 'a', heading: 'What moved', paragraphs: [{ text: 'Arab News reported.', perspective: 'us_israel', sources: [ARAB] }] },
      { id: 'b', heading: 'Second subsection', paragraphs: [{ text: 'More.', perspective: 'neutral', sources: [] }] },
    ],
  },
  {
    id: 'shipping_energy',
    heading: 'Shipping and energy',
    subsections: [{ id: 'c', heading: 'Chokepoints and prices', paragraphs: [{ text: 'The Strait of Hormuz, Bab al-Mandeb and the Suez Canal, per the weekly.', sources: [CW] }, { text: MD_TEXT, sources: [MD] }] }],
  },
];
const list = collectBriefSources(sections).list;

// ---- cover_stats (R2: stored array shape only; never extended, never invented) --------------
assert.deepEqual(parseCoverStats({}), []);
assert.deepEqual(parseCoverStats(null), []);
assert.deepEqual(parseCoverStats({ brent_oil: 103.14, conflict_day: 15 }), [], 'object shape has no labels: not printed');
const cs = parseCoverStats([{ sub: '+56.7% y/y, SCA', label: 'Suez revenue, Aug 2026', value: '$567.1m' }, { label: 'no value' }, null]);
assert.equal(cs.length, 1);
assert.deepEqual([cs[0].value, cs[0].label, cs[0].sub, cs[0].src], ['$567.1m', 'Suez revenue, Aug 2026', '+56.7% y/y, SCA', null]);

// ---- chokepoint gate + R3 title ------------------------------------------------------------
assert.equal(view.state, 'current', 'fixture: committed latest.json is current on 13 Oct');
assert.equal(citedChokepointEdition(list, view)?.n, 2);
const older = collectBriefSources([{ subsections: [{ paragraphs: [{ sources: [{ ...CW, published_at: '2026-10-01T09:00:00Z' }] }] }] }]).list;
assert.equal(citedChokepointEdition(older, view), null, 'a brief citing another edition gets no chart');
const title = chartTitle(chartLanes(view, 'Hormuz, Bab al-Mandeb and Suez'));
assert.equal(title, 'Hormuz at 2.8% of an average 2023 week');
assert.ok(!/under|about|nearly|almost|roughly|~/i.test(title ?? ''), 'R3: no rounding words');

// ---- market_data: the cited collection, the indicators the prose names ----------------------
assert.ok(indicatorNamed('VIX (Fear Index)', MD_TEXT));
assert.ok(!indicatorNamed('WTI Crude Oil', MD_TEXT));
assert.ok(!indicatorNamed('Oil ETF (USO)', MD_TEXT));
const mc = citedMarketCollection(sections, list);
assert.ok(mc);
assert.equal(mc!.from, '2026-10-13T00:53:01.000Z');
const mf = marketFigures(ROWS, mc!);
assert.deepEqual(mf.map((f) => f.value), ['105.77', '4,185.9', '15.21']);
assert.equal(mf[0].label, 'Brent Crude Oil (USD/bbl), ▼ 0.83%');
assert.equal(mf[2].label, 'VIX (Fear Index), ▲ 2.49%', 'unit already in the name is not repeated');
assert.ok(mf[0].sub?.includes('Day 228') && mf[0].sub?.includes('collected 13 Oct 2026, 00:53 UTC'), 'row conflict_day + created_at');
assert.equal(citedMarketCollection(sections, collectBriefSources([{ subsections: [{ paragraphs: [{ sources: [{ ...MD, published_at: '2026-10-06' }] }] }] }]).list), null);

// ---- reader render ---------------------------------------------------------------------------
const brief = { id: 'b228', conflict_day: 228, report_type: 'general', title: 'General Intelligence Brief — Day 228', lead: 'Lead.', cover_stats: {}, sections, provenance: 'contemporaneous' };
const reg = new Map([['host:arabnews.com', { name: 'Arab News', party_status: 'state_aligned' as const }]]);
const corr = {
  id: '29f71b6a-c37f-4c2f-948b-f6bcd4c4b122', created_at: '2026-10-13T11:39:45Z', target_table: 'daily_briefings', target_id: 'b228',
  conflict_day: 228, report_type: 'general', correction_class: 'material' as const, summary: 'Removed statements.', before_excerpt: null, after_excerpt: null,
};
const html = renderToStaticMarkup(
  React.createElement(BriefReader, { briefing: brief, day: 228, type: 'general', corrections: [corr], registry: reg, corridors: view, marketRows: ROWS }),
);
assert.ok(html.includes('Tuesday 13 October 2026'));
// R1 via the registry, on the Arab News chip itself (the Sources note always contains the word).
const chipFor = (h: string, name: string) => new RegExp(`<span[^>]*>${name}</span>(?:(?!</a>)[\\s\\S])*?<span class="chip-party">([^<]+)</span>`).exec(h)?.[1] ?? null;
assert.equal(chipFor(html, 'Arab News'), 'State-aligned', 'R1: Arab News chip upgraded by the registry');
assert.ok(html.includes('Hormuz at 2.8% of an average 2023 week'), 'chart rendered for the cited edition');
assert.ok(html.includes('<summary>Table</summary>') && !/csv/i.test(html), 'R4: table view, no CSV');
assert.ok(html.includes('Key figures in this brief') && html.includes('105.77') && html.includes('2.8%'));
assert.ok(!html.includes('105.79'), 'newer market row is not the cited one');
assert.ok(html.includes('CORRECTED · MATERIAL') && html.includes('/corrections#29f71b6a-c37f-4c2f-948b-f6bcd4c4b122'));
assert.ok(/<h3[^>]*>Second subsection<\/h3>/.test(html), 'R11: later subsections are H3s');
assert.ok(html.includes('PERSPECTIVE · US / ISRAEL VIEW') && !html.includes('NEUTRAL / INDEPENDENT'));
assert.ok(html.includes('Sources (3)') && html.includes('href="#sources"'));
assert.ok(!html.includes('Reconstructed'), 'contemporaneous: no provenance chip');

// No linked sources, empty cover_stats, reconstructed (Day 12 general shape).
const bare = renderToStaticMarkup(
  React.createElement(BriefReader, {
    briefing: { ...brief, id: 'b12', conflict_day: 12, provenance: 'reconstructed', sections: [{ id: 'x', heading: 'Overview', subsections: [{ id: 'y', heading: 'Day 12', paragraphs: [{ text: 'Old text.' }] }] }] },
    day: 12, type: 'general', corridors: view, marketRows: ROWS,
  }),
);
assert.ok(!bare.includes('id="sources"') && !bare.includes('Sources ('), 'R6: no empty Sources heading or entry');
assert.ok(!bare.includes('Key figures'), 'R2: nothing derivable, no aside');
assert.ok(!bare.includes('of an average 2023 week'), 'no chart without the citation');
assert.ok(bare.includes('Reconstructed') && bare.includes('first written after 06:00 UTC on the day after Day 12.'), 'R5');
assert.ok(!bare.includes('from sources dated as shown'), 'R5: no claim about sources the brief does not have');


// ---- market time window: rows outside the cited second are never printed (out-of-window rows first) --
const edge = marketFigures(
  [
    { ...ROWS[0], value: 1.11, created_at: '2026-10-13T00:53:00.999Z' },
    { ...ROWS[1], value: 2.22, created_at: '2026-10-13T00:53:02.000Z' },
    ...ROWS,
  ],
  mc!,
);
assert.deepEqual(edge.map((f) => f.value), ['105.77', '4,185.9', '15.21'], 'window is [cited second, +1 s)');

// ---- archived edition: once the file is stale the chart still prints the status that edition published --
const stale = getCorridors(new Date('2026-10-17T00:00:00Z'));
assert.equal(stale.state, 'stale', 'fixture: stale from 17 Oct');
const staleHtml = renderToStaticMarkup(React.createElement(BriefReader, { briefing: brief, day: 228, type: 'general', corridors: stale }));
assert.ok(staleHtml.includes('Hormuz at 2.8% of an average 2023 week'), 'chart kept for the cited edition');
assert.ok(/data-status="DISRUPTED"/.test(staleHtml) && /data-status="ELEVATED"/.test(staleHtml), 'published statuses');
assert.ok(!/data-status="UNKNOWN"/.test(staleHtml), 'never UNKNOWN for the edition the brief cites');

// ---- corridor lanes the brief names (chart and key figures) ----------------------------------------------
const withCw = (text: string) => ({ ...brief, sections: [{ id: 'se', heading: 'Shipping', subsections: [{ id: 'x', heading: 'Lanes', paragraphs: [{ text, sources: [CW] }] }] }] });
const render = (text: string) => renderToStaticMarkup(React.createElement(BriefReader, { briefing: withCw(text), day: 228, type: 'general', corridors: view }));
const two = render('Bab al-Mandeb and the Suez Canal stayed below their 2023 weeks.');
assert.ok(two.includes('Bab al-Mandeb at 39.6% of an average 2023 week'), 'title uses the lowest NAMED lane');
assert.ok(!two.includes('Strait of Hormuz') && !two.includes('Hormuz at'), 'unnamed lane: no bar, no figure');
assert.ok(two.includes('Suez Canal transits vs an average 2023 week'));
const one = render('Bab al-Mandeb stayed below its 2023 week.');
assert.ok(!one.includes('<figure'), 'one named lane: figure only, no bar chart');
assert.ok(one.includes('Bab al-Mandeb transits vs an average 2023 week') && !one.includes('Suez Canal transits'));
const none = render('The weekly corridor file was cited for the week.');
assert.ok(!none.includes('<figure') && !none.includes('Key figures'), 'no named lane: nothing');


// Lane aliases (fixed list, lib/brief-figures.ts): spellings, dashes, case, Arabic; whole words only.
const el = render('Bab el-Mandeb stayed below its 2023 week; Suezmax rates rose.');
assert.ok(el.includes('Bab al-Mandeb transits vs an average 2023 week'), '"Bab el-Mandeb" names Bab al-Mandeb');
assert.ok(!el.includes('Suez Canal transits'), '"Suezmax" does not name Suez');
const dash = render('BAB‑EL‑MANDEB and the STRAIT OF HORMUZ, per the weekly.');
assert.ok(dash.includes('Hormuz at 2.8% of an average 2023 week') && dash.includes('Bab al-Mandeb transits'), 'case + non-breaking hyphens');
const ar = render('باب المندب و قناة السويس');
assert.ok(ar.includes('Bab al-Mandeb at 39.6%') && ar.includes('Suez Canal transits') && !ar.includes('Strait of Hormuz transits'), 'Arabic names');


// Spaces and hyphens are the same: "Bab-al-Mandeb", "Bab al Mandeb", "Bab el Mandeb" all name the lane.
for (const spelling of ['Bab-al-Mandeb', 'Bab al Mandeb', 'Bab el Mandeb']) {
  assert.ok(render(`${spelling} stayed below its 2023 week.`).includes('Bab al-Mandeb transits vs an average 2023 week'), `"${spelling}"`);
}

// Corrections read failed: the brief still renders, with a neutral line where a notice would go.
let unavailable = '';
assert.doesNotThrow(() => {
  unavailable = renderToStaticMarkup(React.createElement(BriefReader, { briefing: brief, day: 228, type: 'general', corrections: null, corridors: view }));
});
assert.ok(unavailable.includes('Correction status could not be checked just now; see the') && unavailable.includes('href="/corrections"'), 'neutral line + link');
assert.ok(unavailable.includes('General Intelligence Brief — Day 228') && !unavailable.includes('CORRECTED ·'), 'brief rendered, no notice');
assert.ok(!html.includes('Correction status could not be checked'), 'no line when the read succeeded');

// ---- static rules: R8 (no border accent), R12 (no localStorage), no probabilities in chrome ---
const dir = path.join(__dirname, '../../components/briefing');
const css = fs.readFileSync(path.join(dir, 'brief.module.css'), 'utf8');
assert.ok(!/border-(left|inline-start)\s*:|inset\s+2px\s+0/.test(css), 'R8: no left-border accent');
assert.ok(/\.tocLink\[aria-current\][^}]*font-weight:\s*600[^}]*text-decoration:\s*underline/.test(css), 'R8: weight + underline');
for (const f of fs.readdirSync(dir)) {
  const src = fs.readFileSync(path.join(dir, f), 'utf8');
  assert.ok(!/localStorage/.test(src), `R12: ${f} uses no localStorage`);
  assert.ok(!/PostureSwatch|posture-\d/.test(src), `${f}: no posture colour in the reader`);
}

console.log('brief-figures checks passed');
