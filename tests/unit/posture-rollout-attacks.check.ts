import assert from 'node:assert/strict';
import * as P from '../../lib/posture';
const ANON = { latent: false, gap: false };
const iso = P.dayToIsoDate;
type R = Record<string, unknown>;
const v1 = (cc: string, day: number, e: number | null) => ({ id: `${cc}${day}`, country_code: cc, conflict_day: day, as_of: iso(day), expressed_score: e, expressed_basis: 'B', latent_low: 10, latent_high: 20, latent_basis: 'LB', confidence: 'medium', sources: [{ claim: 'c', name: 'n', url: 'https://e.test', published_at: iso(day), party_source: false, feeds: 'E' }, { claim: 'c', name: 'L', url: 'https://l.test', published_at: iso(day), party_source: false, feeds: 'L' }], gap: 5, gap_size: 5, category: 'ALIGNED', method_version: 'war-posture-v1', created_at: '', latent_access: true, gap_access: true, hidden_latent_source_count: 0 });
const v2b: R = { conflict_code: 'us-iran', stance: 'uncoded', position_quote: 'Q', source_url: 'https://q.test', captured_at: '2026-10-13T07:00:00Z', stated_at: '2026-10-13T06:00:00Z', evidence_age_days: 0, freshness: 'current', withheld: false, method_version: 'war-posture-v2' };
function client(o: { v2: R[] | 'err' | 'missing'; nai: R[] | 'err' | 'missing' }) {
  const calls: string[] = [];
  const tb = (t: string) => { const f: [string, string, unknown][] = []; let lim = 1e9; let asc = true; const b: R = {};
    for (const m of ['select', 'eq', 'lt', 'lte', 'order', 'limit']) b[m] = (...a: unknown[]) => { calls.push(`${t}.${m}(${JSON.stringify(a)})`); if (['eq', 'lt', 'lte'].includes(m)) f.push([m, a[0] as string, a[1]]); if (m === 'limit') lim = a[0] as number; if (m === 'order') asc = (a[1] as { ascending: boolean }).ascending; return b; };
    const run = () => { if (t !== 'nai_scores_v2' || !Array.isArray(o.nai)) return { data: [], error: null }; let r = o.nai.slice() as R[]; for (const [op, c, v] of f) r = r.filter((x) => op === 'eq' ? x[c] === v : op === 'lt' ? (x[c] as number) < (v as number) : (x[c] as number) <= (v as number)); r.sort((a, c) => (asc ? 1 : -1) * ((a.conflict_day as number) - (c.conflict_day as number))); return { data: r.slice(0, lim), error: null }; };
    b.maybeSingle = async () => { const r = run(); return { data: r.data[0] ?? null, error: null }; }; b.then = (res: (x: unknown) => unknown) => Promise.resolve(run()).then(res); return b; };
  return { calls, c: { from: tb, rpc: async (fn: string, a: R) => { calls.push(`rpc ${fn} ${JSON.stringify(a)}`);
    const src = fn === 'viewer_posture_v2' ? o.v2 : o.nai;
    if (src === 'missing') return { data: null, error: { code: 'PGRST202', message: 'x' } };
    if (src === 'err') return { data: null, error: { code: '57014', message: 'statement timeout' } };
    let r = src.slice(); if (fn === 'viewer_nai_v2') { if (a.p_day != null) r = r.filter((x) => x.conflict_day === a.p_day); if (a.p_country != null) r = r.filter((x) => x.country_code === a.p_country); r.sort((x, y) => (y.conflict_day as number) - (x.conflict_day as number)); r = r.slice(0, (a.p_limit as number) ?? 1000); }
    return { data: r, error: null }; } } as never };
}
const out: string[] = []; let fails = 0;
async function t(name: string, fn: () => Promise<void>) { try { await fn(); out.push(`ok   ${name}`); } catch (e) { fails++; out.push(`FAIL ${name}\n     ${(e as Error).message.split('\n')[0]}`); } }
(async () => {
  const hist = [v1('KW', 227, null), v1('KW', 222, 25), v1('US', 227, 50), v1('IR', 227, 60), v1('TR', 222, 20)];
  // Operator ruling R6 (2026-10-14): the board keeps the uncoded line (never replaced by a number-less v1 row) but
  // never carries the uncoded quote into the /nai payload (stripUncodedEvidence); the country page keeps it (A2).
  await t('A1 uncoded-only KW with null-E latest v1 row: the uncoded line stays on the board, without its quote', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'KW', position_quote: 'KW-CAPTURED' }, { ...v2b, country_code: 'IR', stance: 'position', expressed_score: 75, label: 'continued_pressure', score_day: 228 }], nai: hist });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    const kw = b.rows.filter((r) => r.country_code === 'KW');
    console.log('   KW rows:', kw.map((r) => `${r.method}|${r.stance}|E=${r.expressed_score}|ev=${r.evidence?.quote ?? null}`));
    assert.ok(kw.some((r) => r.method === 'war-posture-v2' && r.stance === 'uncoded'), 'uncoded KW line dropped; replaced by a v1 row with no number');
    assert.ok(!JSON.stringify(b).includes('KW-CAPTURED'), 'uncoded quote reached the board payload');
  });
  await t('A2 country page: uncoded-only KW with null-E v1 row keeps the captured statement in the posture block', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'KW', position_quote: 'KW-CAPTURED' }], nai: hist });
    const cp = await P.getCountryPosture(c, 'kw', ANON);
    console.log('   KW country rows:', cp.schema, cp.rows.map((r) => `${r.method}|${r.stance}|E=${r.expressed_score}|ev=${r.evidence?.quote ?? null}`));
    assert.ok(cp.rows.some((r) => r.evidence?.quote === 'KW-CAPTURED'), 'captured statement only survives in the collapsed ledger');
  });
  await t('A3 withheld SA with v2 evidence on red-sea only: still has a us-iran (panel) row, so never "nothing on record"', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'SA', conflict_code: 'red-sea-houthi', withheld: true, stance: 'withheld' }], nai: hist });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    const sa = b.rows.filter((r) => r.country_code === 'SA');
    console.log('   SA rows:', sa.map((r) => `${r.conflict_code}|${r.stance}`));
    assert.ok(sa.some((r) => P.postureGroupCode(b, r) === P.POSTURE_PANEL_CONFLICT), 'SA listed as "nothing on record" in the us-iran tab');
  });
  await t('B1 day before v2 existed (225): v1 board for that day, no crash', async () => {
    const { c } = client({ v2: [], nai: hist });
    const b = await P.getPostureBoard(c, { day: 225, access: ANON });
    assert.equal(b.schema, 'v1'); assert.equal(b.day, 225); assert.equal(b.rows.length, 0);
  });
  await t('B2 day = NAI_V2_START_DAY (221) and day=null and future 9999 with v2 rows: no crash, v1 rows <= day only', async () => {
    for (const day of [221, null, 9999]) {
      const { c } = client({ v2: [{ ...v2b, country_code: 'IR', stance: 'position', expressed_score: 75, score_day: 228 }], nai: [...hist, v1('QA', 221, 15)] });
      const b = await P.getPostureBoard(c, { day, access: ANON });
      const bd = b.day!;
      assert.ok(b.rows.filter((r) => r.method === 'war-posture-v1').every((r) => (r.score_day as number) <= bd), `day ${day}`);
      if (day === 221) assert.deepEqual(b.rows.filter((r) => r.method === 'war-posture-v1').map((r) => r.country_code), ['QA']);
      assert.equal(P.postureMoves(b).length, 0);
    }
  });
  await t('C1 free tier: v1 fallback rows carry no latent/gap/category/L-source even if RPC returned them', async () => {
    const { c, calls } = client({ v2: [{ ...v2b, country_code: 'IR', stance: 'position', expressed_score: 75, score_day: 228 }], nai: hist });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    for (const r of b.rows.filter((x) => x.method === 'war-posture-v1')) { assert.equal(r.latent_low, null); assert.equal(r.gap, null); assert.ok(r.category === null || r.category === 'UNSCORABLE', String(r.category)); assert.ok(r.cited.every((s) => s.feeds === 'E')); }
    assert.ok(calls.some((x) => x.startsWith('rpc viewer_nai_v2 {"p_limit":5000')));
  });
  await t('C2 RPC non-missing error (timeout) on fallback: board renders, v1 rows silently absent (countries become "nothing on record")', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'IR', stance: 'position', expressed_score: 75, score_day: 228 }], nai: 'err' });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    console.log('   rows on RPC timeout:', b.rows.map((r) => r.country_code).join(','));
  });
  await t('E1 empty v1 + empty v2: board renders, 0 rows', async () => {
    const { c } = client({ v2: [], nai: [] });
    const b = await P.getPostureBoard(c, { access: ANON });
    assert.equal(b.rows.length, 0); assert.equal(P.boardConflicts(b).length, 1);
  });
  await t('E2 v2 rows but empty v1: withheld policy rows + v2 rows only', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'OM' }], nai: [] });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    assert.deepEqual(b.rows.map((r) => r.country_code).sort(), ['AE', 'EG', 'OM', 'SA']);
  });
  await t('E3 nulled + deliberate_silence count as coded (v1 hidden), withheld lowercase from RPC still withheld', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'TR', stance: 'nulled', change_reason: 'nulled' }, { ...v2b, country_code: 'US', stance: 'deliberate_silence' }, { ...v2b, country_code: 'eg', stance: 'position', expressed_score: 99, label: 'escalation' }], nai: [...hist, v1('eg', 227, 99)] });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    assert.ok(!b.rows.some((r) => ['TR', 'US'].includes(r.country_code) && r.method === 'war-posture-v1'));
    const eg = b.rows.filter((r) => r.country_code.toUpperCase() === 'EG');
    console.log('   eg rows:', eg.map((r) => `${r.country_code}|${r.method}|${r.stance}|E=${r.expressed_score}`));
    assert.ok(eg.every((r) => r.expressed_score === null && r.label === null && r.withheld));
  });
  await t('E4 whitespace code " eg" (impossible in DB: CHECK ^[A-Z]{2}$) — TS alone does not withhold it', async () => {
    const { c } = client({ v2: [{ ...v2b, country_code: 'IR', stance: 'position', expressed_score: 75, score_day: 228 }], nai: [v1(' eg', 227, 99)] });
    const b = await P.getPostureBoard(c, { day: 228, access: ANON });
    const eg = b.rows.filter((r) => r.country_code.trim().toUpperCase() === 'EG' && r.expressed_score !== null);
    assert.equal(eg.length, 0, `' eg' shown with E=${eg[0]?.expressed_score}`);
  });
  console.log(out.join('\n')); console.log(`${fails} failed`); process.exit(fails ? 1 : 0);
})();
