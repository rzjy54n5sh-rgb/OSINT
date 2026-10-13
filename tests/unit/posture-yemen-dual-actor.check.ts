/**
 * Yemen in War Posture v2: two authorities, two separate lines, never merged (operator decision,
 * 2026-10-13). lib/posture.ts must:
 *   - carry the actor of every viewer_posture_v2 row (government | de_facto_authority, default government);
 *   - show YE as "Yemen — Government (PLC)" and "Yemen — Ansar Allah (Houthi), de facto authority",
 *     each with its own score, never an average, each with its own move;
 *   - apply the coded-v2-else-frozen-v1 rule per (country, actor) line, attaching the frozen v1 YE number
 *     to ONE line only (V1_FALLBACK_ACTOR.YE — the line the v1 rows were scored for).
 * Fixture PostgREST responses only (no database). Plain assert script:
 *
 *   npx --yes tsx tests/unit/posture-yemen-dual-actor.check.ts
 */
import assert from 'node:assert/strict';
import * as posture from '../../lib/posture';
import type { PostureView } from '../../lib/posture';
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
// Loosely typed access to the new API so this file runs (and fails cleanly) on a lib without it.
const P = posture as unknown as Record<string, unknown> & typeof posture;
const fn = <T extends (...a: never[]) => unknown>(name: string): T => {
  const f = P[name];
  if (typeof f !== 'function') throw new Error(`lib/posture.ts does not export ${name}()`);
  return f as T;
};
const actorOf = (r: PostureView): unknown => (r as unknown as Record<string, unknown>).actor;
const lineLabel = (r: PostureView) => fn<(r: PostureView, name?: string) => string>('postureLineLabel')(r);
const rowKey = (r: PostureView) => fn<(r: PostureView) => string>('postureRowKey')(r);

// --- fixtures ------------------------------------------------------------------------------------------
const v2Base = {
  conflict_code: 'red-sea-houthi', actor: 'government', actor_display_name: null, actor_display_name_ar: null,
  score_id: 's', score_day: 228, as_of: '2026-10-13', stance: 'position',
  label: 'continued_pressure', expressed_score: 75, defensive: false, confidence_base: 'high', confidence_now: 'high',
  decay_factor: '1', half_life_days: 30, evidence_id: 'e', evidence_kind: 'statement', act_type: null,
  position_quote: 'TEST quote', speaker: 'TEST', speaker_office: 'PM', source_url: 'https://example.test/q',
  archive_url: null, page_sha256: null, party_source: false, stated_at: '2026-10-13T07:00:00+00:00',
  captured_at: '2026-10-13T09:00:00+00:00', evidence_age_days: 0, freshness: 'current', change_reason: 'new_evidence',
  note: null, previous_day: 221, previous_stance: 'position', previous_label: 'ambivalent', previous_score: 50,
  withheld: false, latent_low: null, latent_high: null, latent_basis: null, gap: null, category: null,
  latent_access: false, gap_access: false, method_version: 'war-posture-v2',
};
const YE_GOV_NAME = 'Government of Yemen (Presidential Leadership Council)';
const YE_DFA_NAME = 'Ansar Allah (Houthi) authorities, Sanaa';
const yeGov = (o: Record<string, unknown> = {}) => ({ ...v2Base, country_code: 'YE', actor: 'government', actor_display_name: YE_GOV_NAME, ...o });
const yeDfa = (o: Record<string, unknown> = {}) => ({
  ...v2Base, country_code: 'YE', actor: 'de_facto_authority', actor_display_name: YE_DFA_NAME,
  label: 'escalation', expressed_score: 95, previous_label: 'continued_pressure', previous_score: 70, ...o,
});
const uncoded = (o: Record<string, unknown>) => ({
  ...v2Base, score_id: null, score_day: null, as_of: null, stance: 'uncoded', label: null, expressed_score: null,
  confidence_base: null, confidence_now: null, decay_factor: null, change_reason: null, previous_day: null,
  previous_stance: null, previous_label: null, previous_score: null, ...o,
});

