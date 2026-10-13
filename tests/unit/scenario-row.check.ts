/**
 * Home ScenarioRow (lib/scenario-row.ts + components/home/ScenarioRow.tsx): the numbers on the home
 * row must be exactly what /scenarios shows for the same registry view. /scenarios' cards use
 * scenarioDisplay / probabilityOn / residualRangeOn / deltaWithinMethod (lib/scenario-registry.ts);
 * this asserts the row's values equal those functions' output on the same fixtures, that B is a
 * range (never a point), and that a null E reads "Unmeasured".
 *
 *   npx --yes tsx@4.23.13 tests/unit/scenario-row.check.ts
 */
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  deltaWithinMethod,
  formatScenarioDelta,
  probabilityOn,
  residualRangeOn,
  scenarioDisplay,
  type RegistryScenario,
  type ScenarioPoint,
  type ScenarioRegistryView,
  type ScenarioRun,
} from '../../lib/scenario-registry';
import { formatRange } from '../../lib/scenario-range';
import { buildScenarioRow } from '../../lib/scenario-row';

// tsconfig has jsx: "preserve", so tsx compiles JSX with the classic runtime (React.createElement):
// expose React before loading the component.
(globalThis as { React?: typeof React }).React = React;
const { createElement } = React;
const { ScenarioRow } = require('../../components/home/ScenarioRow') as typeof import('../../components/home/ScenarioRow');

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`PASS ${label}`);
};

// --- fixtures (shape of getScenarioRegistryView; names = the registry labels) -------------------
const sc = (code: string, name: string, order: number, group = 'core', state: string | null = 'measured'): RegistryScenario => ({
  id: `id-${code}`,
  code,
  group_code: group,
  name_en: name,
  definition_en: `Definition of ${code}`,
  status: 'active',
  display_order: order,
  born_day: null,
  fading_since_day: null,
  retired_day: null,
  measurement_state: state,
  latest_probability: null,
  as_of_day: 228,
  days_below_threshold: null,
});
const scenarios: RegistryScenario[] = [
  sc('A', 'US announces blockade end or a deal', 10),
  sc('B', 'None of A, C or D', 20),
  sc('C', 'Bab el-Mandeb closed while Hormuz is shut', 30),
  sc('D', 'US strike on Iran or Israel–Iran strike', 40),
  sc('E', 'Iran targets the UAE', 50, 'independent', 'unmeasured'),
];
const M = 'market-anchored-v1';
const pt = (code: string, day: number, p: number | null, method = M): ScenarioPoint => ({
  code,
  conflict_day: day,
  method_version: method,
  probability: p,
  null_reason: p === null ? 'no qualifying market' : null,
  provenance: null,
  run_id: day === 228 ? 'run-228' : null,
});
const history: ScenarioPoint[] = [
  // a legacy day: never used for deltas
  pt('A', 30, 40, 'legacy-desk-v0'),
  pt('B', 30, 30, 'legacy-desk-v0'),
  pt('C', 30, 10, 'legacy-desk-v0'),
  pt('D', 30, 20, 'legacy-desk-v0'),
  pt('A', 221, 20),
  pt('B', 221, 52),
  pt('C', 221, 5),
  pt('D', 221, 23),
  pt('E', 221, null),
  pt('A', 227, 15),
  pt('B', 227, 58),
  pt('C', 227, 6),
  pt('D', 227, 21),
  pt('E', 227, null),
  pt('A', 228, 14),
  pt('B', 228, 61),
  pt('C', 228, 6),
  pt('D', 228, 19),
  pt('E', 228, null),
];
const run: ScenarioRun = {
  id: 'run-228',
  conflict_day: 228,
  method_version: M,
  horizon_end: '2026-10-31',
  verdict: 'published',
  flags: ['E NULL: no market meets the quality floor'],
  inputs: [],
  hormuz_gate_rule: null,
  raw_percent: null,
  provenance: null,
  recorded_at: null,
  read_finished_at: null,
  class_probabilities: {},
};
const view: ScenarioRegistryView = {
  scenarios,
  history,
  latestDay: 228,
  latestMethod: M,
  run,
  methods: [],
  groups: [],
  error: null,
};

const row = buildScenarioRow(view);

ok('header: as-of day, method, horizon from the registry view', () => {
  assert.equal(row.day, 228);
  assert.equal(row.method, M);
  assert.equal(row.horizon, '2026-10-31');
});

ok('five items in /scenarios order (core by display_order, then independent), registry labels', () => {
  assert.deepEqual(
    row.items.map((i) => [i.code, i.name]),
    scenarios.map((s) => [s.code, s.name_en]),
  );
  assert.equal(row.items.find((i) => i.code === 'E')!.independent, true);
  assert.equal(row.items.find((i) => i.code === 'A')!.independent, false);
});

