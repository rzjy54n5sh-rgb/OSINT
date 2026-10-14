/**
 * War Posture board v2 (/nai): what the components actually render (react-dom/server, no browser).
 * The lib rules are in posture-board.check.ts; this file asserts the markup keeps them:
 *   1. EG / AE / SA: no digits, band or fill (tiles, stated panel); never a card; quote glyph only with a statement.
 *   2. No uncoded quote anywhere (list, Yemen panel, tiles), even for an uncoded row carrying a score.
 *   3. Yemen renders two separate lines, never one figure.
 *   4. Colour comes from the score band (card, swatch, tile), not from the label.
 *   5. Stepper: absent with one v2 day; on the earliest of two, Previous disabled and Next enabled.
 *   6. v1 rows never render under a conflict tab; they render in the v1 group.
 *   7. An archive link only with an archive_url.
 *   8. Gap and latent band stay hidden while locked.
 *   9. The tile map is aria-hidden; the list carries the facts.
 *
 *   npx --yes tsx tests/unit/posture-render.check.ts
 */
import '../helpers/render-env';
import assert from 'node:assert/strict';
import { createElement as h } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { fromV2Row, withheldPolicyRow, type PostureBoard as Board, type PostureView } from '../../lib/posture';
import { conflictView } from '../../lib/posture-board';
import { PostureBoard } from '../../components/posture/PostureBoard';
import { PositionCard, PostureDetails } from '../../components/posture/PostureRows';
import { PostureTiles } from '../../components/posture/PostureTiles';

