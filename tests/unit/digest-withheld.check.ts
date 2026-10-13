/**
 * Daily digest + EG / AE / SA editorial policy: the governments of Egypt, the UAE and Saudi Arabia are never
 * given a posture number, band, category, label or colour, and are never ranked. The digest's "biggest move"
 * reads legacy nai_scores (frozen Days 1-35, which still hold EG / AE / SA rows), so:
 *   1. the selection (supabase/functions/_shared/digest-biggest-move.ts, used by send-digest) never picks them;
 *   2. both digest templates (Deno _shared + Next.js lib mirror) refuse to render a withheld country even if
 *      handed one (defence in depth).
 * Plain assert script; exits 1 if any check fails:
 *
 *   npx --yes tsx tests/unit/digest-withheld.check.ts
 *
 * Every import is dynamic so a missing module / failing check is reported as a FAIL line instead of a crash,
 * and so tsc does not pull the Deno-only template (Deno.env) into the Next.js type-check.
 */
import assert from 'node:assert/strict';
import { POSTURE_WITHHELD_CODES } from '../../lib/posture';

type Move = { countryCode: string; countryName: string; delta: number; newScore: number; category: string };
type Row = { country_code: string; conflict_day: number; expressed_score: number; category: string | null };
type TemplateFn = (data: Record<string, unknown>, siteUrl?: string) => { subject: string; html: string };

let pass = 0;
let fail = 0;
async function check(label: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    pass++;
    console.log(`PASS ${label}`);
  } catch (e) {
    fail++;
    const msg = e instanceof Error ? e.message.split('\n')[0] : String(e);
    console.log(`FAIL ${label}\n     -> ${msg}`);
  }
}

// Dynamic paths (non-literal) keep tsc from following them; tsx resolves them at runtime.
const SHARED = '../../supabase/functions/_shared/';
const selectionPath = SHARED + 'digest-biggest-move.ts';
const denoTemplatePath = SHARED + 'digest-template.ts';
const nextTemplatePath = '../../lib/email/templates/daily-digest';

const NAMES: Record<string, string> = { IR: 'Iran', IL: 'Israel', EG: 'Egypt', AE: 'UAE', SA: 'Saudi Arabia', US: 'United States' };

// Day 35 vs Day 34. EG / AE / SA carry the three largest moves; Iran is the largest move allowed to rank.
const ROWS: Row[] = [
  { country_code: 'EG', conflict_day: 34, expressed_score: 40, category: 'STABLE' },
  { country_code: 'EG', conflict_day: 35, expressed_score: 65, category: 'TENSION' }, // +25
  { country_code: 'AE', conflict_day: 34, expressed_score: 52, category: 'STABLE' },
  { country_code: 'AE', conflict_day: 35, expressed_score: 30, category: 'FRACTURE' }, // -22
  { country_code: 'SA', conflict_day: 34, expressed_score: 50, category: 'STABLE' },
  { country_code: 'SA', conflict_day: 35, expressed_score: 71, category: 'TENSION' }, // +21
  { country_code: 'IR', conflict_day: 34, expressed_score: 50, category: 'TENSION' },
  { country_code: 'IR', conflict_day: 35, expressed_score: 55.26, category: null }, // +5.3, category falls back to prev
  { country_code: 'IL', conflict_day: 34, expressed_score: 60, category: 'STABLE' },
  { country_code: 'IL', conflict_day: 35, expressed_score: 57, category: 'STABLE' }, // -3
  { country_code: 'US', conflict_day: 35, expressed_score: 99, category: 'ALIGNED' }, // no prev day -> skipped
];

function baseDigest(move: Move | null) {
  return {
    conflictDay: 227,
    date: 'Monday, October 12, 2026',
    scenarioA: 30,
    scenarioB: 20,
    scenarioC: 25,
    scenarioD: 25,
    leadScenario: 'A — US announces blockade end or a deal',
    biggestMove: move,
    brentPrice: 81.5,
    topHeadlines: [{ title: 'Headline', source: 'Reuters' }],
    tier: 'professional',
  };
}

const WITHHELD_MOVES: Move[] = [
  { countryCode: 'EG', countryName: 'Egypt', delta: 25, newScore: 65, category: 'TENSION' },
  { countryCode: 'AE', countryName: 'UAE', delta: -22, newScore: 30, category: 'FRACTURE' },
  { countryCode: 'SA', countryName: 'Saudi Arabia', delta: 21, newScore: 71, category: 'INVERSION' },
  { countryCode: 'sa', countryName: 'Saudi Arabia', delta: 21, newScore: 71, category: 'INVERSION' }, // lower-case code
  { countryCode: 'XX', countryName: 'United Arab Emirates', delta: 9, newScore: 44, category: 'ALIGNED' }, // name only
];

function assertNoWithheldRender(html: string, subject: string, m: Move) {
  const all = html + '\n' + subject;
  assert.ok(!all.includes('BIGGEST MOVE'), `biggest-move block rendered for ${m.countryCode}/${m.countryName}`);
  assert.ok(!all.includes(m.countryName), `country name "${m.countryName}" rendered`);
  assert.ok(!all.includes(`[${m.category}]`), `category [${m.category}] rendered`);
  assert.ok(!all.includes(`→ ${m.newScore}`), `score → ${m.newScore} rendered`);
}

