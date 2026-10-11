/**
 * Checks for lib/scenario-range.ts (B as a Fréchet range, constant-hazard 30-day reading) and the
 * registry helpers that apply them. Plain assert script, like the other *.check.ts files:
 *
 *   npx --yes tsx tests/unit/scenario-range.check.ts
 *
 * Not named *.test.ts / *.spec.ts so Playwright's testMatch ignores it.
 */
import assert from 'node:assert/strict';
import { constantHorizonProbability, daysBetween, formatRange, residualRange } from '../../lib/scenario-range';
import {
  daysToHorizonFor,
  residualRange30,
  residualRangeFromRow,
  residualRangeOn,
  scenarioDisplay,
  thirtyDayReadings,
  type RegistryScenario,
  type ScenarioPoint,
  type ScenarioRun,
} from '../../lib/scenario-registry';

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`PASS ${label}`);
};

// --- residualRange: the bound math --------------------------------------------------------------
ok('Day 226 panel: A12 C6 D22 -> B 60-78', () => {
  assert.deepEqual(residualRange({ A: 12, C: 6, D: 22 }), { low: 60, high: 78, exact: false, missing: [] });
});
ok('Day 222 panel (seat 09 worked example): A20.5 C5.5 D25.5 -> 48.5-74.5', () => {
  const r = residualRange({ A: 20.5, C: 5.5, D: 25.5 })!;
  assert.equal(r.low, 48.5);
  assert.equal(r.high, 74.5);
});
ok('sum > 100: low clamps at 0, high = 100 - max', () => {
  assert.deepEqual(residualRange({ A: 60, C: 30, D: 40 }), { low: 0, high: 40, exact: false, missing: [] });
});
ok('sum exactly 100: low 0', () => {
  assert.equal(residualRange({ A: 50, C: 20, D: 30 })!.low, 0);
});
ok('any null: low drops to 0, high from the known components, missing listed', () => {
  assert.deepEqual(residualRange({ A: 12, C: null, D: 22 }), { low: 0, high: 78, exact: false, missing: ['C'] });
});
ok('undefined / NaN / Infinity count as unknown', () => {
  assert.deepEqual(residualRange({ A: undefined, C: Number.NaN, D: Number.POSITIVE_INFINITY, X: 10 })!.missing, ['A', 'C', 'D']);
});
ok('all null: no range (null)', () => {
  assert.equal(residualRange({ A: null, C: null, D: null }), null);
  assert.equal(residualRange({}), null);
});
ok('single market: exact, low = high = 100 - value', () => {
  assert.deepEqual(residualRange({ A: 20 }), { low: 80, high: 80, exact: true, missing: [] });
});
ok('single known + one null: 0..100-known', () => {
  assert.deepEqual(residualRange({ A: 20, D: null }), { low: 0, high: 80, exact: false, missing: ['D'] });
});
ok('all zero: B is certain (100, exact)', () => {
  assert.deepEqual(residualRange({ A: 0, C: 0, D: 0 }), { low: 100, high: 100, exact: true, missing: [] });
});
ok('only one non-zero: exact', () => {
  assert.equal(residualRange({ A: 0, C: 0, D: 30 })!.exact, true);
});
ok('values outside [0,100] are clamped', () => {
  assert.deepEqual(residualRange({ A: -5, C: 150 }), { low: 0, high: 0, exact: true, missing: [] });
});
ok('fractional total (0-1 scale)', () => {
  const r = residualRange({ A: 0.125, C: 0.065, D: 0.215 }, 1)!;
  assert.ok(Math.abs(r.low - 0.595) < 1e-12 && Math.abs(r.high - 0.785) < 1e-12);
});
ok('invariant: 0 <= low <= high <= 100 over a grid', () => {
  for (let a = 0; a <= 100; a += 7) for (let c = 0; c <= 100; c += 11) for (let d = 0; d <= 100; d += 13) {
    const r = residualRange({ A: a, C: c, D: d })!;
    assert.ok(r.low >= 0 && r.low <= r.high && r.high <= 100, `${a},${c},${d}`);
    assert.equal(r.low, Math.max(0, 100 - a - c - d));
    assert.equal(r.high, 100 - Math.max(a, c, d));
  }
});
ok('formatRange', () => {
  assert.equal(formatRange({ low: 60, high: 78, exact: false, missing: [] }), '60–78%');
  assert.equal(formatRange({ low: 80, high: 80, exact: true, missing: [] }), '80%');
  assert.equal(formatRange({ low: 48.5, high: 74.5, exact: false, missing: [] }), '49–75%');
});