const E = { claim: 'e', name: 'E src', url: 'https://e.example', published_at: '2026-10-12', party_source: false, feeds: 'E' as const };
const v1 = (cc: string, day: number, e: number | null): NaiScoreV2 => ({
  id: `${cc}-${day}`, country_code: cc, conflict_day: day, as_of: posture.dayToIsoDate(day), expressed_score: e,
  expressed_basis: `TEST basis ${cc} ${day}`, latent_low: null, latent_high: null, latent_basis: null, confidence: 'medium',
  sources: [E], gap: null, gap_size: null, category: 'UNSCORABLE', method_version: 'war-posture-v1',
  created_at: `${posture.dayToIsoDate(day)}T00:00:00Z`, latent_access: false, gap_access: false, hidden_latent_source_count: 0,
});

type Res = { data: unknown; error: { code: string; message: string } | null };
function fakeClient(opts: { v2: Record<string, unknown>[]; history: NaiScoreV2[] }) {
  const builder = (table: string) => {
    const filters: { col: string; val: unknown }[] = [];
    const run = (): Res => {
      if (table === 'conflicts') return { data: [...posture.CONFLICTS_FALLBACK], error: null };
      if (table === 'posture_evidence') return { data: [], error: null };
      return { data: null, error: { code: 'PGRST205', message: 'no table' } };
    };
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lt', 'lte', 'gt', 'order', 'limit', 'in']) {
      b[m] = (...args: unknown[]) => {
        if (m === 'eq') filters.push({ col: String(args[0]), val: args[1] });
        return b;
      };
    }
    b.maybeSingle = async () => ({ data: null, error: null });
    b.then = (resolve: (r: Res) => unknown, reject: (e: unknown) => unknown) => Promise.resolve(run()).then(resolve, reject);
    return b;
  };
  return {
    from: (t: string) => builder(t),
    rpc: async (name: string, args: Record<string, unknown> = {}) => {
      if (name === 'viewer_posture_v2') {
        const rows = opts.v2.filter((r) => args.p_country == null || r.country_code === args.p_country);
        return { data: rows, error: null };
      }
      if (name === 'viewer_nai_v2') {
        let rows = opts.history.slice();
        if (args.p_day != null) rows = rows.filter((r) => r.conflict_day === args.p_day);
        if (args.p_country != null) rows = rows.filter((r) => r.country_code === args.p_country);
        rows.sort((a, b) => b.conflict_day - a.conflict_day || a.country_code.localeCompare(b.country_code));
        return { data: rows.slice(0, Number(args.p_limit ?? 1000)), error: null };
      }
      return { data: null, error: { code: 'PGRST202', message: `Could not find the function public.${name}` } };
    },
  } as unknown as Parameters<typeof posture.getPostureBoard>[0];
}

const ye = (rows: PostureView[]) => rows.filter((r) => r.country_code === 'YE');
const desc = (r: PostureView) => `${actorOf(r)}|${r.method === 'war-posture-v2' ? 'v2' : 'v1'}|${r.stance}|${r.expressed_score ?? '-'}`;

