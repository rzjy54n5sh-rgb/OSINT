/**
 * Corridors view-model (lib/corridors.ts): staleness and gate parity with the daily card's
 * scripts/card/lib/gates.mjs, UNKNOWN on stale, index math, week labels, history parsing.
 * Every value assertion runs on FROZEN fixtures (Chokepoint Weekly #1 and its history file, in
 * scripts/card/test/fixtures/). The live data/chokepoints/latest.json changes weekly; it appears only in the
 * gate-parity loop, which compares two implementations on whatever the file holds and asserts no values.
 *   npx --yes tsx@4.23.13 tests/unit/corridors.check.ts
 */
import assert from 'node:assert/strict';
import * as cardGates from '../../scripts/card/lib/gates.mjs';
import * as cardModel from '../../scripts/card/lib/model.mjs';
import * as wrapper from '../../lib/card-gates';
import issue1 from '../../scripts/card/test/fixtures/chokepoints-issue1.json';
import malformedBundle from '../../scripts/card/test/fixtures/malformed.json';
import latest from '../../data/chokepoints/latest.json';
// Frozen copy of data/chokepoints/history.json as of Issue #1 (retrieved 2026-10-13, newest week 28 Sep).
import history from '../../scripts/card/test/fixtures/chokepoints-history-issue1.json';
import {
  buildCorridors,
  chokepointGate,
  corridorHeadline,
  formatDay,
  formatWeek,
  indexPct,
  licenceLine,
  parseHistory,
  wowDelta,
  LANE_ORDER,
  CHOKEPOINT_MAX_AGE_DAYS,
  CHOKEPOINT_MAX_WEEK_END_AGE_DAYS,
} from '../../lib/corridors';

// The wrapper re-exports the card's own function objects (no copy).
const runGates = cardGates.runGates as unknown as typeof wrapper.runGates;
const BASELINE_WEEK = cardModel.BASELINE_WEEK as Record<string, number>;
assert.equal(wrapper.runGates, runGates, 'lib/card-gates re-exports gates.mjs runGates itself');
assert.equal(wrapper.chokepointView, cardModel.chokepointView as unknown, 'lib/card-gates re-exports model.mjs chokepointView itself');

let checks = 2;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = <T>(a: T, b: T, msg: string) => {
  assert.deepEqual(a, b, msg);
  checks++;
};
const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

// ---- 1. Gate parity with scripts/card/lib/gates.mjs runGates ---------------------------------
type Cp = typeof issue1;
const variants: Record<string, unknown> = {
  issue1: issue1,
  latest: latest,
  malformed: (malformedBundle as { chokepoints: unknown }).chokepoints,
  futureAsOf: (() => { const c = clone(issue1) as Cp; c.lanes[0].as_of = '2026-12-01T00:00:00Z'; return c; })(),
  oldWeek: (() => { const c = clone(issue1) as Cp; for (const l of c.lanes) { l.week_start = '2026-09-14'; l.week_end = '2026-09-20'; } return c; })(),
  missingLane: (() => { const c = clone(issue1) as Cp; c.lanes = c.lanes.slice(0, 2); return c; })(),
  wrongSchema: (() => { const c = clone(issue1) as Record<string, unknown>; c.schema = 'x'; return c; })(),
  nothing: null,
};
const nows = [
  '2026-10-08T12:30:00Z', '2026-10-13T09:00:00Z', '2026-10-16T23:59:00Z', '2026-10-17T00:01:00Z',
  '2026-10-18T12:00:00Z', '2026-10-28T12:00:00Z', '2026-11-30T12:00:00Z',
].map((s) => new Date(s));

const cardChokepointErrors = (cp: unknown, now: Date, allowStale: boolean) => {
  const g = runGates({ chokepoints: cp, registry: [], daily: [], brief: null, changes: [] }, { now, allowStale });
  return { errors: g.errors.filter((e) => e.replace(/^STALE /, '').startsWith('chokepoints')), stale: g.stale.chokepoints };
};

