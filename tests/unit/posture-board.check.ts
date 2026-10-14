/**
 * War Posture board v2 (/nai): placement rules of lib/posture-board.ts (operator rulings R2–R9, Yemen).
 *   1. EG / AE / SA never get a number, band, fill or rank — whatever the DB row says; quote glyph only with a statement.
 *   2. An uncoded statement (posture_evidence with no score) is never shown as a position, nor quoted.
 *   3. Yemen's two lines are never merged or averaged (tiles, list, v1 group).
 *   4. Colour comes from the SCORE band (0–30 / 31–60 / 61–80 / 81–100), not from the label.
 *   5. The previous-day stepper is hidden while only one v2 coding day exists; on the earliest day Previous is disabled.
 *   7. `?day=` is clamped to 1 … today; a malformed API body is refused.
 *   8. Server side: uncoded rows carry no quote, speaker or link into the payload.
 *   6. Frozen v1 rows are never filed under a conflict, never on a conflict's tiles, never counted as v2.
 * Fixture rows only (no database). Plain assert script:
 *
 *   npx --yes tsx tests/unit/posture-board.check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fromV2Row, getPostureBoard, withheldPolicyRow, type PostureBoard, type PostureView } from '../../lib/posture';
import {
  boardTabs,
  conflictView,
  isBoardPayload,
  isHistorical,
  isShownPosition,
  parseDayParam,
  noPositionOnRecord,
  rowBand,
  sortPositions,
  stepperState,
  v1Group,
  v2CodingDays,
} from '../../lib/posture-board';

let failed = 0;
let n = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    n++;
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split('\n').join('\n     ') : String(err)}`);
  }
}

const ANON = { latent: false, gap: false };
const ROOT = join(__dirname, '../..');
const base = {
  actor: 'government', actor_display_name: null, score_day: 228, as_of: '2026-10-13', stance: 'position', label: 'continued_pressure',
  expressed_score: 75, defensive: false, confidence_base: 'medium', confidence_now: 'medium', evidence_kind: 'statement',
  position_quote: 'TEST quote', speaker: 'TEST speaker', speaker_office: 'TEST office', source_url: 'https://example.test/a',
  archive_url: null, party_source: false, stated_at: '2026-10-12T00:00:00+00:00', captured_at: '2026-10-13T00:00:00+00:00',
  evidence_age_days: 1, freshness: 'current', change_reason: 'new_evidence', previous_day: null, withheld: false,
};
const v2 = (o: Record<string, unknown>) => fromV2Row({ ...base, ...o }, ANON);
/** A frozen v1 row as getPostureBoard builds it (method v1, no conflict). */
const v1 = (code: string, score: number | null, o: Partial<PostureView> = {}): PostureView => ({
  ...withheldPolicyRow(code),
  conflict_code: null,
  method: 'war-posture-v1',
  withheld: false,
  stance: score === null ? 'uncoded' : 'position',
  expressed_score: score,
  score_day: 227,
  confidence_base: 'medium',
  expressed_basis: 'TEST basis. More.',
  ...o,
});
const CONFLICTS = ['us-iran', 'red-sea-houthi', 'horn-tigray', 'sudan'].map((c, i) => ({
  conflict_code: c, name: c, short_name: c, description: `TEST ${c}`, theatre: '-', started_on: null, status: 'active', sort_order: i,
}));
const board = (rows: PostureView[], o: Partial<PostureBoard> = {}): PostureBoard => ({
  schema: 'v2', day: 229, firstDay: 221, latestDay: 229, conflicts: CONFLICTS, rows, hasLatentAccess: false, hasGapAccess: false, ...o,
});

