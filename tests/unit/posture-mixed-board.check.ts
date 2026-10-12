/**
 * /nai board during the War Posture v2 roll-out (lib/posture.ts getPostureBoard): v2 rows arrive a few
 * countries at a time, War Posture v1 (nai_scores_v2) is frozen. The board must show every v2 row PLUS,
 * for each country with NO v2 row on that day, its latest v1 row on or before that day, marked as v1 /
 * frozen with its own day. EG / AE / SA never get a grade from either path; moves come from v2 only.
 * Fixture PostgREST responses only (no database). Plain assert script:
 *
 *   npx --yes tsx tests/unit/posture-mixed-board.check.ts
 */
import assert from 'node:assert/strict';
import * as posture from '../../lib/posture';
import type { PostureBoard, PostureView } from '../../lib/posture';
import type { NaiScoreV2 } from '../../types/supabase';

const results: { label: string; err: unknown }[] = [];
async function check(label: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ label, err: null });
    console.log(`ok   ${label}`);
  } catch (err) {
    results.push({ label, err });
    console.log(`FAIL ${label}\n     ${err instanceof Error ? err.message.split('\n').join('\n     ') : String(err)}`);
  }
}

const ANON = { latent: false, gap: false };
const WITHHELD = ['EG', 'AE', 'SA'];

// --- fixtures ------------------------------------------------------------------------------------------
const v2Base = {
  conflict_code: 'us-iran', score_id: 's', score_day: 227, as_of: '2026-10-12', stance: 'position',
  label: 'continued_pressure', expressed_score: 75, defensive: false, confidence_base: 'high', confidence_now: 'high',
  decay_factor: '1', half_life_days: 30, evidence_id: 'e', evidence_kind: 'statement', act_type: null,
  position_quote: 'TEST quote', speaker: 'TEST', speaker_office: 'FM', source_url: 'https://example.test/q',
  archive_url: null, page_sha256: null, party_source: false, stated_at: '2026-10-12T07:00:00+00:00',
  captured_at: '2026-10-12T09:00:00+00:00', evidence_age_days: 0, freshness: 'current', change_reason: 'new_evidence',
  note: null, previous_day: 221, previous_stance: 'position', previous_label: 'ambivalent', previous_score: 55,
  withheld: false, latent_low: null, latent_high: null, latent_basis: null, gap: null, category: null,
  latent_access: false, gap_access: false, method_version: 'war-posture-v2',
};
// Day 227: IR coded in v2 (us-iran), YE coded in v2 (red-sea), EG present as a v2 withheld evidence-only row.
const v2Rows = [
  { ...v2Base, country_code: 'IR' },
  { ...v2Base, country_code: 'YE', conflict_code: 'red-sea-houthi', change_reason: 'reverification', previous_score: 75, previous_label: 'continued_pressure' },
  { ...v2Base, country_code: 'EG', withheld: true, stance: 'withheld', label: null, expressed_score: null, score_day: null, change_reason: null },
];

const E = { claim: 'e', name: 'E src', url: 'https://e.example', published_at: '2026-10-08', party_source: false, feeds: 'E' as const };
const v1 = (cc: string, day: number, e: number | null): NaiScoreV2 => ({
  id: `${cc}-${day}`, country_code: cc, conflict_day: day, as_of: posture.dayToIsoDate(day), expressed_score: e,
  expressed_basis: `TEST basis ${cc} ${day}`, latent_low: null, latent_high: null, latent_basis: null, confidence: 'medium',
  sources: [E], gap: null, gap_size: null, category: 'UNSCORABLE', method_version: 'war-posture-v1',
  created_at: `${posture.dayToIsoDate(day)}T00:00:00Z`, latent_access: false, gap_access: false, hidden_latent_source_count: 0,
});
// Frozen v1 history (viewer_nai_v2 order: conflict_day DESC, country_code). Includes:
//   IR (has a v2 row -> its v1 row must NOT appear), US (latest 224), TR (only on 222), QA (225 and 228:
//   228 is after the viewed day 227 -> 225 wins), and EG / AE / SA — AE and SA as if the database had
//   leaked a grade (pre-policy database), which the TS layer must still never show.
const v1History: NaiScoreV2[] = [
  v1('QA', 228, 30),
  v1('QA', 225, 40),
  v1('AE', 224, 45),
  v1('EG', 224, null),
  v1('IR', 224, 60),
  v1('SA', 224, 80),
  v1('US', 224, 85),
  v1('US', 223, 70),
  v1('TR', 222, 50),
];

