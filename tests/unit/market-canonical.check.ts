/**
 * Home and War Room show the SAME market number (UX audit 2026-10-13, problem #7: Brent 105.77 vs 105.04
 * on the same day). Canonical value = the newest market_data row per indicator by created_at
 * (id ascending as tie-break, as /markets), whatever order the rows arrive in, with one rounding rule.
 *   npx --yes tsx@4.23.13 tests/unit/market-canonical.check.ts
 */
import assert from 'node:assert/strict';
import {
  buildHomeMarketMetrics,
  formatChangePct,
  formatMarketStamp,
  formatMarketValue,
  latestPerIndicator,
  sortNewestFirst,
} from '../../lib/market-latest';

type R = { id: string; indicator: string | null; value: number | null; change_pct: number | null; conflict_day: number | null; created_at: string | null };
const r = (id: string, indicator: string, value: number, created_at: string | null, change_pct = 0, conflict_day = 228): R => ({
  id, indicator, value, change_pct, conflict_day, created_at,
});

// Same day, two Brent collections: the newest by created_at wins regardless of input order
// (the old home path took the first row PostgREST returned for the latest conflict_day).
const rows = [
  r('a', 'Brent Crude Oil', 105.77, '2026-10-13T06:00:00Z', -0.8),
  r('b', 'Brent Crude Oil', 105.04, '2026-10-13T10:30:00Z', -1.5),
  r('c', 'Gold', 4186.2, '2026-10-13T06:00:00Z', -0.1),
  r('d', 'Gold', 4215.5, '2026-10-13T10:30:00Z', 0.6),
  r('e', 'USD/EGP', 52.7, '2026-10-12T05:00:00Z', 0.1, 227),
];
for (const order of [rows, [...rows].reverse(), [rows[2], rows[0], rows[4], rows[3], rows[1]]]) {
  const m = latestPerIndicator(order);
  assert.equal(m.get('brent crude oil')?.value, 105.04);
  assert.equal(m.get('gold')?.value, 4215.5);
  assert.equal(m.get('usd/egp')?.value, 52.7, 'an older-day indicator is still its own newest row');
  assert.equal(m.size, 3);
}
// map iteration order = newest first
assert.deepEqual([...latestPerIndicator(rows).keys()], ['brent crude oil', 'gold', 'usd/egp']);

// keys are case/whitespace-normalised; rows with no indicator or no timestamp never win over a dated row
const messy = [
  r('x', ' brent crude oil ', 1, null),
  r('y', 'Brent Crude Oil', 2, '2026-10-13T09:00:00Z'),
  { ...r('z', 'n', 3, '2026-10-13T11:00:00Z'), indicator: null },
];
const mm = latestPerIndicator(messy);
assert.equal(mm.get('brent crude oil')?.value, 2);
assert.equal(mm.size, 1, 'a row without an indicator is dropped');

// tie on created_at: id ascending (same as the /markets query)
const tie = sortNewestFirst([r('b2', 'Gold', 2, '2026-10-13T10:30:00Z'), r('a1', 'Gold', 1, '2026-10-13T10:30:00Z')]);
assert.deepEqual(tie.map((x) => x.id), ['a1', 'b2']);

// one rounding rule, used by both pages
assert.equal(formatMarketValue('Brent Crude Oil', 105.04), '105.04');
assert.equal(formatMarketValue('brent crude oil', 105.0449), '105.04');
assert.equal(formatMarketValue('Gold', 4215.5), '4,216');
assert.equal(formatMarketValue('VIX (Fear Index)', 15.214), '15.2');
assert.equal(formatMarketValue('S&P 500', 7807.24), '7,807');
assert.equal(formatMarketValue('USD/SAR', 3.7502), '3.75', 'default: at most 2 decimals');
assert.equal(formatMarketValue('Hormuz Commercial Traffic', 19), '19');
assert.equal(formatMarketValue('USD/IRR', 2657000), '2,657,000');
assert.equal(formatMarketValue('Gold', null), '—');
assert.equal(formatChangePct(-1.54), '−1.5%');
assert.equal(formatChangePct(0.6), '+0.6%');
assert.equal(formatChangePct(0), '0.0%');
assert.equal(formatChangePct(null), '—');

// timestamp shown with the value (UTC, never the browser clock)
assert.equal(formatMarketStamp('2026-10-13T10:30:12Z'), '13 Oct 10:30 UTC');
assert.equal(formatMarketStamp(null), '—');
assert.equal(formatMarketStamp('not a date'), '—');

// Home tiles come from the same newest rows (Brent 105.04, not the earlier 105.77) and carry the timestamp
const home = buildHomeMarketMetrics([...rows].reverse());
assert.deepEqual(home.metrics.map((m) => [m.label, m.value, m.change, m.asOf]), [
  ['BRENT', '$105.04', '\u22121.5%', '13 Oct 10:30 UTC'],
  ['GOLD', '$4,216', '+0.6%', '13 Oct 10:30 UTC'],
]);
assert.equal(home.latestDay, 228);
assert.equal(home.metrics[0].up, false);
// VIX: a fall is shown as good
assert.equal(buildHomeMarketMetrics([r('v', 'VIX (Fear Index)', 15.2, '2026-10-13T10:30:00Z', -2)]).metrics[0].up, true);
assert.deepEqual(buildHomeMarketMetrics([]).metrics, []);

console.log('market-canonical.check: all checks passed');