// Production-shaped board, Day 229 (rows as of 14 Oct 2026, quotes replaced by test text).
const prod = board([
  v2({ country_code: 'IR', conflict_code: 'us-iran', defensive: true }),
  v2({ country_code: 'GB', conflict_code: 'us-iran', confidence_now: 'high', party_source: true }),
  v2({ country_code: 'US', conflict_code: 'red-sea-houthi', label: 'ambivalent', expressed_score: 50 }),
  v2({ country_code: 'AE', conflict_code: 'us-iran', withheld: true, stance: 'withheld', expressed_score: null, label: null }),
  v2({ country_code: 'SA', conflict_code: 'red-sea-houthi', withheld: true, stance: 'withheld', expressed_score: null, label: null }),
  withheldPolicyRow('EG'),
  v1('ET', 90, { v2UncodedConflicts: ['horn-tigray'] }),
  v1('ER', 25),
  v1('PK', 50),
  v1('YE', 90),
  v1('CN', null),
]);

check('1. EG / AE / SA: never a number, band, fill or rank — even when the row claims a score', () => {
  // A hostile row: withheld=false, a score and a label (the mapper and the board must both refuse it).
  const rogue = { ...v2({ country_code: 'SA', conflict_code: 'us-iran', expressed_score: 90 }), withheld: false, stance: 'position' as const, expressed_score: 90, label: 'escalation' as const };
  const b = board([...prod.rows, rogue]);
  for (const c of CONFLICTS.map((x) => x.conflict_code)) {
    const v = conflictView(b, c);
    for (const code of ['EG', 'AE', 'SA']) {
      assert.ok(!v.positions.some((r) => r.country_code === code), `${code} ranked on ${c}`);
      assert.ok(!v.outside.some((r) => r.country_code === code), `${code} outside-map on ${c}`);
      assert.equal(v.tiles[`${code}|government`].kind, 'stated', `${code} tile on ${c}`);
      assert.ok(!('score' in v.tiles[`${code}|government`]) && !('band' in v.tiles[`${code}|government`]), `${code} tile has a number/band`);
    }
  }
  assert.equal(isShownPosition(rogue), false);
  assert.equal(rowBand(rogue), null);
  assert.equal(conflictView(b, 'us-iran').count, 2, 'SA counted among positions');
  assert.ok(!v1Group(b).rows.some((r) => ['EG', 'AE', 'SA'].includes(r.country_code)), 'no v1 row for EG/AE/SA');
  assert.ok(sortPositions(conflictView(b, 'us-iran').positions, 'score').every((r) => r.country_code !== 'SA'));
  // Quote glyph only with a real statement on that front (artboard drew it for EG, which has none).
  const ui = conflictView(prod, 'us-iran');
  assert.deepEqual([ui.tiles['AE|government'], ui.tiles['SA|government'], ui.tiles['EG|government']], [
    { kind: 'stated', quote: true }, { kind: 'stated', quote: false }, { kind: 'stated', quote: false },
  ]);
  assert.deepEqual(ui.stated.map((s) => [s.code, s.evidence.length]), [['EG', 0], ['SA', 0], ['AE', 1]]);
});

