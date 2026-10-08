// node --test test/   (no network, no browser)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runGates } from '../lib/gates.mjs';
import { frechetB, oddsView, selectChanges, firstSentence, conflictDay, trafficBand } from '../lib/model.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const load = (p) => JSON.parse(readFileSync(p, 'utf8'));
const clone = (x) => structuredClone(x);
const FIX = load(join(HERE, 'fixtures', 'day223.json'));
const CP = load(join(HERE, '..', '..', '..', 'data', 'chokepoints', 'latest.json'));
const NOW = new Date('2026-10-08T04:30:00Z'); // Day 223

function gates(over = {}, opts = {}) {
  const d = { chokepoints: clone(CP), registry: clone(FIX.registry), daily: clone(FIX.daily), brief: clone(FIX.brief), ...over };
  d.changes = over.changes ?? selectChanges(d.brief);
  return runGates(d, { now: NOW, ...opts });
}
const idOf = (code) => FIX.registry.find((s) => s.code === code).id;

test('DAY LOCK matches CLAUDE.md (2026-10-05 = Day 220, 2026-10-08 = Day 223)', () => {
  assert.equal(conflictDay(new Date('2026-10-05T00:00:00Z')), 220);
  assert.equal(conflictDay(NOW), 223);
});

test('Frechet range reproduces the Day 222 worked example (seat 09): B 48.5-74.5', () => {
  assert.deepEqual(frechetB(20.5, 5.5, 25.5), { lo: 48.5, hi: 74.5 });
});