ok('every value equals the /scenarios mapper output for the same view', () => {
  for (const item of row.items) {
    const d = scenarioDisplay(view, item.code, 228);
    assert.equal(item.kind, d.kind, `${item.code} kind`);
    if (d.kind === 'unmeasured') assert.equal(item.text, 'Unmeasured');
    else assert.equal(item.text, d.text, `${item.code} text`);
    if (d.kind === 'point') {
      assert.equal(item.p, probabilityOn(history, item.code, 228));
      const delta = deltaWithinMethod(history, item.code, 228);
      assert.equal(item.deltaText, delta ? formatScenarioDelta(delta) : 'No earlier day under this method');
    }
  }
});

ok('Day 228 values: A 14%, C 6%, D 19%, B 61–81% range, E unmeasured', () => {
  const by = Object.fromEntries(row.items.map((i) => [i.code, i]));
  assert.equal(by.A!.text, '14%');
  assert.equal(by.C!.text, '6%');
  assert.equal(by.D!.text, '19%');
  assert.equal(by.B!.text, '61–81%');
  assert.equal(by.E!.text, 'Unmeasured');
});

ok('B is a range, never a point, and carries no delta', () => {
  const b = row.items.find((i) => i.code === 'B')!;
  assert.equal(b.kind, 'range');
  assert.equal(b.p, null);
  assert.equal(b.deltaText, null);
  const r = residualRangeOn(view, 228)!;
  assert.deepEqual([b.low, b.high], [r.low, r.high]);
  assert.equal(b.text, formatRange(r));
  assert.notEqual(b.text, '61%');
});

ok('deltas are within the same method (since Day 221, never the legacy Day 30)', () => {
  const a = row.items.find((i) => i.code === 'A')!;
  assert.equal(a.deltaText, '-6 pts since Day 221 (same method)');
  const d = row.items.find((i) => i.code === 'D')!;
  assert.equal(d.deltaText, '-4 pts since Day 221 (same method)');
  const c = row.items.find((i) => i.code === 'C')!;
  assert.equal(c.deltaText, '+1 pts since Day 221 (same method)');
});

ok('E null shows "Unmeasured" with the run flag as the reason', () => {
  const e = row.items.find((i) => i.code === 'E')!;
  assert.equal(e.kind, 'unmeasured');
  assert.equal(e.p, null);
  assert.equal(e.text, 'Unmeasured');
  assert.equal(e.reason, 'no market meets the quality floor');
});

ok('measurement_state "unmeasured" wins over a stray number (same rule as the /scenarios card)', () => {
  const s2 = scenarios.map((s) => (s.code === 'C' ? { ...s, measurement_state: 'unmeasured' } : s));
  const r2 = buildScenarioRow({ ...view, scenarios: s2 });
  assert.equal(r2.items.find((i) => i.code === 'C')!.text, 'Unmeasured');
});

ok('retired scenarios are not on the row; empty view -> no items, null day', () => {
  const s3 = scenarios.map((s) => (s.code === 'D' ? { ...s, status: 'retired' } : s));
  assert.deepEqual(buildScenarioRow({ ...view, scenarios: s3 }).items.map((i) => i.code), ['A', 'B', 'C', 'E']);
  const empty = buildScenarioRow({ ...view, scenarios: [], history: [], latestDay: null, latestMethod: null, run: null });
  assert.equal(empty.items.length, 0);
  assert.equal(empty.day, null);
});

ok('rendered row: headings, labels, B range, Unmeasured, method, horizon and the /scenarios link', () => {
  const html = renderToStaticMarkup(createElement(ScenarioRow, { row }));
  assert.match(html, /<h2[^>]*>[^<]*Scenario/i);
  for (const s of scenarios) assert.ok(html.includes(s.name_en.replace('&', '&amp;')), `label ${s.code}`);
  assert.ok(html.includes('61–81%'));
  assert.ok(!/>61%</.test(html), 'B never printed as its low end alone');
  assert.ok(html.includes('Unmeasured'));
  assert.ok(html.includes('No market meets the quality floor'), 'E reason in the /scenarios wording');
  assert.ok(html.includes('market-anchored-v1'));
  assert.ok(html.includes('2026-10-31'));
  assert.ok(html.includes('Day 228'));
  assert.match(html, /href="\/scenarios"/);
  assert.ok(html.includes('Full method &amp; markets'));
  assert.ok(!/leads/i.test(html), 'B is never described as leading');
});

ok('rendered row with no data says so (no invented numbers)', () => {
  const empty = buildScenarioRow({ ...view, scenarios: [], history: [], latestDay: null, latestMethod: null, run: null });
  const html = renderToStaticMarkup(createElement(ScenarioRow, { row: empty }));
  assert.ok(/not available/i.test(html));
  assert.ok(!/\d+%/.test(html));
});

console.log(`\n${n} checks passed`);
