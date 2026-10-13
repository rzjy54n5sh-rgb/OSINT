/**
 * War Posture v2 data layer (lib/posture.ts): SQL mirrors (labels, decay, freshness), the EG/AE/SA rule
 * in both read paths, moves-only-on-new-evidence, and the v2 → v1 fallback with fixture PostgREST
 * responses (pre-migration database = PGRST202 on viewer_posture_v2). Plain assert script:
 *
 *   npx --yes tsx tests/unit/posture.check.ts
 */
import assert from 'node:assert/strict';
import {
  POSTURE_LABELS,
  confidenceNow,
  currentConflictDayUtc,
  dayToIsoDate,
  decayFactor,
  freshnessFor,
  fromV1View,
  fromV2Row,
  getCountryPosture,
  getPostureBoard,
  postureLabelFor,
  postureMoves,
  type PostureBoard,
} from '../../lib/posture';
import { toNaiV2View } from '../../lib/nai-v2';
import type { NaiScoreV2 } from '../../types/supabase';

let n = 0;
const ok = (label: string, fn: () => void) => {
  fn();
  n++;
  console.log(`ok   ${label}`);
};

// 1. Labels: same bands as public.posture_label_for_score -------------------------------------------
ok('labels match the SQL bands', () => {
  const cases: [number | null, string | null][] = [
    [0, 'immediate_ceasefire'], [12, 'immediate_ceasefire'], [13, 'conditional_deescalation'], [25, 'conditional_deescalation'],
    [37, 'conditional_deescalation'], [38, 'ambivalent'], [62, 'ambivalent'], [63, 'continued_pressure'], [87, 'continued_pressure'],
    [88, 'escalation'], [100, 'escalation'], [null, null], [-1, null], [101, null],
  ];
  for (const [e, want] of cases) assert.equal(postureLabelFor(e), want, `label(${e})`);
  // v2 War Posture scale (four bands by score; each label takes its anchor's band)
  assert.deepEqual(POSTURE_LABELS.map((l) => l.color), ['#6FA8F0', '#6FA8F0', '#98A3B3', '#E8A066', '#FF7F3F']);
  // no red / green hues in the scale (blue -> grey -> orange)
  for (const l of POSTURE_LABELS) assert.ok(!/^#(E0|E05252|4EC98A)/i.test(l.color), l.color);
});

// 2. Decay schedule: same numbers as the SQL tests ----------------------------------------------------
ok('decay / confidence / freshness mirror SQL', () => {
  assert.equal(decayFactor(0), 1);
  assert.equal(decayFactor(30), 0.5);
  assert.equal(decayFactor(60), 0.25);
  assert.equal(decayFactor(2), 0.9548);
  assert.equal(confidenceNow('high', 0), 'high');
  assert.equal(confidenceNow('high', 30), 'medium');
  assert.equal(confidenceNow('high', 90), 'low');
  assert.equal(confidenceNow('medium', 0), 'medium');
  assert.equal(confidenceNow('medium', 27), 'medium');
  assert.equal(confidenceNow('low', 0), 'low');
  assert.equal(confidenceNow(null, 0), null);
  assert.deepEqual([14, 15, 45, 46].map((d) => freshnessFor(d)), ['current', 'decaying', 'decaying', 'stale']);
  assert.equal(dayToIsoDate(226), '2026-10-11');
  assert.equal(dayToIsoDate(1), '2026-02-28');
  assert.equal(currentConflictDayUtc(new Date('2026-10-11T23:59:00Z')), 226);
});

// 3. v2 rows -------------------------------------------------------------------------------------------
const ANON = { latent: false, gap: false };
const irRow = {
  country_code: 'IR', conflict_code: 'us-iran', score_id: 's2', score_day: 224, as_of: '2026-10-09', stance: 'position',
  label: 'continued_pressure', expressed_score: 75, defensive: true, confidence_base: 'high', confidence_now: 'high',
  decay_factor: '0.9548', half_life_days: 30, evidence_id: 'e2', evidence_kind: 'statement', act_type: null,
  position_quote: 'TEST quote', speaker: 'TEST', speaker_office: 'FM', source_url: 'https://example.test/ir2',
  archive_url: 'https://web.archive.org/web/2026/https://example.test/ir2', page_sha256: 'b'.repeat(64), party_source: true,
  stated_at: '2026-10-09T07:00:00+00:00', captured_at: '2026-10-09T09:00:00+00:00', evidence_age_days: 2, freshness: 'current',
  change_reason: 'new_evidence', note: null, previous_day: 221, previous_stance: 'position', previous_label: 'ambivalent',
  previous_score: 60, withheld: false, latent_low: null, latent_high: null, latent_basis: null, gap: null, category: 'UNSCORABLE',
  latent_access: false, gap_access: false, method_version: 'war-posture-v2',
};
ok('v2 row maps (label, decay, evidence, paid fields locked)', () => {
  const v = fromV2Row(irRow, ANON);
  assert.equal(v.label, 'continued_pressure');
  assert.equal(v.expressed_score, 75);
  assert.equal(v.defensive, true);
  assert.equal(v.decay_factor, 0.9548);
  assert.equal(v.evidence?.quote, 'TEST quote');
  assert.equal(v.evidence?.archive_url?.startsWith('https://web.archive.org/'), true);
  assert.equal(v.latentLocked, true);
  assert.equal(v.category, 'UNSCORABLE');
});
ok('v2: EG withheld even if the database returned a grade (defence in depth)', () => {
  const leaked = { ...irRow, country_code: 'EG', withheld: false, stance: 'position', expressed_score: 15, label: 'immediate_ceasefire' };
  const v = fromV2Row(leaked, { latent: true, gap: true });
  assert.equal(v.stance, 'withheld');
  assert.equal(v.withheld, true);
  assert.equal(v.expressed_score, null);
  assert.equal(v.label, null);
  assert.equal(v.confidence_now, null);
  assert.equal(v.latent_low, null);
  assert.equal(v.evidence?.quote, 'TEST quote'); // the words stay
});
ok('v2: silence keeps its own stance, no score', () => {
  const v = fromV2Row({ ...irRow, country_code: 'IL', stance: 'deliberate_silence', label: null, expressed_score: null, evidence_kind: 'silence_trigger' }, ANON);
  assert.equal(v.stance, 'deliberate_silence');
  assert.equal(v.expressed_score, null);
  assert.equal(v.evidence?.kind, 'silence_trigger');
});

// 4. v1 rows (pre-migration) ---------------------------------------------------------------------------
const E = { claim: 'e', name: 'E src', url: 'https://e.example', published_at: '2026-10-07', party_source: false, feeds: 'E' as const };
const L = { claim: 'l', name: 'L src', url: 'https://l.example', published_at: '2026-10-07', party_source: false, feeds: 'L' as const };
const v1 = (cc: string, e: number | null): NaiScoreV2 => ({
  id: cc, country_code: cc, conflict_day: 224, as_of: '2026-10-09', expressed_score: e, expressed_basis: `Held at ${e}`,
  latent_low: 10, latent_high: 30, latent_basis: 'lb', confidence: 'medium', sources: [E, L], gap: '5', gap_size: '5',
  category: 'UNSCORABLE', method_version: 'war-posture-v1', created_at: '2026-10-09T00:00:00Z',
});
ok('v1: toNaiV2View withholds SA (no score, no basis, no band, no L sources)', () => {
  const v = toNaiV2View(v1('SA', 75), { latent: true, gap: true });
  assert.equal(v.withheld, true);
  assert.equal(v.expressed_score, null);
  assert.equal(v.expressed_basis, null);
  assert.equal(v.latent_low, null);
  assert.equal(v.category, null);
  assert.deepEqual(v.sources.map((s) => s.feeds), ['E']);
});
ok('v1: posture view = label from E, age from newest E source, cited reporting kept', () => {
  const p = fromV1View(toNaiV2View(v1('US', 80), ANON), '2026-10-09');
  assert.equal(p.method, 'war-posture-v1');
  assert.equal(p.conflict_code, null);
  assert.equal(p.label, 'continued_pressure');
  assert.equal(p.evidence_age_days, 2);
  assert.equal(p.freshness, 'current');
  assert.equal(p.cited.length, 1);
  const s = fromV1View(toNaiV2View(v1('AE', 40), ANON), '2026-10-09');
  assert.equal(s.stance, 'withheld');
  assert.equal(s.label, null);
  assert.equal(s.expressed_basis, null);
  assert.deepEqual(s.cited, []); // EG / AE / SA: no outlet summaries, verbatim ledger only
});

// 5. Moves: new evidence only --------------------------------------------------------------------------
ok('moves: only new_evidence changes, never reverification, never v1', () => {
  const rows = [
    fromV2Row(irRow, ANON),
    fromV2Row({ ...irRow, country_code: 'YE', conflict_code: 'red-sea-houthi', change_reason: 'reverification', note: 'x', previous_score: 90, expressed_score: 75 }, ANON),
    fromV2Row({ ...irRow, country_code: 'US', change_reason: 'new_evidence', previous_score: 75, previous_label: 'continued_pressure', expressed_score: 78 }, ANON),
    // an old statement captured today: new_evidence, big jump, but stale -> never a move
    fromV2Row({ ...irRow, country_code: 'TR', freshness: 'stale', evidence_age_days: 60, previous_score: 20, previous_label: 'conditional_deescalation', expressed_score: 95, label: 'escalation' }, ANON),
  ];
  const board: PostureBoard = { schema: 'v2', day: 226, firstDay: 221, latestDay: 226, conflicts: [], rows, hasLatentAccess: false, hasGapAccess: false };
  const m = postureMoves(board);
  assert.deepEqual(m.map((x) => [x.row.country_code, x.delta]), [['IR', 15]]); // US +3 same label: not a move; YE: re-check
  assert.deepEqual(postureMoves({ ...board, schema: 'v1' }), []);
  assert.deepEqual(postureMoves({ ...board, day: 230 }), []); // older than two days
});

// 6. Fallback with fixture PostgREST responses ---------------------------------------------------------
type Res = { data: unknown; error: { code: string; message: string } | null };
function fakeClient(opts: { rpc: Record<string, Res>; tables: Record<string, (ops: string[]) => Res> }) {
  const builder = (table: string) => {
    const ops: string[] = [];
    const run = (): Res => (opts.tables[table] ? opts.tables[table](ops) : { data: null, error: { code: 'PGRST205', message: 'no table' } });
    const b: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'lt', 'lte', 'gt', 'order', 'limit', 'in']) {
      b[m] = (...args: unknown[]) => {
        ops.push(`${m}:${JSON.stringify(args)}`);
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
  return {
    from: (t: string) => builder(t),
    rpc: async (fn: string) => opts.rpc[fn] ?? { data: null, error: { code: 'PGRST202', message: `missing ${fn}` } },
  } as unknown as Parameters<typeof getPostureBoard>[0];
}
const MISSING = { data: null, error: { code: 'PGRST202', message: 'Could not find the function public.viewer_posture_v2' } };

async function asyncChecks() {
  // (a) Pre-migration DB: viewer_posture_v2 missing, conflicts table missing -> v1 board, registry fallback.
  const v1Rpc = { data: [v1('IR', 60), v1('EG', 15)].map((r) => ({ ...r, latent_low: null, latent_high: null, sources: [E], latent_access: false, gap_access: false })), error: null };
  const pre = fakeClient({
    rpc: { viewer_posture_v2: MISSING, viewer_nai_v2: v1Rpc },
    tables: {
      nai_scores_v2: (ops) => ({ data: [{ conflict_day: ops.some((o) => o.includes('"ascending":true')) ? 221 : 224 }], error: null }),
    },
  });
  const b1 = await getPostureBoard(pre, { access: ANON });
  assert.equal(b1.schema, 'v1');
  assert.equal(b1.latestDay, 224);
  assert.equal(b1.conflicts.length, 4);
  assert.deepEqual(b1.rows.map((r) => `${r.country_code}:${r.stance}:${r.expressed_score}`), ['IR:position:60', 'EG:withheld:null']);
  console.log('ok   pre-migration: v1 board, registry fallback, EG withheld');

  // (b) Migrated but no v2 rows yet -> still v1 (never an empty map).
  const empty = fakeClient({
    rpc: { viewer_posture_v2: { data: [], error: null }, viewer_nai_v2: v1Rpc },
    tables: {
      nai_scores_v2: () => ({ data: [{ conflict_day: 224 }], error: null }),
      conflicts: () => ({ data: [], error: null }),
    },
  });
  assert.equal((await getPostureBoard(empty, { access: ANON })).schema, 'v1');
  console.log('ok   migrated, no v2 rows yet: v1 board');

  // (c) v2 rows present -> v2 board.
  const post = fakeClient({
    rpc: { viewer_posture_v2: { data: [irRow, { ...irRow, country_code: 'EG', withheld: true, stance: 'withheld', label: null, expressed_score: null }], error: null } },
    tables: { conflicts: () => ({ data: [{ conflict_code: 'us-iran', name: 'n', short_name: 'US–Iran', description: 'd', theatre: 't', started_on: null, status: 'active', sort_order: 10 }], error: null }) },
  });
  const b3 = await getPostureBoard(post, { day: 226, access: ANON });
  assert.equal(b3.schema, 'v2');
  assert.equal(b3.day, 226);
  // IR position, EG withheld (v2 row), then AE / SA: no v2 row -> policy-only withheld rows (no grade)
  assert.deepEqual(b3.rows.map((r) => `${r.country_code}:${r.stance}`), ['IR:position', 'EG:withheld', 'AE:withheld', 'SA:withheld']);
  assert.ok(b3.rows.filter((r) => r.withheld).every((r) => r.expressed_score === null && r.label === null));
  console.log('ok   v2 board from viewer_posture_v2');

  // (d) Country posture: v2 rows + ledger from posture_evidence (pre-migration columns only).
  const cp = await getCountryPosture(
    fakeClient({
      rpc: { viewer_posture_v2: MISSING, viewer_nai_v2: { data: [{ ...v1('SA', 75), sources: [E], latent_low: null, latent_high: null }], error: null } },
      tables: {
        posture_evidence: () => ({
          data: [{ id: 'x', country_code: 'SA', conflict_code: 'red-sea-houthi', position_quote: 'TEST SA quote', speaker: null, source_url: 'https://example.test/sa', archive_url: null, page_sha256: null, captured_at: '2026-10-08T00:00:00Z', method_version: 'war-posture-v2' }],
          error: null,
        }),
      },
    }),
    'SA',
    ANON,
  );
  assert.equal(cp.schema, 'v1');
  assert.equal(cp.rows[0].stance, 'withheld');
  assert.equal(cp.rows[0].expressed_score, null);
  assert.equal(cp.ledger[0].kind, 'statement'); // old rows default to statement
  assert.equal(cp.ledger[0].quote, 'TEST SA quote');
  console.log('ok   country posture: SA withheld, ledger read with pre-migration columns');
  n += 4;
}

asyncChecks()
  .then(() => console.log(`\nall ${n} checks passed`))
  .catch((e) => {
    console.error('FAIL', e);
    process.exit(1);
  });