async function main() {
  await check('fromV2Row carries actor + display names; a row without actor (pre-migration RPC) is government', () => {
    const g = posture.fromV2Row(yeGov(), ANON);
    const d = posture.fromV2Row(yeDfa(), ANON);
    assert.equal(actorOf(g), 'government');
    assert.equal(actorOf(d), 'de_facto_authority');
    assert.equal((d as unknown as Record<string, unknown>).actor_display_name, YE_DFA_NAME);
    const { actor: _a, actor_display_name: _n, actor_display_name_ar: _r, ...old } = { ...v2Base, country_code: 'GB' };
    void _a; void _n; void _r;
    assert.equal(actorOf(posture.fromV2Row(old, ANON)), 'government');
    // an unknown actor string is never trusted as a second line
    assert.equal(actorOf(posture.fromV2Row({ ...v2Base, country_code: 'GB', actor: 'rebels' }, ANON)), 'government');
  });

  await check('line labels: "Yemen — Government (PLC)" and "Yemen — Ansar Allah (Houthi), de facto authority"; other countries plain', () => {
    assert.equal(lineLabel(posture.fromV2Row(yeGov(), ANON)), 'Yemen — Government (PLC)');
    assert.equal(lineLabel(posture.fromV2Row(yeDfa(), ANON)), 'Yemen — Ansar Allah (Houthi), de facto authority');
    assert.equal(lineLabel(posture.fromV2Row({ ...v2Base, country_code: 'GB' }, ANON)), 'United Kingdom');
    assert.equal(fn<(c: string) => boolean>('isDualActorCountry')('YE'), true);
    assert.equal(fn<(c: string) => boolean>('isDualActorCountry')('IR'), false);
  });

  const both = await posture.getPostureBoard(fakeClient({ v2: [yeGov(), yeDfa(), { ...v2Base, country_code: 'US' }], history: [v1('YE', 227, 90)] }), {
    day: 228,
    access: ANON,
  });

  await check('board: YE shows two separate v2 lines with their own scores, never averaged, no v1 row', () => {
    assert.deepEqual(ye(both.rows).map(desc), ['government|v2|position|75', 'de_facto_authority|v2|position|95']);
    assert.equal(both.rows.some((r) => r.country_code === 'YE' && r.expressed_score === 85), false, 'an averaged YE score appeared');
    assert.equal(new Set(ye(both.rows).map(rowKey)).size, 2, 'the two YE lines share a row key');
  });

  await check('moves: each YE line moves on its own evidence with its own delta', async () => {
    const moves = posture.postureMoves(both).filter((m) => m.row.country_code === 'YE');
    assert.deepEqual(
      moves.map((m) => `${actorOf(m.row)}:${m.delta}`).sort(),
      ['de_facto_authority:25', 'government:25'],
    );
    const onlyDfa = await posture.getPostureBoard(
      fakeClient({ v2: [yeGov({ change_reason: 'reverification', previous_score: 75, previous_label: 'continued_pressure' }), yeDfa()], history: [] }),
      { day: 228, access: ANON },
    );
    assert.deepEqual(posture.postureMoves(onlyDfa).map((m) => `${m.row.country_code}:${actorOf(m.row)}:${m.delta}`), ['YE:de_facto_authority:25']);
  });

  const v1Line = posture.V1_FALLBACK_ACTOR?.YE;
  const otherLine = v1Line === 'government' ? 'de_facto_authority' : 'government';

  await check('V1_FALLBACK_ACTOR.YE is the line the frozen v1 YE rows were scored for (government / PLC)', () => {
    // nai_scores_v2 YE Days 221-227, expressed_basis: "Scored for the internationally recognised government (PLC) ..."
    assert.equal(v1Line, 'government');
  });

  await check('v1 fallback per line: de facto coded, government not coded -> frozen v1 YE number on the government line only', async () => {
    const b = await posture.getPostureBoard(fakeClient({ v2: [yeDfa()], history: [v1('YE', 227, 90)] }), { day: 228, access: ANON });
    assert.deepEqual(ye(b.rows).map(desc).sort(), ['de_facto_authority|v2|position|95', 'government|v1|position|90']);
    const frozen = ye(b.rows).find((r) => r.method === 'war-posture-v1')!;
    assert.equal(actorOf(frozen), v1Line);
    assert.equal(posture.isV1Fallback(b, frozen), true);
    assert.equal(lineLabel(frozen), 'Yemen — Government (PLC)');
    assert.equal(posture.v1FrozenText(frozen), 'War Posture v1 — frozen, Day 227');
    assert.equal(posture.postureMoves(b).some((m) => m.row.method === 'war-posture-v1'), false);
  });

  await check('v1 fallback per line: the v1 line coded in v2 -> no v1 row; the other line\'s uncoded statement stays', async () => {
    const b = await posture.getPostureBoard(
      fakeClient({ v2: [yeGov(), uncoded({ country_code: 'YE', actor: 'de_facto_authority', actor_display_name: YE_DFA_NAME })], history: [v1('YE', 227, 90)] }),
      { day: 228, access: ANON },
    );
    assert.deepEqual(ye(b.rows).map(desc), ['government|v2|position|75', 'de_facto_authority|v2|uncoded|-']);
  });

  await check('v1 fallback per line: the frozen v1 number never lands on the other line', async () => {
    const b = await posture.getPostureBoard(
      fakeClient({ v2: [uncoded({ country_code: 'YE', actor: otherLine, actor_display_name: null })], history: [v1('YE', 227, 90)] }),
      { day: 228, access: ANON },
    );
    const rows = ye(b.rows);
    assert.equal(rows.filter((r) => r.method === 'war-posture-v1').every((r) => actorOf(r) === v1Line), true);
    assert.equal(rows.some((r) => actorOf(r) === otherLine && r.expressed_score !== null), false, 'the other line got a number');
    // the other line's captured statement is not hidden by the v1 row of a different line
    assert.deepEqual(rows.map(desc).sort(), [`${otherLine}|v2|uncoded|-`, `${v1Line}|v1|position|90`].sort());
    const frozen = rows.find((r) => r.method === 'war-posture-v1')!;
    assert.deepEqual(frozen.v2UncodedConflicts, [], 'pending statements of the other line were attributed to the v1 line');
  });

  await check('v1 board (no v2 rows at all): the YE v1 row is the government line', async () => {
    const b = await posture.getPostureBoard(fakeClient({ v2: [], history: [v1('YE', 227, 90), v1('IR', 227, 70)] }), { day: 227, access: ANON });
    assert.equal(b.schema, 'v1');
    const r = ye(b.rows);
    assert.equal(r.length, 1);
    assert.equal(actorOf(r[0]), 'government');
    assert.equal(lineLabel(r[0]), 'Yemen — Government (PLC)');
    assert.equal(actorOf(b.rows.find((x) => x.country_code === 'IR')!), 'government');
  });

  await check('country page: YE shows both lines separately (v2 + frozen v1 on the government line)', async () => {
    const cp = await posture.getCountryPosture(fakeClient({ v2: [yeDfa()], history: [v1('YE', 227, 90)] }), 'YE', ANON);
    assert.deepEqual(cp.rows.map(desc).sort(), ['de_facto_authority|v2|position|95', 'government|v1|position|90']);
    assert.equal(cp.schema, 'v2');
    const cp2 = await posture.getCountryPosture(fakeClient({ v2: [yeGov(), yeDfa()], history: [v1('YE', 227, 90)] }), 'YE', ANON);
    assert.deepEqual(cp2.rows.map(desc), ['government|v2|position|75', 'de_facto_authority|v2|position|95']);
  });

  await check('country page: single-actor countries unchanged (coded v2 -> v2 only; nothing -> v1)', async () => {
    const ir = await posture.getCountryPosture(fakeClient({ v2: [{ ...v2Base, country_code: 'IR', conflict_code: 'us-iran' }], history: [v1('IR', 227, 70)] }), 'IR', ANON);
    assert.deepEqual(ir.rows.map(desc), ['government|v2|position|75']);
    const tr = await posture.getCountryPosture(fakeClient({ v2: [], history: [v1('TR', 227, 50)] }), 'TR', ANON);
    assert.equal(tr.schema, 'v1');
    assert.deepEqual(tr.rows.map(desc), ['government|v1|position|50']);
  });

  await check('board groups: both YE lines sit in the conflict tab; row keys unique board-wide', () => {
    assert.ok(ye(both.rows).every((r) => posture.postureGroupCode(both, r) === 'red-sea-houthi'));
    const keys = both.rows.map(rowKey);
    assert.equal(new Set(keys).size, keys.length);
  });

  const failed = results.filter((r) => r.err);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) process.exit(1);
}

main().catch((e) => {
  console.error('FAIL (crash)', e);
  process.exit(1);
});
