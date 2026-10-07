/**
 * toNaiV2View() redaction against both read paths, and rpcWithFallback() mode selection.
 * Plain assert script (the repo has no unit-test runner):
 *
 *   npx --yes tsx tests/unit/nai-v2-view.check.ts
 *
 * Row shapes mirror what PostgREST returns: the pre-migration table read (`select('*')`, no access
 * flags) and viewer_nai_v2 (paid columns NULL, L sources removed, access flags set).
 */
import assert from 'node:assert/strict';
import { toNaiV2View } from '../../lib/nai-v2';
import { isMissingRpc, rpcWithFallback } from '../../lib/supabase/rpc-fallback';
import type { NaiScoreV2 } from '../../types/supabase';

const E = { claim: 'e', name: 'E src', url: 'https://e.example', published_at: '2026-10-06', party_source: false, feeds: 'E' as const };
const L = { claim: 'l', name: 'L src', url: 'https://l.example', published_at: '2026-10-06', party_source: false, feeds: 'L' as const };

const tableRow: NaiScoreV2 = {
  id: '1', country_code: 'IR', conflict_day: 222, as_of: '2026-10-07',
  expressed_score: 60, expressed_basis: 'b', latent_low: 10, latent_high: 30, latent_basis: 'lb',
  confidence: 'medium', sources: [E, L], gap: '40.0000', gap_size: '40', category: 'INVERSION',
  method_version: 'war-posture-v1', created_at: '2026-10-07T00:00:00Z',
};
// viewer_nai_v2 for an anonymous caller
const rpcAnon: NaiScoreV2 = {
  ...tableRow, latent_low: null, latent_high: null, latent_basis: null, gap: null, gap_size: null, category: null,
  sources: [E], latent_access: false, gap_access: false, hidden_latent_source_count: 1,
};
const rpcAnonUnscorable: NaiScoreV2 = { ...rpcAnon, category: 'UNSCORABLE' };
// viewer_nai_v2 for an informed caller
const rpcInformed: NaiScoreV2 = { ...tableRow, latent_access: true, gap_access: true, hidden_latent_source_count: 0 };

const ANON = { latent: false, gap: false };
const ALL = { latent: true, gap: true };

// 1. Pre-migration table read, anonymous access: app-side redaction (unchanged behaviour).
let v = toNaiV2View(tableRow, ANON);
assert.equal(v.latent_low, null); assert.equal(v.gap, null); assert.equal(v.category, null);
assert.equal(v.categoryLocked, true); assert.equal(v.latentLocked, true); assert.equal(v.gapLocked, true);
assert.equal(v.latentEvidence, 'locked');
assert.deepEqual(v.sources.map((s) => s.feeds), ['E']); assert.equal(v.hiddenLatentSourceCount, 1);

// 2. Pre-migration table read, full access.
v = toNaiV2View(tableRow, ALL);
assert.equal(v.latent_low, 10); assert.equal(v.gap, 40); assert.equal(v.category, 'INVERSION');
assert.equal(v.gapLocked, false); assert.equal(v.sources.length, 2); assert.equal(v.hiddenLatentSourceCount, 0);

// 3. RPC anon row: a NULL (locked) category must stay LOCKED, never render as UNSCORABLE.
v = toNaiV2View(rpcAnon, ANON);
assert.equal(v.category, null); assert.equal(v.categoryLocked, true); assert.equal(v.hiddenLatentSourceCount, 1);
assert.equal(v.latentEvidence, 'locked');

// 4. RPC anon row passed with {latent:true, gap:true} (/warroom): the DB flags win.
v = toNaiV2View(rpcAnon, ALL);
assert.equal(v.latentLocked, true); assert.equal(v.gapLocked, true); assert.equal(v.categoryLocked, true);
assert.equal(v.latentEvidence, 'locked'); // not 'none': the band is locked, not missing
assert.equal(v.hiddenLatentSourceCount, 1);

// 5. UNSCORABLE is always disclosed.
v = toNaiV2View(rpcAnonUnscorable, ANON);
assert.equal(v.category, 'UNSCORABLE'); assert.equal(v.categoryLocked, false);

// 6. RPC informed row.
v = toNaiV2View(rpcInformed, ALL);
assert.equal(v.latent_low, 10); assert.equal(v.latent_high, 30); assert.equal(v.gap, 40); assert.equal(v.category, 'INVERSION');
assert.equal(v.latentEvidence, 'band'); assert.equal(v.sources.length, 2);

// 7. App says informed but DB says no (e.g. tier changed): the stricter answer wins.
v = toNaiV2View(rpcAnon, ALL);
assert.equal(v.gap, null);

// 8. rpcWithFallback mode selection.
const missing = { code: 'PGRST202', message: 'Could not find the function public.viewer_nai_v2', details: '', hint: '', name: 'PostgrestError' } as const;
const denied = { code: '42501', message: 'permission denied for table nai_scores_v2', details: '', hint: '', name: 'PostgrestError' } as const;
assert.equal(isMissingRpc(missing), true);
assert.equal(isMissingRpc(denied), false);
assert.equal(isMissingRpc(null), false);

void (async () => {
  let r = await rpcWithFallback<number[]>(async () => ({ data: [1], error: null }), async () => ({ data: [2], error: null }));
  assert.equal(r.via, 'rpc'); assert.deepEqual(r.data, [1]);
  r = await rpcWithFallback<number[]>(async () => ({ data: null, error: missing }), async () => ({ data: [2], error: null }));
  assert.equal(r.via, 'table'); assert.deepEqual(r.data, [2]);
  r = await rpcWithFallback<number[]>(async () => ({ data: null, error: missing }), null);
  assert.equal(r.via, 'missing'); assert.equal(r.data, null);
  // A permission error must surface, never fall back to the (denied) table query.
  let fellBack = false;
  r = await rpcWithFallback<number[]>(async () => ({ data: null, error: denied }), async () => { fellBack = true; return { data: [2], error: null }; });
  assert.equal(r.via, 'rpc'); assert.equal(r.error?.code, '42501'); assert.equal(fellBack, false);
  // Client without .rpc (no-op mock) → treated as missing.
  r = await rpcWithFallback<number[]>(() => { throw new TypeError('supabase.rpc is not a function'); }, async () => ({ data: [3], error: null }));
  assert.equal(r.via, 'table'); assert.deepEqual(r.data, [3]);
  console.log('nai-v2-view.check: all assertions passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