// --- constant-hazard 30-day reading ------------------------------------------------------------
ok('p30 = p when the market closes in exactly 30 days', () => {
  assert.ok(Math.abs(constantHorizonProbability(0.2, 30)! - 0.2) < 1e-12);
});
ok('seat 09 worked example (24.2 / 29.9 / 6.6%, computed there with a rounded hazard): within 0.1 pt', () => {
  const pct = (p: number) => constantHorizonProbability(p, 24.9)! * 100;
  assert.ok(Math.abs(pct(0.205) - 24.2) <= 0.1, String(pct(0.205)));
  assert.ok(Math.abs(pct(0.255) - 29.9) <= 0.1, String(pct(0.255)));
  assert.ok(Math.abs(pct(0.055) - 6.6) <= 0.1, String(pct(0.055)));
  // and it equals the hazard form 1 - exp(-30h), h = -ln(1-p)/tau
  const h = -Math.log(1 - 0.205) / 24.9;
  assert.ok(Math.abs(constantHorizonProbability(0.205, 24.9)! - (1 - Math.exp(-30 * h))) < 1e-12);
});
ok('shorter horizon -> p30 above p; longer -> below', () => {
  assert.ok(constantHorizonProbability(0.1, 10)! > 0.1);
  assert.ok(constantHorizonProbability(0.1, 60)! < 0.1);
});
ok('edges: 0 -> 0, 1 -> 1, null / NaN / days <= 0 -> null', () => {
  assert.equal(constantHorizonProbability(0, 20), 0);
  assert.equal(constantHorizonProbability(1, 20), 1);
  assert.equal(constantHorizonProbability(null, 20), null);
  assert.equal(constantHorizonProbability(Number.NaN, 20), null);
  assert.equal(constantHorizonProbability(0.2, 0), null);
  assert.equal(constantHorizonProbability(0.2, -3), null);
  assert.equal(constantHorizonProbability(0.2, null), null);
});
ok('daysBetween', () => {
  assert.equal(daysBetween('2026-10-01T00:00:00Z', '2026-10-31T00:00:00Z'), 30);
  assert.equal(daysBetween('bad', '2026-10-31T00:00:00Z'), null);
  assert.equal(daysBetween(null, '2026-10-31T00:00:00Z'), null);
});

// --- registry helpers on a Day 226-shaped view (values from scenario_runs, read-only) ----------
const sc = (code: string, group = 'core', status = 'active'): RegistryScenario => ({
  id: code, code, group_code: group, name_en: code, definition_en: '', status, display_order: 0, born_day: 1,
  fading_since_day: null, retired_day: null, measurement_state: null, latest_probability: null, as_of_day: null,
  days_below_threshold: null,
});
const scenarios = [sc('A'), sc('B'), sc('C'), sc('D'), sc('E', 'independent')];
const pt = (code: string, p: number | null, day = 226): ScenarioPoint => ({
  code, conflict_day: day, method_version: 'market-anchored-v1', probability: p, null_reason: null, provenance: null, run_id: 'r',
});
const history = [pt('A', 12), pt('B', 60), pt('C', 6), pt('D', 22), pt('E', null)];

ok('residualRangeOn uses the same day\'s A, C, D', () => {
  assert.deepEqual(residualRangeOn({ scenarios, history }, 226), { low: 60, high: 78, exact: false, missing: [] });
  assert.equal(residualRangeOn({ scenarios, history }, 225), null, 'no B that day');
  assert.equal(residualRangeOn({ scenarios, history }, null), null);
});
ok('residualRangeOn ignores retired components', () => {
  const s2 = [sc('A'), sc('B'), sc('C', 'core', 'retired'), sc('D')];
  assert.deepEqual(residualRangeOn({ scenarios: s2, history }, 226)!.high, 78);
  assert.equal(residualRangeOn({ scenarios: s2, history }, 226)!.low, 66);
});
ok('scenarioDisplay: B range, A point, E unmeasured', () => {
  const v = { scenarios, history };
  assert.deepEqual(scenarioDisplay(v, 'B', 226).text, '60–78%');
  assert.equal(scenarioDisplay(v, 'A', 226).text, '12%');
  assert.equal(scenarioDisplay(v, 'E', 226).kind, 'unmeasured');
});
ok('residualRangeFromRow (chart rows)', () => {
  assert.deepEqual(residualRangeFromRow({ day: 226, A: 12, B: 60, C: 6, D: 22 }, ['A', 'C', 'D'])!.high, 78);
  assert.equal(residualRangeFromRow({ day: 226, A: 12, B: null, C: 6, D: 22 }, ['A', 'C', 'D']), null);
});

