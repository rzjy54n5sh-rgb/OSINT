/**
 * New scenarios born from candidates (operator standing order 2026-10-17: "publish new scenarios automatically").
 * A born scenario (F, G, ...) in group 'independent' has NO market: scenario_daily.py writes rows only for A-E,
 * so the registry view has no published point for it and v_scenario_lifecycle reports measurement_state
 * 'no_reading'. Every reader must then show it as unmeasured WITH an honest reason (never a number, never blank),
 * and A-E (including B = "None of A, C or D") must be exactly what they were without it.
 *
 * Fixtures mirror the scratch-replica dry run of promote_FG.sql + the job (Day 232).
 *
 *   npx --yes tsx@4.23.13 tests/unit/scenario-new-births.check.ts
 */
import assert from 'node:assert/strict';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as registry from '../../lib/scenario-registry';
import {
  residualComponentCodes,
  residualRangeOn,
  scenarioColor,
  scenarioDisplay,
  type RegistryScenario,
  type RunInput,
  type ScenarioPoint,
  type ScenarioRegistryView,
  type ScenarioRun,
} from '../../lib/scenario-registry';
import { buildScenarioRow } from '../../lib/scenario-row';

(globalThis as { React?: typeof React }).React = React;
const { createElement } = React;
require.extensions['.css'] = (m: NodeJS.Module) => {
  const classes: object = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? undefined : String(k)) });
  m.exports = classes;
};
const { ScenarioRow } = require('../../components/home/ScenarioRow') as typeof import('../../components/home/ScenarioRow');
const { ScenariosClient } = require('../../components/scenarios/ScenariosClient') as typeof import('../../components/scenarios/ScenariosClient');

/** A reason may name days ("Day 232") and the method version, and nothing else numeric: no probability, ever. */
function assertNoInventedNumber(reason: string, label: string) {
  const stripped = reason.replace(/\bDay \d+\b/g, '').replace(/market-anchored-v\d+/g, '');
  assert.ok(!/\d/.test(stripped), `${label}: reason carries a number other than a day: ${reason}`);
  assert.ok(!/%|percent|per cent|probab|likel|chance|odds/i.test(stripped), `${label}: reason reads like an estimate: ${reason}`);
}
/** Text content of one /scenarios card, from the rendered page. */
function card(html: string, code: string): string {
  const i = html.indexOf(`data-testid="scenario-card-${code}"`);
  assert.ok(i >= 0, `card ${code} rendered`);
  return html.slice(i, html.indexOf('</article>', i));
}

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`PASS ${label}`);
};