check('2. uncoded evidence (no posture_scores row) is never shown as a position, nor quoted', () => {
  const adviser = v2({ country_code: 'ET', conflict_code: 'horn-tigray', stance: 'uncoded', expressed_score: null, label: null, score_day: null, position_quote: 'TEST adviser quote' });
  for (const b of [board([adviser]), prod]) {
    const v = conflictView(b, 'horn-tigray');
    assert.equal(v.positions.length, 0);
    assert.equal(v.count, 0);
    assert.equal(v.tiles['ET|government'].kind, 'none');
    assert.deepEqual(v.awaiting, ['ET']);
    assert.ok(!JSON.stringify([v.positions, v.others, v.stated, v.outside]).includes('adviser'), 'adviser quote leaked');
  }
  assert.equal(isShownPosition(adviser), false);
  // An uncoded row that (wrongly) carries a score and a label is still never a position.
  const scored = v2({ country_code: 'ET', conflict_code: 'horn-tigray', stance: 'uncoded', expressed_score: 90, label: 'escalation', position_quote: 'TEST scored adviser quote' });
  const sv = conflictView(board([scored]), 'horn-tigray');
  assert.equal(isShownPosition(scored), false);
  assert.equal(rowBand(scored), null);
  assert.deepEqual([sv.count, sv.positions.length, sv.tiles['ET|government'].kind], [0, 0, 'none']);
  assert.ok(!JSON.stringify([sv.positions, sv.others, sv.outside, sv.tiles]).includes('scored adviser'));
  // A Yemen line that is only uncoded keeps the honest state, no position.
  const ye = conflictView(board([v2({ country_code: 'YE', conflict_code: 'red-sea-houthi', actor: 'de_facto_authority', stance: 'uncoded', expressed_score: null, label: null })]), 'red-sea-houthi');
  assert.equal(ye.count, 0);
  assert.ok(ye.yemen?.every((l) => !l.row || !isShownPosition(l.row)));
  // A position without an openable source is not shown either ("every score rests on a quote you can open").
  assert.equal(isShownPosition({ ...v2({ country_code: 'IR', conflict_code: 'us-iran' }), evidence: null }), false);
});

check('3. Yemen: two lines, never merged or averaged', () => {
  const gov = v2({ country_code: 'YE', conflict_code: 'red-sea-houthi', actor: 'government', actor_display_name: 'TEST gov', expressed_score: 60, label: 'ambivalent' });
  const dfa = v2({ country_code: 'YE', conflict_code: 'red-sea-houthi', actor: 'de_facto_authority', actor_display_name: 'TEST dfa', expressed_score: 95, label: 'escalation' });
  const v = conflictView(board([gov, dfa]), 'red-sea-houthi');
  assert.deepEqual(v.yemen?.map((l) => [l.actor, l.name, l.row?.expressed_score]), [['government', 'TEST gov', 60], ['de_facto_authority', 'TEST dfa', 95]]);
  assert.deepEqual([v.tiles['YE|government'], v.tiles['YE|de_facto_authority']], [{ kind: 'position', score: 60, band: 2 }, { kind: 'position', score: 95, band: 4 }]);
  assert.equal(v.positions.filter((r) => r.country_code === 'YE').length, 0, 'Yemen lines belong to the Yemen panel only');
  assert.equal(v.count, 2, 'two positions, never one');
  assert.ok(!JSON.stringify(v).includes('77.5') && !JSON.stringify(v).includes('"score":78') && !JSON.stringify(v).includes('"score":77'));
  // v1 group: the frozen v1 number sits on the government line only; the de facto line has none.
  assert.deepEqual(v1Group(prod).yemen?.map((l) => [l.actor, l.row?.expressed_score ?? null]), [['government', 90], ['de_facto_authority', null]]);
});

check('4. colour comes from the score band, not from the label', () => {
  const at = (score: number, label: string) => rowBand(v2({ country_code: 'IR', conflict_code: 'us-iran', expressed_score: score, label }));
  assert.deepEqual([at(30, 'conditional_deescalation'), at(31, 'conditional_deescalation'), at(35, 'conditional_deescalation'), at(60, 'ambivalent'), at(61, 'ambivalent'), at(80, 'continued_pressure'), at(85, 'continued_pressure'), at(88, 'escalation')], [1, 2, 2, 2, 3, 3, 4, 4]);
  const v = conflictView(board([v2({ country_code: 'IR', conflict_code: 'us-iran', expressed_score: 85, label: 'continued_pressure' })]), 'us-iran');
  assert.deepEqual(v.tiles['IR|government'], { kind: 'position', score: 85, band: 4 });
  assert.equal(rowBand(v1('PK', 50)), 2);
});