for (const [name, cp] of Object.entries(variants)) {
  for (const now of nows) {
    const strict = cardChokepointErrors(cp, now, false);
    const lenient = cardChokepointErrors(cp, now, true);
    const ours = chokepointGate(cp, now);
    const tag = `${name} @ ${now.toISOString()}`;
    // Identical error lists to the card (allowStale = true, so staleness is reported separately).
    eq(ours.errors, lenient.errors, `${tag}: errors equal runGates (allowStale)`);
    eq(ours.stale, lenient.stale, `${tag}: stale flag equals runGates`);
    // The card's strict mode refuses exactly when we are not "current".
    const view = buildCorridors(cp, history, now);
    eq(view.state === 'current', strict.errors.length === 0, `${tag}: current <=> card accepts strictly`);
    if (lenient.errors.length) eq(view.state, 'withheld', `${tag}: gate errors -> withheld`);
    else if (lenient.stale) eq(view.state, 'stale', `${tag}: stale -> stale`);
  }
}
eq(CHOKEPOINT_MAX_AGE_DAYS, 8, 'as_of allowance re-exported from gates.mjs');
eq(CHOKEPOINT_MAX_WEEK_END_AGE_DAYS, 13, 'week_end allowance re-exported from gates.mjs');

// ---- 2. Current and UNKNOWN-on-stale --------------------------------------------------------
{
  const v = buildCorridors(issue1, history, new Date('2026-10-13T09:00:00Z'));
  eq(v.state, 'current', 'Issue #1 is current on 13 Oct');
  eq(v.lanes.map((l) => l.id), [...LANE_ORDER], 'display order Hormuz, Bab al-Mandeb, Suez');
  eq(v.lanes.map((l) => l.status), ['DISRUPTED', 'DISRUPTED', 'ELEVATED'], 'statuses copied when current');
  eq(v.lanes.map((l) => l.transits), [19, 207, 302], 'transits');
  eq(v.lanes.map((l) => l.prev), [22, 190, 280], 'previous week');
  eq(v.lanes.map((l) => l.baselineWeek), [669.4, 522.1, 515.4], '2023 average week');
  eq(v.weekLabel, '28 Sep – 4 Oct 2026', 'week label');
  eq(v.staleMessage, null, 'no stale message when current');
  ok(/IMF PortWatch \(UN Global Platform\), AIS-based/.test(v.sourceCredit), 'source credit');
  ok(/Do not resell the raw series/.test(v.licence), 'licence line');
  eq(v.licenceLine, 'Transit data: IMF PortWatch (UN Global Platform), AIS-based. We do not resell the raw series.', 'printed licence line (pre-ruling USE-PROVISIONAL file)');
  ok(!/provisional/i.test(v.licenceLine), 'no "provisional" wording printed');
  eq(
    buildCorridors({ ...clone(issue1), licence: 'USE (operator ruling 2026-10-13). Do not resell the raw series.' }, history, new Date('2026-10-13T09:00:00Z')).licenceLine,
    'Transit data: IMF PortWatch (UN Global Platform), AIS-based. We do not resell the raw series.',
    'printed licence line (licence USE per operator ruling 2026-10-13)',
  );
  eq(licenceLine('Some other licence text.'), 'Some other licence text.', 'a non-PortWatch licence prints verbatim');
  // licenceLine: only an unrestricted USE status ("USE", "USE.", "USE (...)", legacy "USE-PROVISIONAL") prints the
  // plain line; any other status (a restriction, a pending check, lowercase) prints verbatim; empty / whitespace /
  // non-string input falls back to the plain line instead of an empty paragraph.
  {
    const PLAIN = 'Transit data: IMF PortWatch (UN Global Platform), AIS-based. We do not resell the raw series.';
    const cases: [unknown, string][] = [
      ['USE-RESTRICTED: non-commercial only', 'USE-RESTRICTED: non-commercial only'],
      ['USE? pending', 'USE? pending'],
      ['USEFUL NOTE: check terms', 'USEFUL NOTE: check terms'],
      ['use (operator ruling 2026-10-13). Do not resell the raw series.', 'use (operator ruling 2026-10-13). Do not resell the raw series.'],
      ['', PLAIN],
      ['   ', PLAIN],
      [undefined, PLAIN],
      [null, PLAIN],
      [42, PLAIN],
      ['USE', PLAIN],
      ['USE.', PLAIN],
      ['USE (operator ruling 2026-10-13). Do not resell the raw series.', PLAIN],
      ['USE-PROVISIONAL (licence_check.md row 4). Do not resell the raw series.', PLAIN],
    ];
    const bad: string[] = [];
    for (const [input, want] of cases) {
      let got: string;
      try {
        got = licenceLine(input as string);
      } catch (e) {
        got = `THREW ${(e as Error).message}`;
      }
      if (got !== want) bad.push(`licenceLine(${JSON.stringify(input)}) = ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
      checks++;
    }
    if (bad.length) console.error(bad.map((b) => `FAIL ${b}`).join('\n'));
    assert.deepEqual(bad, [], `licenceLine: ${bad.length} of ${cases.length} cases wrong`);
  }
  eq(
    corridorHeadline(v),
    'Two of three lanes are DISRUPTED; Suez is ELEVATED. Hormuz had 19 transits, against 669 in an average 2023 week.',
    'headline states the finding from the data',
  );
}
{
  // 16 Oct: as_of 8 days old -> still allowed; 17 Oct: 9 days -> stale.
  eq(buildCorridors(issue1, history, new Date('2026-10-16T23:59:00Z')).state, 'current', '8 days old is allowed');
  const v = buildCorridors(issue1, history, new Date('2026-10-17T00:01:00Z'));
  eq(v.state, 'stale', '9 days old is stale');
  eq(v.lanes.map((l) => l.status), ['UNKNOWN', 'UNKNOWN', 'UNKNOWN'], 'stale -> every lane UNKNOWN');
  eq(v.staleMessage, 'Not updated since 8 Oct 2026', 'stale message names the as_of date');
  ok(corridorHeadline(v).startsWith('Not updated since 8 Oct 2026.') && !/DISRUPTED|ELEVATED/.test(corridorHeadline(v)), 'stale headline never names a stale status');
  eq(v.lanes.map((l) => l.transits), [19, 207, 302], 'last known figures stay visible when stale');
  ok(v.lanes.every((l) => l.reportedStatus !== null), 'the file status is kept only as reportedStatus');
}
{
  const late = buildCorridors(issue1, history, new Date('2026-11-02T12:00:00Z')); // 20+ days later
  eq(late.state, 'stale', '20 days later is stale');
  ok(late.lanes.every((l) => l.status === 'UNKNOWN'), 'UNKNOWN 20 days later');
  const bad = buildCorridors((malformedBundle as { chokepoints: unknown }).chokepoints, history, new Date('2026-10-08T12:30:00Z'));
  eq(bad.state, 'withheld', 'malformed file is withheld');
  ok(bad.lanes.every((l) => l.status === 'UNKNOWN' && l.transits === null && l.index === null), 'withheld lanes print no numbers');
  ok(bad.lanes.every((l) => l.history === null), 'withheld: no history figures either');
  {
    const c = clone(issue1) as Cp & Record<string, unknown>;
    (c.lanes.find((l) => l.lane === 'hormuz') as Record<string, unknown>).index_pct_of_2023 = 3.5;
    c.source_credit = "Transits: Lloyd's List Intelligence";
    c.source_home = 'javascript:alert(1)';
    const w = buildCorridors(c, history, new Date('2026-10-13T09:00:00Z'));
    eq(w.state, 'withheld', 'index mismatch -> withheld');
    ok(w.lanes.every((l) => l.history === null), 'withheld: history not printed');
    ok(!/Lloyd/.test(w.sourceCredit) && w.sourceHome === 'https://portwatch.imf.org', 'withheld: file credit and link not trusted');
    eq(w.asOf, null, 'withheld: unchecked as_of not printed');
    const fut = clone(issue1) as Cp; for (const l of fut.lanes) l.as_of = '2026-10-20T00:00:00Z';
    eq(buildCorridors(fut, history, new Date('2026-10-13T09:00:00Z')).asOfLabel, null, 'future as_of is never printed');
    const js = clone(issue1) as Cp & Record<string, unknown>; js.source_home = 'javascript:alert(1)';
    eq(buildCorridors(js, history, new Date('2026-10-13T09:00:00Z')).sourceHome, 'https://portwatch.imf.org', 'non-https source_home ignored');
    const neg = clone(issue1) as Cp; (neg.lanes.find((l) => l.lane === 'hormuz') as Record<string, unknown>).transits_prev_week = -5;
    const n = buildCorridors(neg, history, new Date('2026-10-13T09:00:00Z'));
    eq(n.state, 'current', 'negative prev passes the card gate');
    const h = n.lanes.find((l) => l.id === 'hormuz')!;
    ok(h.prev === null && h.wow === null, 'negative previous week is not printed');
  }
  const none = buildCorridors(null, null, new Date('2026-10-08T12:30:00Z'));
  eq(none.state, 'withheld', 'no file -> withheld');
  eq(none.lanes.length, 3, 'still three lanes, all UNKNOWN');
}

// ---- 3. Index and week-on-week math ---------------------------------------------------------
eq(indexPct(302, 515.4), 58.6, 'Suez 302 / 515.4');
eq(indexPct(207, 522.1), 39.6, 'Bab al-Mandeb 207 / 522.1');
eq(indexPct(19, 669.4), 2.8, 'Hormuz 19 / 669.4');
eq(indexPct(0, 669.4), 0, 'zero transits');
eq(indexPct(5, 0), null, 'zero baseline -> null');
eq(wowDelta(302, 280), { abs: 22, pct: 8, text: '▲ +22 (+8%)' }, 'WoW up');
eq(wowDelta(19, 22), { abs: -3, pct: -14, text: '▼ −3 (−14%)' }, 'WoW down');
eq(wowDelta(10, 10), { abs: 0, pct: 0, text: 'No change' }, 'WoW flat');
eq(wowDelta(10, null), null, 'WoW without previous week');
eq(wowDelta(10, 0), { abs: 10, pct: null, text: '▲ +10' }, 'WoW from zero has no %');
for (const id of LANE_ORDER) {
  const l = buildCorridors(issue1, history, new Date('2026-10-13T09:00:00Z')).lanes.find((x) => x.id === id)!;
  eq(l.baselineWeek, BASELINE_WEEK[id], `${id}: baseline is the frozen weekly_spec value`);
  eq(indexPct(l.transits!, l.baselineWeek), l.index, `${id}: printed index follows from the counts`);
}

// ---- 4. Week / day labels ---------------------------------------------------------------------
eq(formatWeek('2026-09-28', '2026-10-04'), '28 Sep – 4 Oct 2026', 'cross-month');
eq(formatWeek('2026-09-01', '2026-09-07'), '1–7 Sep 2026', 'same month');
eq(formatWeek('2025-12-29', '2026-01-04'), '29 Dec 2025 – 4 Jan 2026', 'cross-year');
eq(formatWeek('bad', '2026-01-04'), null, 'malformed -> null');
eq(formatDay('2026-10-08T10:52:00Z'), '8 Oct 2026', 'day');
eq(formatDay('2026-10-08T23:30:00-05:00'), '9 Oct 2026', 'day is UTC');
eq(formatDay('nope'), null, 'bad day -> null');

// ---- 5. History parsing -----------------------------------------------------------------------
{
  const h = parseHistory(history);
  ok(h !== null, 'frozen Issue #1 history parses');
  eq(Object.keys(h!.lanes).sort(), ['bam_redsea', 'hormuz', 'suez'], 'three lanes');
  for (const id of LANE_ORDER) {
    const weeks = h!.lanes[id]!;
    eq(weeks.length, 12, `${id}: 12 weeks`);
    ok(weeks.every((w, i) => i === 0 || w.weekStart > weeks[i - 1].weekStart), `${id}: ascending`);
    const lw = (issue1.lanes as { lane: string; week_start: string; transits_week: number; transits_prev_week: number }[]).find((x) => x.lane === id)!;
    const newest = weeks.find((w) => w.weekStart === lw.week_start);
    ok(newest, `${id}: history contains the Issue #1 week`);
    eq(newest!.transits, lw.transits_week, `${id}: history week equals Issue #1 transits`);
  }
  eq(parseHistory(null), null, 'null -> null');
  eq(parseHistory({}), null, 'empty object -> null');
  eq(parseHistory({ schema: 'chokepoints-history/v1', lanes: [] }), null, 'no lanes -> null');
  const gap = clone(history) as { lanes: { lane: string; weeks: { transits: number | null; index_pct_of_2023: number | null; days: number }[] }[] };
  gap.lanes[0].weeks[3] = { ...gap.lanes[0].weeks[3], transits: null, index_pct_of_2023: null, days: 5 };
  const g = parseHistory(gap)!;
  eq(g.lanes[gap.lanes[0].lane as 'suez']![3].index, null, 'a gap stays a gap (null), not interpolated');
  const bad = clone(history) as { lanes: { lane: string; weeks: { index_pct_of_2023: number }[] }[] };
  bad.lanes[0].weeks[0].index_pct_of_2023 = 99;
  eq(parseHistory(bad)!.lanes[bad.lanes[0].lane as 'suez'], undefined, 'a lane whose index does not follow from its counts is dropped');
  const wrongBase = clone(history) as { lanes: { lane: string; baseline_week: number }[] };
  wrongBase.lanes[2].baseline_week = 700;
  eq(parseHistory(wrongBase)!.lanes[wrongBase.lanes[2].lane as 'hormuz'], undefined, 'a lane with a non-frozen baseline is dropped');
  const v = buildCorridors(issue1, null, new Date('2026-10-13T09:00:00Z'));
  ok(v.lanes.every((l) => l.history === null), 'no history file -> every lane history null (empty state)');
}

console.log(`corridors.check: all ${checks} checks passed`);