test('Day 223 live snapshot passes every gate and yields ranges + 3 sourced changes', () => {
  const g = gates();
  assert.deepEqual(g.errors, []);
  assert.equal(g.ok, true);
  const o = oddsView(FIX.registry, FIX.daily);
  const b = o.rows.find((r) => r.code === 'B');
  assert.deepEqual([b.lo, b.hi], [41.5, 68.5]);
  assert.equal(o.rows.find((r) => r.code === 'A').lo, 21.5);
  const ch = selectChanges(FIX.brief);
  assert.equal(ch.length, 3);
  assert.deepEqual(ch.map((c) => c.outlet), ['Al Jazeera', 'Middle East Eye', 'Axios']);
  for (const c of ch) assert.match(c.url, /^https:\/\//);
});

test('stale blocks refuse to render; --allow-stale renders them greyed instead', () => {
  const later = new Date('2026-10-20T04:30:00Z');
  const g = gates({}, { now: later });
  assert.equal(g.ok, false);
  assert.ok(g.errors.some((e) => e.startsWith('STALE chokepoints')));
  assert.ok(g.errors.some((e) => e.startsWith('STALE scenarios')));
  assert.ok(g.errors.some((e) => e.startsWith('STALE brief')));
  const g2 = gates({}, { now: later, allowStale: true });
  assert.equal(g2.ok, true);
  assert.deepEqual(g2.stale, { chokepoints: true, scenarios: true, brief: true });
});

test('allowed ages: brief 1 day, scenarios 2 days, chokepoints 8 days', () => {
  const at = (iso) => gates({}, { now: new Date(iso) });
  assert.equal(at('2026-10-09T04:30:00Z').ok, true); // brief 1 day old: allowed
  const g10 = at('2026-10-10T04:30:00Z'); // brief 2 days, scenarios 2 days
  assert.ok(g10.errors.some((e) => e.startsWith('STALE brief')));
  assert.ok(!g10.errors.some((e) => e.startsWith('STALE scenarios')));
  const g16 = at('2026-10-16T04:30:00Z'); // chokepoints 8 days: allowed
  assert.ok(!g16.errors.some((e) => e.startsWith('STALE chokepoints')));
  const g17 = at('2026-10-17T04:30:00Z');
  assert.ok(g17.errors.some((e) => e.startsWith('STALE chokepoints')));
});

test('missing source URL is a hard failure, even with --allow-stale', () => {
  const cp = clone(CP); delete cp.lanes[1].source_url;
  const g = gates({ chokepoints: cp }, { allowStale: true });
  assert.equal(g.ok, false);
  assert.ok(g.errors.some((e) => /bam_redsea: source_url missing/.test(e)));

  const daily = clone(FIX.daily);
  const d = daily.find((r) => r.scenario_id === idOf('D'));
  d.inputs.find((i) => i.used).url = '';
  assert.ok(gates({ daily }).errors.some((e) => /scenarios\.D: a used market input has no source URL/.test(e)));

  const changes = selectChanges(FIX.brief); changes[0].url = null;
  assert.ok(gates({ changes }).errors.some((e) => /brief\.change\[1\]: source URL missing/.test(e)));
});

test('malformed scenario values and ranges are refused', () => {
  const bad = (code, v) => { const daily = clone(FIX.daily); daily.find((r) => r.scenario_id === idOf(code)).probability_raw = v; return gates({ daily }); };
  assert.ok(bad('A', 121.5).errors.some((e) => /scenarios\.A: probability 121\.5 malformed/.test(e)));
  assert.ok(bad('C', Number.NaN).errors.some((e) => /scenarios\.C: probability/.test(e)));
  assert.ok(bad('A', 70).errors.some((e) => /A\+C\+D = 107\.0 > 100/.test(e)));
  assert.ok(bad('B', 80).errors.some((e) => /scenarios\.B: published 80 lies outside its range 41\.5-68\.5/.test(e)));
  const missing = clone(FIX.daily).filter((r) => r.scenario_id !== idOf('C'));
  assert.ok(gates({ daily: missing }).errors.some((e) => /scenarios\.C: no published row/.test(e)));
  const mixed = clone(FIX.daily); mixed[0].conflict_day = 222;
  assert.ok(gates({ daily: mixed }).errors.some((e) => /span several conflict days/.test(e)));
});

test('chokepoint numbers must follow from the counts and the published thresholds', () => {
  const cp = clone(CP); cp.lanes[0].index_pct_of_2023 = 72;
  assert.ok(gates({ chokepoints: cp }).errors.some((e) => /suez: index 72% does not match/.test(e)));
  const cp2 = clone(CP); cp2.lanes[2].status = 'ELEVATED';
  assert.ok(gates({ chokepoints: cp2 }).errors.some((e) => /hormuz: status ELEVATED but traffic band/.test(e)));
  const cp3 = clone(CP); cp3.lanes[2].status = 'CLOSED';
  assert.ok(gates({ chokepoints: cp3 }).errors.some((e) => /hormuz: status CLOSED/.test(e)), 'traffic alone never sets CLOSED');
  assert.equal(trafficBand(90), 'NORMAL'); assert.equal(trafficBand(89.9), 'ELEVATED'); assert.equal(trafficBand(49.9), 'DISRUPTED');
});

test('a brief without sourced items shows "No sourced change today" (never fabricated)', () => {
  const brief = clone(FIX.brief);
  for (const s of brief.sections) for (const ss of s.subsections || []) for (const p of ss.paragraphs || []) p.sources = [];
  const ch = selectChanges(brief);
  assert.equal(ch.length, 0);
  const g = gates({ brief, changes: ch });
  assert.equal(g.ok, true);
  assert.ok(g.notes.some((n) => /No sourced change today/.test(n)));
});

test('licence AVOID outlets (Straits.live, Lloyd\'s List) never feed a line', () => {
  const brief = clone(FIX.brief);
  const p = brief.sections[0].subsections[0].paragraphs[0];
  p.sources = [{ name: 'Straits.live', url: 'https://straits.live/x', published_at: '2026-10-07' }];
  const ch = selectChanges(brief);
  assert.ok(ch.every((c) => !/straits/i.test(c.outlet)));
  assert.notEqual(ch[0].text, firstSentence(p.text));
});

test('first sentence keeps abbreviations intact', () => {
  assert.equal(firstSentence('The U.S. Navy said it saw it. Then more.'), 'The U.S. Navy said it saw it.');
  assert.equal(firstSentence('Maj. Gen. Turki al-Maliki spoke. Next.'), 'Maj. Gen. Turki al-Maliki spoke.');
});