const input = (cls: string, p: number, used = true, resolution = '2026-11-01T03:59:00Z') => ({
  venue: 'Polymarket', question: cls, url: 'https://example.test', probability: p, yes_bid: null, yes_ask: null,
  liquidity: null, scenario_class: cls, used, excluded_reason: null, transform: null,
  read_at: '2026-10-11T11:28:20Z', resolution_date: resolution,
});
const run: ScenarioRun = {
  id: 'r', conflict_day: 226, method_version: 'market-anchored-v1', horizon_end: '2026-10-31', verdict: 'PUBLISH', flags: [],
  inputs: [input('A', 0.125), input('A', 0.09), input('C', 0.065), input('D', 0.215, true, '2026-10-31T23:59:00Z'), input('D', 0.145),
    input('E', 0.245, false)],
  hormuz_gate_rule: null, raw_percent: null, provenance: null, recorded_at: '2026-10-11T11:30:00Z',
  read_finished_at: '2026-10-11T11:28:20Z', class_probabilities: { A: 0.125, C: 0.065, D: 0.215, E: null },
};
ok('daysToHorizonFor picks the driving market (price == class probability)', () => {
  const dA = daysToHorizonFor(run, 'A')!;
  assert.ok(Math.abs(dA - daysBetween('2026-10-11T11:28:20Z', '2026-11-01T03:59:00Z')!) < 1e-9);
  const dD = daysToHorizonFor(run, 'D')!;
  assert.ok(Math.abs(dD - daysBetween('2026-10-11T11:28:20Z', '2026-10-31T23:59:00Z')!) < 1e-9, 'D driver is the 0.215 market');
});
ok('daysToHorizonFor falls back to horizon_end when no input matches', () => {
  const r2: ScenarioRun = { ...run, inputs: [], class_probabilities: { A: 0.125 } };
  const d = daysToHorizonFor(r2, 'A')!;
  assert.ok(Math.abs(d - daysBetween('2026-10-11T11:28:20Z', '2026-10-31T23:59:59Z')!) < 1e-9);
});
ok('thirtyDayReadings: A, C, D present, E (null) absent; ~20.7 days to close -> p30 above p', () => {
  const r = thirtyDayReadings(run);
  assert.deepEqual(Object.keys(r).sort(), ['A', 'C', 'D']);
  assert.ok(r.A!.p30 > 0.125 && r.A!.p30 < 0.2);
  assert.equal(Math.round(r.A!.p30 * 100), 18);
  assert.equal(thirtyDayReadings(null) && Object.keys(thirtyDayReadings(null)).length, 0);
});
ok('residualRange30 from rounded p30 of A, C, D', () => {
  const r = thirtyDayReadings(run);
  const rr = residualRange30(scenarios, r)!;
  const a = Math.round(r.A!.p30 * 100), c = Math.round(r.C!.p30 * 100), d = Math.round(r.D!.p30 * 100);
  assert.deepEqual([rr.low, rr.high], [Math.max(0, 100 - a - c - d), 100 - Math.max(a, c, d)]);
});

ok('thirtyDayReadings: no conversion in the last week of a market (2% two hours before close is not 99.9%)', () => {
  const late: ScenarioRun = {
    ...run,
    inputs: [input('A', 0.02, true, '2026-10-11T13:28:20Z'), input('D', 0.215, true, '2026-10-16T11:28:20Z'), input('C', 0.065)],
    class_probabilities: { A: 0.02, C: 0.065, D: 0.215 },
  };
  const r = thirtyDayReadings(late);
  assert.equal(r.A, undefined, '2 hours to close: hidden');
  assert.equal(r.D, undefined, '5 days to close: hidden');
  assert.ok(r.C, '20.7 days to close: shown');
  assert.equal(residualRange30(scenarios, r)!.low, 0, 'A and D unknown -> B30 low end 0');
});

console.log(`scenario-range.check: ${n} checks passed`);