check('5. previous-day stepper hidden while only one v2 day exists; shown (Previous disabled) on the earliest', () => {
  // Server day list, one v2 day: hidden.
  assert.deepEqual(stepperState({ ...prod, v2Days: [228] }), { show: false, prev: null, next: null });
  assert.deepEqual(v2CodingDays({ ...prod, v2Days: [228] }), [228]);
  // A real Day 228 board (rows as of 228, all coded on 228, no previous_day) while the data has 228 and 229:
  // the viewed rows prove one day only; the server's list keeps the stepper, Previous disabled, Next to 229.
  const day228 = board(
    [
      v2({ country_code: 'IR', conflict_code: 'us-iran', score_day: 228, previous_day: null }),
      v2({ country_code: 'GB', conflict_code: 'us-iran', score_day: 228, previous_day: null }),
      v2({ country_code: 'US', conflict_code: 'red-sea-houthi', score_day: 228, previous_day: null, expressed_score: 50, label: 'ambivalent' }),
    ],
    { day: 228, v2Days: [228, 229] },
  );
  assert.deepEqual(stepperState(day228, 229), { show: true, prev: null, next: 229 });
  // Day 229 (latest): Previous to 228, Next disabled.
  const day229 = board([v2({ country_code: 'IR', conflict_code: 'us-iran', score_day: 229, previous_day: 228, expressed_score: 88 })], { v2Days: [228, 229] });
  assert.deepEqual(stepperState(day229, 229), { show: true, prev: 228, next: null });
  // Without a server list, the viewed rows decide; withheld and uncoded rows never count as a coding day.
  assert.equal(stepperState(prod).show, false);
  const noise = board([...prod.rows, v2({ country_code: 'ET', conflict_code: 'horn-tigray', stance: 'uncoded', score_day: 225, expressed_score: null })]);
  assert.equal(stepperState(noise).show, false);
  assert.equal(stepperState(board(prod.rows, { schema: 'v1', v2Days: [228, 229] })).show, false);
});

check('6. v1 rows: own group, never under a conflict, never on its tiles, never counted as v2', () => {
  assert.equal(boardTabs(prod).at(-1)?.code, 'v1-frozen');
  assert.deepEqual(boardTabs(prod).slice(0, 4).map((t) => t.code), CONFLICTS.map((c) => c.conflict_code));
  for (const c of CONFLICTS.map((x) => x.conflict_code)) {
    const v = conflictView(prod, c);
    assert.ok(v.positions.every((r) => r.method === 'war-posture-v2'));
    for (const code of ['ET', 'ER', 'PK']) assert.equal(v.tiles[`${code}|government`].kind, 'none', `${code} drawn on ${c}`);
    assert.equal(v.tiles['YE|government'].kind, 'none');
  }
  assert.deepEqual(v1Group(prod).rows.map((r) => r.country_code), ['ER', 'ET', 'PK']);
  // v1 rows without a number are "no position on record", as are countries with no row at all.
  assert.deepEqual(noPositionOnRecord(prod), ['CN', 'DJ', 'FR', 'DE', 'IN', 'IQ', 'IL', 'JO', 'KW', 'LB', 'QA', 'RU', 'SO', 'SD', 'TR']);
});

check('7. ?day= accepts 1 … today only; the API body is shape-checked before it replaces the board', () => {
  assert.deepEqual(['228', '1', '229', '230', '9999', '0', '-1', 'abc', '228.5', '0228', '', null].map((d) => parseDayParam(d, 229)), [228, 1, 229, null, null, null, null, null, null, null, null, null]);
  assert.equal(isBoardPayload(prod), true);
  assert.equal(isBoardPayload({ ...prod, labels: { 'https://x.test': { name: 'X', known: true, party: false } } }), true);
  for (const bad of [null, [], 'x', { ...prod, rows: null }, { ...prod, schema: 'v3' }, { ...prod, rows: [{ country_code: 'IR' }] }, { ...prod, conflicts: [{}] }, { ...prod, rows: [{ ...prod.rows[0], evidence: { quote: 1 } }] }]) {
    assert.equal(isBoardPayload(bad), false, JSON.stringify(bad)?.slice(0, 60));
  }
});