async function main() {
  // ---- 1. selection ------------------------------------------------------------------------------------
  let sel: {
    WITHHELD_POSTURE_CODES: readonly string[];
    pickBiggestMove: (rows: Row[], naiDay: number, prevDay: number, names: Record<string, string>) => Move | null;
  } | null = null;
  await check('selection module supabase/functions/_shared/digest-biggest-move.ts exists (testable outside Deno.serve)', async () => {
    sel = await import(selectionPath);
    assert.equal(typeof sel!.pickBiggestMove, 'function');
  });

  await check('WITHHELD_POSTURE_CODES (edge) === POSTURE_WITHHELD_CODES (lib/posture.ts)', () => {
    assert.ok(sel, 'selection module missing');
    assert.deepEqual([...sel!.WITHHELD_POSTURE_CODES].sort(), [...POSTURE_WITHHELD_CODES].sort());
  });

  await check('biggest move never picks EG / AE / SA (they hold the 3 largest deltas) -> picks IR', () => {
    assert.ok(sel, 'selection module missing');
    const m = sel!.pickBiggestMove(ROWS, 35, 34, NAMES);
    assert.ok(m, 'expected a move');
    assert.ok(!['EG', 'AE', 'SA'].includes(m!.countryCode.toUpperCase()), `picked withheld ${m!.countryCode} (${m!.newScore} ${m!.category})`);
    assert.deepEqual(m, { countryCode: 'IR', countryName: 'Iran', delta: 5.3, newScore: 55, category: 'TENSION' });
  });

  await check('withheld codes excluded case-insensitively (eg / ae / sa rows)', () => {
    assert.ok(sel, 'selection module missing');
    const lower = ROWS.map((r) => ({ ...r, country_code: ['EG', 'AE', 'SA'].includes(r.country_code) ? r.country_code.toLowerCase() : r.country_code }));
    const m = sel!.pickBiggestMove(lower, 35, 34, NAMES);
    assert.equal(m?.countryCode, 'IR');
  });

  await check('only EG / AE / SA rows -> no biggest move (null), nothing ranked', () => {
    assert.ok(sel, 'selection module missing');
    const m = sel!.pickBiggestMove(ROWS.filter((r) => ['EG', 'AE', 'SA'].includes(r.country_code)), 35, 34, NAMES);
    assert.equal(m, null);
  });

  await check('non-withheld behaviour unchanged: largest |delta| wins, ties keep first, unknown name falls back to code', () => {
    assert.ok(sel, 'selection module missing');
    const rows: Row[] = [
      { country_code: 'IL', conflict_day: 9, expressed_score: 60, category: 'STABLE' },
      { country_code: 'IL', conflict_day: 10, expressed_score: 52, category: 'TENSION' }, // -8
      { country_code: 'ZZ', conflict_day: 9, expressed_score: 10, category: null },
      { country_code: 'ZZ', conflict_day: 10, expressed_score: 18, category: null }, // +8 (tie, later -> loses)
    ];
    assert.deepEqual(sel!.pickBiggestMove(rows, 10, 9, NAMES), { countryCode: 'IL', countryName: 'Israel', delta: -8, newScore: 52, category: 'TENSION' });
    const zz = sel!.pickBiggestMove(rows.filter((r) => r.country_code === 'ZZ'), 10, 9, NAMES);
    assert.deepEqual(zz, { countryCode: 'ZZ', countryName: 'ZZ', delta: 8, newScore: 18, category: 'STABLE' });
    assert.equal(sel!.pickBiggestMove([], 10, 9, NAMES), null);
  });

  // ---- 2. templates (defence in depth) -------------------------------------------------------------------
  for (const [label, path] of [['Deno _shared/digest-template.ts', denoTemplatePath], ['Next lib/email/templates/daily-digest.ts', nextTemplatePath]] as const) {
    let tpl: TemplateFn | null = null;
    await check(`${label}: loads`, async () => {
      tpl = (await import(path)).dailyDigestTemplate as TemplateFn;
      assert.equal(typeof tpl, 'function');
    });
    for (const m of WITHHELD_MOVES) {
      await check(`${label}: refuses to render a withheld move ${m.countryCode}/${m.countryName}`, () => {
        assert.ok(tpl, 'template missing');
        const { subject, html } = tpl!(baseDigest(m), 'https://example.test');
        assertNoWithheldRender(html, subject, m);
        assert.ok(html.includes('BRENT CRUDE'), 'rest of the digest still rendered');
      });
    }
    await check(`${label}: still renders an allowed move (IR)`, () => {
      assert.ok(tpl, 'template missing');
      const { html } = tpl!(baseDigest({ countryCode: 'IR', countryName: 'Iran', delta: 5.3, newScore: 55, category: 'TENSION' }), 'https://example.test');
      assert.ok(html.includes('BIGGEST MOVE') && html.includes('Iran') && html.includes('[TENSION]') && html.includes('→ 55'));
    });
  }
}

main()
  .catch((e) => {
    fail++;
    console.log('FAIL unexpected error', e);
  })
  .finally(() => {
    console.log(`\n${pass + fail} checks: ${pass} passed, ${fail} failed`);
    process.exit(fail ? 1 : 0);
  });