const M = 'market-anchored-v1';
const sc = (code: string, name: string, order: number, group: string, born: number, state: string | null): RegistryScenario => ({
  id: `id-${code}`,
  code,
  group_code: group,
  name_en: name,
  definition_en: `Definition of ${code}`,
  status: 'active',
  display_order: order,
  born_day: born,
  fading_since_day: null,
  retired_day: null,
  measurement_state: state,
  latest_probability: null,
  as_of_day: 232,
  days_below_threshold: 0,
});
const base: RegistryScenario[] = [
  sc('A', 'US announces blockade end or a deal', 10, 'core', 1, 'measured'),
  sc('B', 'None of A, C or D', 20, 'core', 1, 'measured'),
  sc('C', 'Bab el-Mandeb closed while Hormuz is shut', 30, 'core', 1, 'measured'),
  sc('D', 'US strike on Iran or Israel–Iran strike', 40, 'core', 1, 'measured'),
  sc('E', 'Iran targets the UAE', 50, 'independent', 15, 'unmeasured'),
];
const born: RegistryScenario[] = [
  sc('F', 'Turkish or Pakistani forces strike the Houthis or Iran', 60, 'independent', 232, 'no_reading'),
  sc('G', 'Ethiopian and Eritrean forces fight each other directly', 70, 'independent', 232, 'no_reading'),
];
const pt = (code: string, day: number, p: number | null): ScenarioPoint => ({
  code,
  conflict_day: day,
  method_version: M,
  probability: p,
  null_reason: p === null ? 'No E proxy passes the quality floor (method 1.5 E / 1.9)' : null,
  provenance: 'contemporaneous',
  run_id: `run-${day}`,
});
// The job's own rows: A-E only (scenario_daily.py builds rows for codes A-E; F/G get none).
const history: ScenarioPoint[] = [
  pt('A', 231, 5), pt('B', 231, 72), pt('C', 231, 4), pt('D', 231, 19), pt('E', 231, null),
  pt('A', 232, 23), pt('B', 232, 44), pt('C', 232, 5), pt('D', 232, 28), pt('E', 232, null),
];
const input = (cls: string): RunInput => ({
  venue: 'Polymarket', question: `q ${cls}`, url: `https://polymarket.com/event/${cls}`, probability: 0.2, yes_bid: 0.19,
  yes_ask: 0.21, liquidity: null, scenario_class: cls, used: cls !== 'E', excluded_reason: cls === 'E' ? 'spread 0.2' : null,
  transform: null, read_at: '2026-10-17T05:21:00Z', resolution_date: '2026-11-01T03:59:00Z',
});
const run: ScenarioRun = {
  id: 'run-232', conflict_day: 232, method_version: M, horizon_end: '2026-10-31', verdict: 'PUBLISH',
  flags: ['E NULL: No E proxy passes the quality floor (method 1.5 E / 1.9)'],
  inputs: ['A', 'A', 'C', 'D', 'D', 'E'].map(input), hormuz_gate_rule: null, raw_percent: null, provenance: null,
  recorded_at: null, read_finished_at: null, class_probabilities: {},
};
const view = (scenarios: RegistryScenario[], latestDay = 232): ScenarioRegistryView => ({
  scenarios, history: history.filter((p) => p.conflict_day <= latestDay), latestDay, latestMethod: M,
  run: latestDay === 232 ? run : { ...run, id: 'run-231', conflict_day: 231 }, methods: [], groups: [], error: null,
});
const before = buildScenarioRow(view(base));
const after = buildScenarioRow(view([...base, ...born]));

ok('A-E are byte-identical with and without F and G on the board', () => {
  assert.deepEqual(after.items.slice(0, 5), before.items);
  assert.equal(after.day, before.day);
  assert.equal(after.horizon, before.horizon);
});

ok('B stays "None of A, C or D": its range components are A, C, D only (never F/G)', () => {
  assert.deepEqual(residualComponentCodes([...base, ...born]), ['A', 'C', 'D']);
  assert.deepEqual(residualRangeOn(view([...base, ...born]), 232), residualRangeOn(view(base), 232));
  assert.equal(after.items.find((i) => i.code === 'B')!.text, before.items.find((i) => i.code === 'B')!.text);
});

ok('F and G are on the row, after E, unmeasured, with no number', () => {
  assert.deepEqual(after.items.map((i) => i.code), ['A', 'B', 'C', 'D', 'E', 'F', 'G']);
  for (const code of ['F', 'G']) {
    const it = after.items.find((i) => i.code === code)!;
    assert.equal(it.kind, 'unmeasured');
    assert.equal(it.text, 'Unmeasured');
    assert.equal(it.p, null);
    assert.equal(it.independent, true);
    assert.equal(scenarioDisplay(view([...base, ...born]), code, 232).kind, 'unmeasured');
    assert.equal(scenarioColor(code), scenarioColor('E'), 'no identity colour beyond A-D: the neutral');
  }
});

ok('F and G carry an honest reason: the run read no market for them (not blank, not invented)', () => {
  for (const code of ['F', 'G']) {
    const it = after.items.find((i) => i.code === code)!;
    assert.ok(it.reason, `${code} reason must not be empty`);
    assert.match(it.reason!, /no market/i);
    assert.match(it.reason!, new RegExp(`Day 232`));
    assertNoInventedNumber(it.reason!, code);
  }
});

ok('E keeps its own run flag as the reason (unchanged)', () => {
  assert.equal(after.items.find((i) => i.code === 'E')!.reason, 'No E proxy passes the quality floor (method 1.5 E / 1.9)');
});