check('9. 30 coded days with a gap: Previous walks day by day from the latest day to the first, across the gap', () => {
  const days = Array.from({ length: 30 }, (_, i) => 200 + i).filter((d) => d !== 210);
  const rowsFor = (day: number) => [v2({ country_code: 'IR', conflict_code: 'us-iran', score_day: day === 210 ? 209 : day, previous_day: day - 1, expressed_score: 60 + (day % 20) })];
  let b = board(rowsFor(229), { day: 229, v2Days: days });
  const visited: number[] = [229];
  for (let guard = 0; guard < 60; guard++) {
    const st = stepperState(b, 229);
    assert.equal(st.show, true, `stepper hidden on Day ${b.day}`);
    if (st.prev == null) break;
    visited.push(st.prev);
    b = board(rowsFor(st.prev), { day: st.prev, v2Days: days });
  }
  assert.equal(visited.at(-1), 200, `stopped at Day ${visited.at(-1)}`);
  assert.equal(visited.length, 30);
  assert.ok(visited.includes(210), 'skipped the gap day');
  assert.deepEqual(stepperState(board(rowsFor(200), { day: 200, v2Days: days }), 229), { show: true, prev: null, next: 201 });
});

check('10. "earlier day" is measured against the server latest day, never board.latestDay', () => {
  // An API board fetched after midnight can carry a later latestDay than the page's own day.
  assert.equal(isHistorical({ day: 229 }, 229), false);
  assert.equal(isHistorical({ ...board([], { day: 229, latestDay: 230 }) }, 229), false);
  assert.equal(isHistorical({ ...board([], { day: 228, latestDay: 228 }) }, 229), true);
  assert.equal(isHistorical({ day: null }, 229), false);
});

check('11. only /nai and /api/viewer/posture ask for the day list (withDays); every other caller asks nothing', () => {
  const callers: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?)$/.test(name) && /withDays:\s*true/.test(readFileSync(p, 'utf8'))) callers.push(relative(ROOT, p));
    }
  };
  for (const d of ['app', 'components', 'lib']) walk(join(ROOT, d));
  assert.deepEqual(callers.sort(), ['app/api/viewer/posture/route.ts', 'app/nai/page.tsx']);
});

type Rpc = { fn: string; args: Record<string, unknown> };
/** getPostureBoard against a counting fake: fixture viewer_posture_v2, posture_v2_days as given (or failing). */
async function boardFromRpc(rows: Record<string, unknown>[], opts: { day?: number | null; withDays?: boolean; days?: unknown; daysError?: { code: string; message: string }; daysThrow?: boolean }) {
  const calls: Rpc[] = [];
  const thenable = (data: unknown) => {
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'order', 'eq', 'lte', 'lt', 'limit', 'in']) b[m] = () => b;
    b.then = (res: (x: unknown) => unknown) => Promise.resolve({ data, error: null }).then(res);
    return b;
  };
  const client = {
    from: (t: string) => thenable(t === 'conflicts' ? CONFLICTS : []),
    rpc: async (fn: string, a: Record<string, unknown> = {}) => {
      calls.push({ fn, args: a });
      if (fn === 'viewer_posture_v2') return { data: rows, error: null };
      if (fn === 'posture_v2_days' && opts.daysThrow) throw new Error('network down');
      if (fn === 'posture_v2_days') return opts.daysError ? { data: null, error: opts.daysError } : { data: opts.days ?? [], error: null };
      return { data: [], error: null };
    },
  } as unknown as Parameters<typeof getPostureBoard>[0];
  const b = await getPostureBoard(client, { day: opts.day ?? null, access: ANON, withDays: opts.withDays });
  return { b, calls, count: (fn: string) => calls.filter((c) => c.fn === fn).length };
}
const raw = (o: Record<string, unknown>) => ({ ...base, ...o });
const LIVE = [
  raw({ country_code: 'IR', conflict_code: 'us-iran', score_day: 229, previous_day: 228 }),
  raw({ country_code: 'GB', conflict_code: 'us-iran', score_day: 228 }),
  raw({ country_code: 'ET', conflict_code: 'horn-tigray', stance: 'uncoded', expressed_score: 90, label: 'escalation', score_day: null, position_quote: 'TEST uncoded quote', speaker: 'TEST adviser', source_url: 'https://uncoded.test/a', archive_url: 'https://archive.test/a' }),
];