type Res = { data: unknown; error: { code: string; message: string } | null };
type Calls = { rpc: { fn: string; args: Record<string, unknown> }[]; tables: { table: string; ops: string[] }[] };
const MISSING = (fn: string): Res => ({ data: null, error: { code: 'PGRST202', message: `Could not find the function public.${fn}` } });

/** PostgREST fake that honours the arguments the posture/nai-v2 readers actually send. */
function fakeClient(opts: { v2: Res; naiRpc: boolean; history: NaiScoreV2[] }) {
  const calls: Calls = { rpc: [], tables: [] };
  const builder = (table: string) => {
    const ops: string[] = [];
    calls.tables.push({ table, ops });
    const filters: { op: string; col: string; val: unknown }[] = [];
    let asc: boolean | null = null;
    let lim: number | null = null;
    const run = (): Res => {
      if (table === 'conflicts') return { data: [...posture.CONFLICTS_FALLBACK], error: null };
      if (table !== 'nai_scores_v2') return { data: null, error: { code: 'PGRST205', message: 'no table' } };
      let rows = opts.history.slice();
      for (const f of filters) {
        rows = rows.filter((r) => {
          const v = (r as unknown as Record<string, unknown>)[f.col] as number | string;
          if (f.op === 'eq') return v === f.val;
          if (f.op === 'lt') return Number(v) < Number(f.val);
          if (f.op === 'lte') return Number(v) <= Number(f.val);
          return true;
        });
      }
      if (asc !== null) rows.sort((a, b) => (asc ? a.conflict_day - b.conflict_day : b.conflict_day - a.conflict_day));
      if (lim !== null) rows = rows.slice(0, lim);
      return { data: rows, error: null };
    };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lt', 'lte', 'gt', 'order', 'limit', 'in']) {
      b[m] = (...args: unknown[]) => {
        ops.push(`${m}:${JSON.stringify(args)}`);
        if (m === 'eq' || m === 'lt' || m === 'lte') filters.push({ op: m, col: String(args[0]), val: args[1] });
        if (m === 'order') asc = (args[1] as { ascending?: boolean } | undefined)?.ascending !== false;
        if (m === 'limit') lim = Number(args[0]);
        return b;
      };
    }
    b.maybeSingle = async () => {
      const r = run();
      return { data: Array.isArray(r.data) ? (r.data[0] ?? null) : r.data, error: r.error };
    };
    b.then = (resolve: (r: Res) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject);
    return b;
  };
  const client = {
    from: (t: string) => builder(t),
    rpc: async (fn: string, args: Record<string, unknown> = {}) => {
      calls.rpc.push({ fn, args });
      if (fn === 'viewer_posture_v2') return opts.v2;
      if (fn === 'viewer_nai_v2') {
        if (!opts.naiRpc) return MISSING(fn);
        let rows = opts.history.slice();
        if (args.p_day != null) rows = rows.filter((r) => r.conflict_day === args.p_day);
        if (args.p_country != null) rows = rows.filter((r) => r.country_code === args.p_country);
        rows.sort((a, b) => b.conflict_day - a.conflict_day || a.country_code.localeCompare(b.country_code));
        return { data: rows.slice(0, Number(args.p_limit ?? 1000)), error: null };
      }
      return MISSING(fn);
    },
  } as unknown as Parameters<typeof posture.getPostureBoard>[0];
  return { client, calls };
}

const key = (r: PostureView) => `${r.country_code}:${r.method === 'war-posture-v2' ? 'v2' : 'v1'}:${r.score_day ?? '-'}`;
const noGrade = (r: PostureView) =>
  r.expressed_score === null && r.label === null && r.category === null && r.latent_low === null && r.gap === null && r.expressed_basis === null;