ok('a scenario born after the latest published day says so', () => {
  const r = buildScenarioRow(view([...base, ...born], 231));
  const f = r.items.find((i) => i.code === 'F')!;
  assert.equal(f.kind, 'unmeasured');
  assert.match(f.reason ?? '', /born on Day 232/i);
  assert.match(f.reason ?? '', /Day 231/);
  assertNoInventedNumber(f.reason ?? '', 'F born after');
  const h = (registry as unknown as { unmeasuredHeadline: (r: string | null) => string }).unmeasuredHeadline;
  assert.equal(h(f.reason), 'Unmeasured — no reading yet');
  const html = renderToStaticMarkup(createElement(ScenarioRow, { row: r, currentDay: 232 }));
  const fStart = html.indexOf('data-testid="home-scenario-F"');
  assert.ok(html.slice(fStart, html.indexOf('</li>', fStart)).includes('No reading yet'), 'home F card: No reading yet');
});

ok('the number guard itself rejects an estimate smuggled into a reason', () => {
  assert.throws(() => assertNoInventedNumber('No market is linked; about 12 percent on Day 232', 'mutant'));
  assert.throws(() => assertNoInventedNumber('Roughly a one-in-five chance', 'mutant'));
  assert.doesNotThrow(() => assertNoInventedNumber(after.items.find((i) => i.code === 'G')!.reason!, 'G'));
});

ok('/scenarios cards F and G (Day 232): unmeasured, "no market linked" headline, the reason, no number', () => {
  const v = view([...base, ...born]);
  const html = renderToStaticMarkup(createElement(ScenariosClient, { hasDetailAccess: true, registry: v, currentDay: 232 }));
  for (const code of ['F', 'G']) {
    const c = card(html, code);
    assert.ok(c.includes('data-measurement="unmeasured"'), `${code} unmeasured`);
    assert.ok(c.includes('Unmeasured — no market linked'), `${code} headline`);
    assert.ok(c.includes('No market is linked to this scenario: the Day 232 market-anchored-v1 run read no market for'), `${code} reason line`);
    assert.ok(!/\d+(\.\d+)?%/.test(c), `${code}: no percentage on the card`);
  }
  // A-E cards are the same as on a board without F/G.
  const html0 = renderToStaticMarkup(createElement(ScenariosClient, { hasDetailAccess: true, registry: view(base), currentDay: 232 }));
  for (const code of ['A', 'B', 'C', 'D', 'E']) assert.equal(card(html, code), card(html0, code), `${code} card unchanged`);
});

ok('/scenarios cards F and G (latest published day 231, born 232): "no reading yet"', () => {
  const v = view([...base, ...born], 231);
  const html = renderToStaticMarkup(createElement(ScenariosClient, { hasDetailAccess: true, registry: v, currentDay: 232 }));
  for (const code of ['F', 'G']) {
    const c = card(html, code);
    assert.ok(c.includes('Unmeasured — no reading yet'), `${code} headline`);
    assert.ok(c.includes('Born on Day 232, after the latest published day (Day 231); no reading yet.'), `${code} reason line`);
  }
});

ok('headline helpers: no market linked vs quality floor vs no qualifying market', () => {
  const h = (registry as unknown as { unmeasuredHeadline: (r: string | null) => string }).unmeasuredHeadline;
  assert.equal(typeof h, 'function');
  assert.equal(h(after.items.find((i) => i.code === 'F')!.reason), 'Unmeasured — no market linked');
  assert.equal(h('No E proxy passes the quality floor'), 'Unmeasured — no market meets the quality floor');
  assert.equal(h(null), 'Unmeasured — no qualifying market');
});

ok('rendered home row: all seven, F/G say "No market linked", no number for them, one row for any count', () => {
  const html = renderToStaticMarkup(createElement(ScenarioRow, { row: after, currentDay: 232 }));
  for (const s of [...base, ...born]) assert.ok(html.includes(`data-testid="home-scenario-${s.code}"`), `item ${s.code}`);
  for (const s of born) assert.ok(html.includes(s.name_en), `label ${s.code}`);
  const fStart = html.indexOf('data-testid="home-scenario-F"');
  const f = html.slice(fStart, html.indexOf('</li>', fStart));
  assert.ok(f.includes('Unmeasured'));
  assert.ok(f.includes('No market linked'));
  assert.ok(!/\d+%/.test(f), 'no percentage inside the F card');
  assert.ok(!html.includes('lg:grid-cols-5'), 'the row is not hard-wired to five columns');
});

console.log(`\n${n} checks passed`);