async function acheck(label: string, fn: () => Promise<void>) {
  try {
    await fn();
    n++;
    console.log(`ok   ${label}`);
  } catch (err) {
    failed++;
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split('\n').slice(0, 3).join('\n     ') : String(err)}`);
  }
}

(async () => {
  await acheck('8. server: uncoded rows reach neither the RSC payload nor the API JSON with their quote', async () => {
    const { b } = await boardFromRpc(LIVE, {});
    const et = b.rows.find((r) => r.country_code === 'ET' && r.method === 'war-posture-v2');
    assert.ok(et && et.stance === 'uncoded', 'uncoded line kept');
    assert.equal(et?.evidence, null);
    const json = JSON.stringify(b);
    for (const leak of ['TEST uncoded quote', 'TEST adviser', 'uncoded.test', 'archive.test']) assert.ok(!json.includes(leak), `leaked ${leak}`);
  });
  await acheck('12. day list: zero extra calls by default; exactly one posture_v2_days call with withDays', async () => {
    const plain = await boardFromRpc(LIVE, { days: [228, 229] });
    assert.equal(plain.count('posture_v2_days'), 0, 'home / warroom would pay for the day list');
    assert.equal(plain.count('viewer_posture_v2'), 1, 'extra viewer_posture_v2 calls (probe loop)');
    assert.equal(plain.b.v2Days, undefined);
    for (const day of [null, 228]) {
      const asked = await boardFromRpc(LIVE, { day, withDays: true, days: [200, 201, 228, 229] });
      assert.equal(asked.count('posture_v2_days'), 1);
      assert.equal(asked.count('viewer_posture_v2'), 1);
      assert.deepEqual(asked.b.v2Days, [200, 201, 228, 229]);
    }
    const objRows = await boardFromRpc(LIVE, { withDays: true, days: [{ posture_v2_days: 229 }, { posture_v2_days: 228 }] });
    assert.deepEqual(objRows.b.v2Days, [228, 229]);
  });
  await acheck('13. posture_v2_days missing or failing (deploy before the migration): board intact, stepper from the rows', async () => {
    for (const err of [{ code: 'PGRST202', message: 'Could not find the function public.posture_v2_days' }, { code: '42883', message: 'function does not exist' }, { code: '57014', message: 'timeout' }]) {
      const { b } = await boardFromRpc(LIVE, { withDays: true, daysError: err });
      assert.equal(b.schema, 'v2', err.code);
      assert.equal(b.v2Days, undefined, err.code);
      assert.ok(b.rows.some((r) => r.country_code === 'IR'), err.code);
      assert.deepEqual(v2CodingDays(b), [228, 229], err.code);
      assert.deepEqual(stepperState(b, 229), { show: true, prev: 228, next: null }, err.code);
    }
    const thrown = await boardFromRpc(LIVE, { withDays: true, daysThrow: true });
    assert.equal(thrown.b.v2Days, undefined, 'a thrown RPC call must not break the board');
    assert.deepEqual(stepperState(thrown.b, 229), { show: true, prev: 228, next: null });
    const one = await boardFromRpc([raw({ country_code: 'GB', conflict_code: 'us-iran', score_day: 228 })], { withDays: true, daysError: { code: 'PGRST202', message: 'x' } });
    assert.equal(stepperState(one.b, 229).show, false, 'one day on the rows: stepper hidden');
  });
  console.log(failed ? `\n${failed} of ${n + failed} checks FAILED` : `\nall ${n} checks passed`);
  if (failed) process.exit(1);
})();