async function main() {
  const { client, calls } = fakeClient({ v2: { data: v2Rows, error: null }, naiRpc: true, history: v1History });
  const board: PostureBoard = await posture.getPostureBoard(client, { day: 227, access: ANON });

  await check('mixed board: schema v2, day 227', () => {
    assert.equal(board.schema, 'v2');
    assert.equal(board.day, 227);
  });

  await check('mixed board: every v2 row is kept', () => {
    const v2 = board.rows.filter((r) => r.method === 'war-posture-v2').map((r) => `${r.country_code}|${r.conflict_code}`);
    // + AE / SA: no v2 row at all -> policy-only withheld rows (see check (c) below)
    assert.deepEqual(v2.sort(), ['AE|us-iran', 'EG|us-iran', 'IR|us-iran', 'SA|us-iran', 'YE|red-sea-houthi']);
  });

  await check('mixed board: countries with no v2 row get their latest v1 row on or before the day (own day kept)', () => {
    const v1Rows = board.rows.filter((r) => r.method === 'war-posture-v1').map(key).sort();
    assert.deepEqual(v1Rows, ['QA:v1:225', 'TR:v1:222', 'US:v1:224']);
    const us = board.rows.find((r) => r.country_code === 'US')!;
    assert.equal(us.conflict_code, null);
    assert.equal(us.expressed_score, 85);
    assert.equal(us.label, 'continued_pressure');
    assert.equal(us.change_reason, null);
  });

  await check('mixed board: never a v1 row for a country that has any v2 row (IR, YE, EG)', () => {
    for (const cc of ['IR', 'YE', 'EG']) {
      const methods = new Set(board.rows.filter((r) => r.country_code === cc).map((r) => r.method));
      assert.deepEqual([...methods], ['war-posture-v2'], cc);
    }
  });

  await check('mixed board: EG / AE / SA show no grade from either path; their v1 rows are never shown', () => {
    for (const r of board.rows.filter((x) => WITHHELD.includes(x.country_code))) {
      assert.equal(r.withheld, true, r.country_code);
      assert.equal(r.stance, 'withheld', r.country_code);
      assert.ok(noGrade(r), `${r.country_code} carries a grade`);
      assert.notEqual(r.method, 'war-posture-v1', `${r.country_code} v1 row on a v2 board`);
    }
    // EG has a v2 withheld row: exactly that row, nothing else.
    assert.deepEqual(board.rows.filter((r) => r.country_code === 'EG').map((r) => `${r.method}|${r.conflict_code}`), ['war-posture-v2|us-iran']);
  });

  await check('mixed board: v1 fallback read is the tier-gated RPC (never the raw table)', () => {
    assert.ok(calls.rpc.some((c) => c.fn === 'viewer_nai_v2'), 'viewer_nai_v2 not called');
    assert.equal(calls.tables.some((t) => t.table === 'nai_scores_v2' && t.ops.some((o) => o.startsWith('select:["*"'))), false);
  });

  await check('moves: only v2 rows (new evidence), never the v1 fallback rows', () => {
    const moves = posture.postureMoves(board);
    assert.deepEqual(moves.map((m) => m.row.country_code), ['IR']);
    // Defence in depth: even a v1-method row that looks exactly like a move is ignored.
    const fake: PostureView = {
      ...posture.fromV2Row({ ...v2Base, country_code: 'KW', previous_score: 20, previous_label: 'conditional_deescalation' }, ANON),
      method: 'war-posture-v1',
      conflict_code: null,
    };
    const m2 = posture.postureMoves({ ...board, rows: [...board.rows, fake] });
    assert.equal(m2.some((m) => m.row.method === 'war-posture-v1'), false, 'a v1 row was reported as a move');
  });

  await check('groups: v1 fallback rows sit in their own "v1 (frozen, not yet re-coded)" group, after the conflicts', () => {
    const groups = posture.boardConflicts(board);
    const codes = groups.map((c) => c.conflict_code);
    assert.deepEqual(codes, ['us-iran', 'red-sea-houthi', posture.V1_FROZEN_CONFLICT.conflict_code]);
    assert.match(posture.V1_FROZEN_CONFLICT.short_name, /v1/i);
    assert.match(posture.V1_FROZEN_CONFLICT.short_name, /frozen/i);
    const us = board.rows.find((r) => r.country_code === 'US')!;
    const ir = board.rows.find((r) => r.country_code === 'IR')!;
    assert.equal(posture.postureGroupCode(board, us), posture.V1_FROZEN_CONFLICT.conflict_code);
    assert.equal(posture.postureGroupCode(board, ir), 'us-iran');
    assert.equal(posture.isV1Fallback(board, us), true);
    assert.equal(posture.isV1Fallback(board, ir), false);
  });

  await check('frozen marker: "War Posture v1 — frozen, Day N" with the row\'s own day', () => {
    const tr = board.rows.find((r) => r.country_code === 'TR')!;
    assert.equal(posture.v1FrozenText(tr), 'War Posture v1 — frozen, Day 222');
  });

  await check('all-v2 day: no v1 row is added when every v1 country has a v2 row', async () => {
    const all = fakeClient({
      v2: { data: [{ ...v2Base, country_code: 'US' }, { ...v2Base, country_code: 'TR' }], error: null },
      naiRpc: true,
      history: [v1('US', 224, 85), v1('TR', 222, 50)],
    });
    const b = await posture.getPostureBoard(all.client, { day: 227, access: ANON });
    assert.deepEqual(b.rows.filter((r) => !r.withheld).map(key).sort(), ['TR:v2:227', 'US:v2:227']);
    // EG / AE / SA have no v2 row here: policy-only withheld rows, no grade, never v1
    assert.deepEqual(b.rows.filter((r) => r.withheld).map(key).sort(), ['AE:v2:-', 'EG:v2:-', 'SA:v2:-']);
    assert.ok(b.rows.filter((r) => r.withheld).every(noGrade));
    assert.deepEqual(posture.boardConflicts(b).map((c) => c.conflict_code), ['us-iran']);
  });

  await check('browser path (/warroom v1Loader): mixed board still fills from the RPC, v1Loader only if the RPC is missing', async () => {
    let loaderCalls = 0;
    const w = fakeClient({ v2: { data: v2Rows, error: null }, naiRpc: true, history: v1History });
    const b = await posture.getPostureBoard(w.client, {
      day: 227,
      access: { latent: true, gap: true },
      v1Loader: async () => {
        loaderCalls++;
        return [];
      },
    });
    assert.deepEqual(b.rows.filter((r) => r.method === 'war-posture-v1').map(key).sort(), ['QA:v1:225', 'TR:v1:222', 'US:v1:224']);
    assert.equal(loaderCalls, 0);
    assert.equal(w.calls.tables.some((t) => t.table === 'nai_scores_v2' && t.ops.some((o) => o.startsWith('select:["*"'))), false);
  });

  await check('no v2 rows yet: unchanged v1 board (latest v1 day, EG withheld, not excluded)', async () => {
    const pre = fakeClient({ v2: { data: [], error: null }, naiRpc: true, history: v1History.filter((r) => r.conflict_day <= 224) });
    const b = await posture.getPostureBoard(pre.client, { access: ANON });
    assert.equal(b.schema, 'v1');
    assert.equal(b.day, 224);
    assert.ok(b.rows.every((r) => r.method === 'war-posture-v1' && r.score_day === 224));
    const eg = b.rows.find((r) => r.country_code === 'EG')!;
    assert.equal(eg.stance, 'withheld');
    for (const r of b.rows.filter((x) => WITHHELD.includes(x.country_code))) assert.ok(noGrade(r), `${r.country_code} carries a grade`);
  });

  // --- Coordinator rule (2026-10-12): only a CODED v2 row (anything but 'uncoded') counts as "has v2" ---------
  // Day 228 fixture: KW coded (position, us-iran) + uncoded (red-sea); US only uncoded (us-iran, red-sea);
  // OM only uncoded and no v1 history; EG has a v2 withheld row; AE / SA have no v2 row at all.
  const unc = (cc: string, conflict: string) => ({
    ...v2Base, country_code: cc, conflict_code: conflict, score_id: null, score_day: null, as_of: null, stance: 'uncoded', label: null,
    expressed_score: null, confidence_base: null, confidence_now: null, decay_factor: null, change_reason: null, previous_day: null,
    previous_stance: null, previous_label: null, previous_score: null,
  });
  const d228 = fakeClient({
    v2: {
      data: [
        { ...v2Base, country_code: 'KW' },
        unc('KW', 'red-sea-houthi'),
        unc('US', 'us-iran'),
        unc('US', 'red-sea-houthi'),
        unc('OM', 'us-iran'),
        { ...v2Base, country_code: 'EG', withheld: true, stance: 'withheld', label: null, expressed_score: null, score_day: null, change_reason: null },
      ],
      error: null,
    },
    naiRpc: true,
    history: [v1('KW', 224, 35), v1('US', 224, 85), v1('EG', 224, null), v1('AE', 224, 45), v1('SA', 224, 80)],
  });
  const b228: PostureBoard = await posture.getPostureBoard(d228.client, { day: 228, access: ANON });

  await check('(a) uncoded-only country falls back to its latest v1 row (frozen, own day) with the "captured, not yet coded" note', () => {
    const us = b228.rows.filter((r) => r.country_code === 'US');
    assert.deepEqual(us.map(key), ['US:v1:224'], 'US should be exactly its v1 row');
    assert.equal(us[0].expressed_score, 85);
    assert.equal(posture.isV1Fallback(b228, us[0]), true);
    assert.equal(posture.v1FrozenText(us[0]), 'War Posture v1 — frozen, Day 224');
    assert.deepEqual([...us[0].v2UncodedConflicts].sort(), ['red-sea-houthi', 'us-iran']);
    assert.equal(posture.POSTURE_UNCODED_TEXT, 'Statement captured, not yet coded');
    const note = posture.v2UncodedNote(us[0]);
    assert.ok(note && note.includes(posture.POSTURE_UNCODED_TEXT), `note: ${note}`);
    assert.equal(posture.postureMoves(b228).some((m) => m.row.country_code === 'US'), false);
  });

  await check('(a2) uncoded-only country with NO v1 history keeps its uncoded v2 rows (never dropped)', () => {
    assert.deepEqual(b228.rows.filter((r) => r.country_code === 'OM').map((r) => `${r.method}|${r.stance}`), ['war-posture-v2|uncoded']);
  });

  await check('(b) a country with any coded v2 row gets v2 only (its uncoded rows too), never v1', () => {
    const kw = b228.rows.filter((r) => r.country_code === 'KW');
    assert.deepEqual(kw.map((r) => `${r.method}|${r.conflict_code}|${r.stance}`).sort(), [
      'war-posture-v2|red-sea-houthi|uncoded',
      'war-posture-v2|us-iran|position',
    ]);
    for (const r of kw) assert.deepEqual(r.v2UncodedConflicts, []);
    assert.equal(posture.v2UncodedNote(kw[0]), null);
  });

  await check('(c) EG / AE / SA with no v2 row: withheld ("Stated positions only") row, never v1, never "nothing on record"', () => {
    for (const cc of ['AE', 'SA']) {
      const rows = b228.rows.filter((r) => r.country_code === cc);
      assert.equal(rows.length, 1, `${cc}: expected one withheld row, got ${rows.length}`);
      const r = rows[0];
      assert.equal(r.stance, 'withheld', cc);
      assert.equal(r.withheld, true, cc);
      assert.equal(r.method, 'war-posture-v2', cc);
      assert.ok(noGrade(r), `${cc} carries a grade`);
      assert.equal(r.evidence, null, cc);
      assert.equal(r.score_day, null, cc);
      // Filed under the panel-wide tab (us-iran), where "nothing on record" is computed -> listed as withheld there.
      assert.equal(posture.postureGroupCode(b228, r), 'us-iran', cc);
    }
    // EG keeps its own v2 withheld row (no extra placeholder, no v1 row).
    assert.deepEqual(b228.rows.filter((r) => r.country_code === 'EG').map((r) => `${r.method}|${r.conflict_code}`), ['war-posture-v2|us-iran']);
    assert.equal(b228.rows.some((r) => WITHHELD.includes(r.country_code) && r.method === 'war-posture-v1'), false);
  });

  const failed = results.filter((r) => r.err);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('FAIL (crash)', e);
  process.exit(1);
});