let failed = 0;
let n = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    n++;
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split('\n').slice(0, 3).join('\n     ') : String(err)}`);
  }
}

const ANON = { latent: false, gap: false };
const base = {
  actor: 'government', actor_display_name: null, score_day: 228, as_of: '2026-10-13', stance: 'position', label: 'continued_pressure',
  expressed_score: 75, defensive: false, confidence_base: 'medium', confidence_now: 'medium', evidence_kind: 'statement',
  position_quote: 'TEST quote', speaker: 'TEST speaker', speaker_office: 'TEST office', source_url: 'https://example.test/a',
  archive_url: null, party_source: false, stated_at: '2026-10-12T00:00:00+00:00', captured_at: '2026-10-13T00:00:00+00:00',
  evidence_age_days: 1, freshness: 'current', change_reason: 'new_evidence', previous_day: null, withheld: false,
};
const v2 = (o: Record<string, unknown>) => fromV2Row({ ...base, ...o }, ANON);
const v1 = (code: string, score: number | null, o: Partial<PostureView> = {}): PostureView => ({
  ...withheldPolicyRow(code), conflict_code: null, method: 'war-posture-v1', withheld: false, stance: score === null ? 'uncoded' : 'position',
  expressed_score: score, score_day: 227, confidence_base: 'medium', expressed_basis: `TEST v1 basis ${code}. More.`, ...o,
});
const CONFLICTS = ['us-iran', 'red-sea-houthi', 'horn-tigray', 'sudan'].map((c, i) => ({
  conflict_code: c, name: c, short_name: `Tab ${c}`, description: `TEST ${c}`, theatre: '-', started_on: null, status: 'active', sort_order: i,
}));
const board = (rows: PostureView[], o: Partial<Board> = {}): Board => ({
  schema: 'v2', day: 229, firstDay: 221, latestDay: 229, conflicts: CONFLICTS, rows, hasLatentAccess: false, hasGapAccess: false, v2Days: [228], ...o,
});
// Production-shaped board (14 Oct 2026), test text for quotes, plus hostile rows the UI must refuse.
const prod = board([
  v2({ country_code: 'IR', conflict_code: 'us-iran', defensive: true }),
  v2({ country_code: 'GB', conflict_code: 'us-iran', confidence_now: 'high', party_source: true }),
  v2({ country_code: 'US', conflict_code: 'red-sea-houthi', label: 'ambivalent', expressed_score: 50 }),
  v2({ country_code: 'AE', conflict_code: 'us-iran', withheld: true, stance: 'withheld', expressed_score: null, label: null, position_quote: 'TEST AE statement', stated_at: '2026-10-12T00:00:00+00:00' }),
  v2({ country_code: 'SA', conflict_code: 'red-sea-houthi', withheld: true, stance: 'withheld', expressed_score: null, label: null, position_quote: 'TEST SA statement' }),
  { ...v2({ country_code: 'SA', conflict_code: 'us-iran', expressed_score: 90, label: 'escalation' }), withheld: false, stance: 'position', expressed_score: 90, label: 'escalation' },
  withheldPolicyRow('EG'),
  { ...v2({ country_code: 'ET', conflict_code: 'horn-tigray', stance: 'uncoded', position_quote: 'TEST uncoded quote' }), stance: 'uncoded', expressed_score: 90, label: 'escalation' },
  { ...v2({ country_code: 'YE', conflict_code: 'red-sea-houthi', actor: 'de_facto_authority', actor_display_name: 'TEST dfa', stance: 'uncoded', position_quote: 'TEST uncoded YE quote' }), stance: 'uncoded' },
  v1('ET', 90, { v2UncodedConflicts: ['horn-tigray'] }),
  v1('ER', 25),
  v1('PK', 50),
  v1('YE', 90),
  v1('CN', null),
]);
const TABS = CONFLICTS.map((c) => c.conflict_code);
const render = (b: Board, tab?: string, extra: Record<string, unknown> = {}) =>
  renderToStaticMarkup(h(PostureBoard, { board: b, labels: {}, onDay: () => {}, latestDay: 229, initialTab: tab, ...extra }));
const card = (row: PostureView) => renderToStaticMarkup(h('ul', null, h(PositionCard, { row, labels: {} })));
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
/** Element (tag) whose opening tag contains `attr`, up to its matching close (no same-tag nesting). */
function el(html: string, tag: string, attr: string): string | null {
  const at = html.indexOf(attr);
  if (at < 0) return null;
  const open = html.lastIndexOf(`<${tag}`, at);
  const close = html.indexOf(`</${tag}>`, at);
  return open < 0 || close < 0 ? null : html.slice(open, close + tag.length + 3);
}

check('1. EG / AE / SA: no digits, band or fill in tiles or the stated panel; never a card; glyph only with a statement', () => {
  for (const tab of TABS) {
    const html = render(prod, tab);
    for (const code of ['EG', 'AE', 'SA']) {
      const tile = el(html, 'div', `data-tile="${code}|government"`);
      assert.ok(tile, `${code} tile on ${tab}`);
      assert.ok(tile.includes('data-kind="stated"') && !tile.includes('data-band'), `${code} tile band/fill on ${tab}: ${tile}`);
      assert.ok(!/\d/.test(text(tile)), `${code} tile digits on ${tab}`);
      const block = el(html, 'li', `data-country="${code}" data-no-grade="true"`);
      assert.ok(block, `${code} stated block on ${tab}`);
      const words = text(block.replace(/<blockquote[\s\S]*?<\/blockquote>/g, ''));
      assert.ok(!/\d/.test(words), `${code} stated block digits on ${tab}: ${words}`);
      assert.ok(!/data-band="[1-4]"/.test(block) && !block.includes('chip-num'), `${code} stated block band on ${tab}`);
      assert.ok(!html.includes(`data-testid="posture-card" data-country="${code}"`), `${code} card on ${tab}`);
    }
  }
  const ui = render(prod, 'us-iran');
  assert.ok(text(el(ui, 'div', 'data-tile="AE|government"')!).includes('“'), 'AE glyph (statement on record)');
  assert.ok(!text(el(ui, 'div', 'data-tile="EG|government"')!).includes('“'), 'EG glyph without a statement');
  const horn = render(prod, 'horn-tigray');
  for (const code of ['EG', 'AE', 'SA']) assert.ok(!text(el(horn, 'div', `data-tile="${code}|government"`)!).includes('\u201C'), `${code} glyph on horn without a statement`);
  assert.equal(card(prod.rows[5]), '<ul></ul>', 'a scored SA row renders a card');
});

check('2. no uncoded quote anywhere, even for an uncoded row carrying a score', () => {
  for (const tab of [...TABS, 'v1-frozen']) {
    const html = render(prod, tab);
    for (const leak of ['TEST uncoded quote', 'TEST uncoded YE quote']) assert.ok(!html.includes(leak), `${leak} on ${tab}`);
  }
  const horn = render(prod, 'horn-tigray');
  assert.ok(!horn.includes('data-testid="posture-card"'), 'uncoded ET rendered as a card');
  assert.ok(horn.includes('Awaiting coding on this front: Ethiopia'));
  const red = render(prod, 'red-sea-houthi');
  assert.ok(el(red, 'section', 'data-testid="posture-yemen"')!.includes('Statement captured, not yet coded'));
});

check('3. Yemen: two separate lines, never one figure', () => {
  const b = board([
    v2({ country_code: 'YE', conflict_code: 'red-sea-houthi', actor: 'government', actor_display_name: 'TEST gov line', expressed_score: 60, label: 'ambivalent' }),
    v2({ country_code: 'YE', conflict_code: 'red-sea-houthi', actor: 'de_facto_authority', actor_display_name: 'TEST dfa line', expressed_score: 95, label: 'escalation' }),
  ]);
  const panel = el(render(b, 'red-sea-houthi'), 'section', 'data-testid="posture-yemen"')!;
  assert.ok(panel.includes('data-country="YE" data-actor="government" data-band="2"') && panel.includes('data-country="YE" data-actor="de_facto_authority" data-band="4"'), panel.slice(0, 300));
  assert.ok(panel.includes('TEST gov line') && panel.includes('TEST dfa line'));
  assert.equal((panel.match(/data-testid="posture-card"/g) ?? []).length, 2);
  assert.ok(!/\b(77|78|77\.5)\b/.test(text(panel)), 'averaged figure');
  const v1panel = el(render(prod, 'v1-frozen'), 'section', 'data-testid="posture-yemen"')!;
  assert.ok(v1panel.includes('data-testid="posture-v1-row" data-country="YE" data-actor="government"'));
  assert.ok(v1panel.includes('data-testid="posture-yemen-line" data-actor="de_facto_authority"'));
});

check('4. colour comes from the score band (card, swatch, tile), not from the label', () => {
  const r85 = v2({ country_code: 'IR', conflict_code: 'us-iran', expressed_score: 85, label: 'continued_pressure' });
  const c85 = card(r85);
  assert.ok(c85.includes('data-band="4"') && !c85.includes('data-band="3"'), c85.slice(0, 400));
  const c35 = card(v2({ country_code: 'IR', conflict_code: 'us-iran', expressed_score: 35, label: 'conditional_deescalation' }));
  assert.ok(c35.includes('data-band="2"') && !c35.includes('data-band="1"'));
  const tiles = renderToStaticMarkup(h(PostureTiles, { tiles: conflictView(board([r85]), 'us-iran').tiles }));
  assert.ok(el(tiles, 'div', 'data-tile="IR|government"')!.includes('data-band="4"'));
});

check('5. stepper: absent with one v2 day; on the earliest of two, Previous disabled and Next enabled', () => {
  const one = render(prod, 'us-iran');
  assert.ok(!one.includes('aria-label="Previous day"') && !one.includes('aria-label="Next day"') && one.includes('Previous days use the old method (v1)'));
  const d228 = render(board(prod.rows, { day: 228, v2Days: [228, 229] }), 'us-iran');
  const prev = el(d228, 'button', 'aria-label="Previous day"')!;
  const next = el(d228, 'button', 'aria-label="Next day"')!;
  assert.ok(prev.includes('disabled=""'), prev);
  assert.ok(!next.includes('disabled'), next);
  assert.ok(d228.includes('Back to Day 229'));
  // "Earlier day" is measured against the page's own latest day (latestDay prop), never board.latestDay.
  const lateApi = render(board(prod.rows, { day: 229, latestDay: 230, v2Days: [228, 229] }), 'us-iran');
  assert.ok(!lateApi.includes('data-testid="posture-historical"'), 'latest board labelled as an earlier day');
  const early = render(board(prod.rows, { day: 228, latestDay: 228, v2Days: [228, 229] }), 'us-iran');
  assert.ok(early.includes('data-testid="posture-historical"') && early.includes('Back to Day 229'), 'earlier day not labelled');
});

check('6. v1 rows never render under a conflict tab; they render in the v1 group', () => {
  for (const tab of TABS) {
    const html = render(prod, tab);
    assert.ok(!html.includes('posture-v1-row') && !html.includes('TEST v1 basis'), `v1 on ${tab}`);
  }
  const v1html = render(prod, 'v1-frozen');
  assert.equal((v1html.match(/data-testid="posture-v1-row"/g) ?? []).length, 4); // ER, ET, PK + Yemen government line
  assert.ok(!v1html.includes('data-country="CN"'), 'number-less v1 row listed');
});

check('7. an archive link only with an archive_url', () => {
  assert.ok(!card(v2({ country_code: 'IR', conflict_code: 'us-iran' })).includes('Archived copy'));
  const withArchive = card(v2({ country_code: 'IR', conflict_code: 'us-iran', archive_url: 'https://archive.test/x' }));
  assert.ok(withArchive.includes('href="https://archive.test/x"') && withArchive.includes('Archived copy'));
});

check('8. gap and latent band stay hidden while locked', () => {
  const row: PostureView = { ...v2({ country_code: 'IR', conflict_code: 'us-iran' }), gap: 12.3, gapLocked: true, latent_low: 41, latent_high: 47, latentLocked: true };
  const locked = renderToStaticMarkup(h(PostureDetails, { row }));
  assert.ok(!locked.includes('12.3') && !locked.includes('41') && !locked.includes('47'), locked);
  assert.ok(locked.includes('Locked during launch'));
  const open = renderToStaticMarkup(h(PostureDetails, { row: { ...row, gapLocked: false, latentLocked: false } }));
  assert.ok(open.includes('+12.3') && open.includes('41–47'));
});

check('9. the tile map is aria-hidden; every tile fact is in the list', () => {
  const html = render(prod, 'us-iran');
  assert.ok(el(html, 'div', 'data-testid="posture-tiles"')!.startsWith('<div class="stageWrap" aria-hidden="true"'));
  for (const code of ['IR', 'GB']) assert.ok(html.includes(`data-testid="posture-card" data-country="${code}"`), code);
});

console.log(failed ? `\n${failed} of ${n + failed} checks FAILED` : `\nall ${n} checks passed`);
if (failed) process.exit(1);
