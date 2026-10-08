/**
 * Checks for lib/trust-ledgers.ts, lib/desk-identity.ts and the /corrections + /track-record pages.
 * Plain assert script (not *.test.ts, so Playwright ignores it):
 *
 *   npx --yes tsx tests/unit/trust-ledgers.check.ts
 *
 * Supabase is faked by replacing global fetch, so the three page states are exercised without a
 * database: table missing (PGRST205 -> "not yet available"), empty ledger (honest empty state), data.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { scoreForecasts, effectiveResolutions, fetchCorrections, type ForecastRow, type ResolutionRow } from '../../lib/trust-ledgers';
import { identityFields } from '../../lib/desk-identity';
import CorrectionsPage from '../../app/corrections/page';
import TrackRecordPage from '../../app/track-record/page';
import AboutPage from '../../app/about/page';

(globalThis as unknown as { React: typeof React }).React = React;

// --- identity: unset fields are never rendered, no placeholders --------------------------------
assert.deepEqual(identityFields({ editorName: null, editorTitle: null, legalEntity: null, contactEmail: null }), []);
assert.deepEqual(identityFields({ editorName: '  ', editorTitle: 'Editor', legalEntity: null, contactEmail: null }), []);
assert.deepEqual(
  identityFields({ editorName: 'A Name', editorTitle: null, legalEntity: 'Entity Ltd', contactEmail: 'x@example.test' }).map((f) => f.label),
  ['Editor', 'Published by', 'Contact'],
);

// --- scoring ------------------------------------------------------------------------------------
const f = (seq: number, q: string, who: string, p: number, at: string): ForecastRow => ({
  id: `f${seq}`, chain_seq: seq, question_id: q, question_text: `${q}?`, resolution_criteria: 'c', reference_class: null,
  horizon_date: '2026-12-31', forecaster: who, probability: p, created_at: at, row_hash: 'h'.repeat(64),
});
const r = (id: string, q: string, outcome: boolean | null, at: string, supersedes: string | null = null, status: 'resolved' | 'annulled' = 'resolved'): ResolutionRow => ({
  id, question_id: q, status, outcome, resolved_at: at, resolution_source_url: 'https://example.test/r', notes: null, supersedes,
});
const forecasts = [
  f(1, 'Q1', 'desk', 0.8, '2026-10-10T00:00:00Z'),
  f(2, 'Q1', 'desk', 0.6, '2026-10-11T00:00:00Z'), // later update before resolution -> this one counts
  f(3, 'Q1', 'market:polymarket', 0.3, '2026-10-11T00:00:00Z'),
  f(4, 'Q2', 'desk', 0.2, '2026-10-10T00:00:00Z'),
  f(5, 'Q3', 'desk', 0.9, '2026-10-10T00:00:00Z'), // annulled -> not scored
  f(6, 'Q4', 'desk', 0.5, '2026-10-10T00:00:00Z'), // open -> not scored
  f(7, 'Q2', 'desk', 0.99, '2026-10-21T00:00:00Z'), // after resolution -> ignored
];
const resolutions = [
  r('r1', 'Q1', false, '2026-10-15T00:00:00Z'),
  r('r1b', 'Q1', true, '2026-10-15T00:00:00Z', 'r1'), // supersedes r1 -> Q1 resolved YES
  r('r2', 'Q2', false, '2026-10-20T00:00:00Z'),
  r('r3', 'Q3', null, '2026-10-20T00:00:00Z', null, 'annulled'),
];
assert.equal(effectiveResolutions(resolutions).get('Q1')?.id, 'r1b');
const { scored, perForecaster } = scoreForecasts(forecasts, resolutions);
assert.equal(scored.length, 3);
const desk = perForecaster.find((s) => s.forecaster === 'desk')!;
assert.equal(desk.questions, 2);
// desk: Q1 p=0.6 outcome 1 -> 0.16 ; Q2 p=0.2 outcome 0 -> 0.04 ; mean 0.10
assert.ok(Math.abs(desk.brier - 0.1) < 1e-12, `desk brier ${desk.brier}`);
const mkt = perForecaster.find((s) => s.forecaster === 'market:polymarket')!;
assert.ok(Math.abs(mkt.brier - 0.49) < 1e-12, `market brier ${mkt.brier}`); // (0.3-1)^2
assert.deepEqual(scoreForecasts([], []), { scored: [], perForecaster: [] });

// --- fake Supabase ------------------------------------------------------------------------------
type Route = (url: URL) => { status: number; body: unknown } | null;
function fakeFetch(route: Route) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const hit = route(url) ?? { status: 404, body: { code: 'PGRST205', message: `Could not find the table '${url.pathname}' in the schema cache` } };
    return new Response(JSON.stringify(hit.body), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
}
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake.supabase.test';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon';

async function html(el: Promise<React.ReactElement> | React.ReactElement) {
  return renderToString(await el).replace(/<!-- -->/g, '');
}

(async () => {
  // 1. tables missing (migration not applied): neutral note, no crash, no claim that the rule is enforced
  fakeFetch(() => null);
  assert.deepEqual(await fetchCorrections(), { status: 'unavailable', reason: 'not_deployed' });
  let out = await html(CorrectionsPage());
  assert.match(out, /corrections log is not yet available/);
  assert.doesNotMatch(out, /database itself refuses/);
  out = await html(TrackRecordPage());
  assert.match(out, /forecast ledger is not yet available/);
  assert.doesNotMatch(out, /runs the check each time/);

  // 2. Supabase down (network error): still renders
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  out = await html(CorrectionsPage());
  assert.match(out, /could not be loaded just now/);

  // 3. empty ledgers: honest empty states
  fakeFetch((u) => (u.pathname.startsWith('/rest/v1/rpc/') ? { status: 200, body: null } : { status: 200, body: [] }));
  out = await html(CorrectionsPage());
  assert.match(out, /No corrections logged yet\. The log started on 9 October 2026\./);
  assert.match(out, /database itself refuses/);
  out = await html(TrackRecordPage());
  assert.match(out, /No forecasts have been registered yet\. Pre-registration starts with the first Chokepoint Weekly/);

  // 4. data present
  fakeFetch((u) => {
    if (u.pathname === '/rest/v1/corrections')
      return { status: 200, body: [{ id: 'c1', created_at: '2026-10-09T10:00:00Z', target_table: 'daily_briefings', target_id: 'b1', conflict_day: 223, report_type: 'general', correction_class: 'material', summary: 'Fixed <script>x</script> figure', before_excerpt: 'old', after_excerpt: 'new' }] };
    if (u.pathname === '/rest/v1/forecast_ledger') return { status: 200, body: forecasts.slice(0, 6) };
    if (u.pathname === '/rest/v1/forecast_resolutions') return { status: 200, body: resolutions };
    if (u.pathname === '/rest/v1/rpc/verify_forecast_chain') return { status: 200, body: null };
    return null;
  });
  out = await html(CorrectionsPage());
  assert.match(out, /href="\/briefings\/223\/general"/);
  assert.match(out, /MATERIAL/);
  assert.doesNotMatch(out, /<script>x<\/script>/); // escaped by React
  out = await html(TrackRecordPage());
  assert.match(out, /Ledger hash chain verified/);
  assert.match(out, /0\.100/); // desk Brier
  assert.match(out, /0\.490/); // market Brier
  assert.match(out, /Q4\?/); // open forecast listed

  // 5. broken chain is shown, not hidden
  fakeFetch((u) => {
    if (u.pathname === '/rest/v1/forecast_ledger') return { status: 200, body: forecasts.slice(0, 2) };
    if (u.pathname === '/rest/v1/forecast_resolutions') return { status: 200, body: [] };
    if (u.pathname === '/rest/v1/rpc/verify_forecast_chain') return { status: 200, body: { chain_seq: 2, problem: 'row_hash_mismatch' } };
    return null;
  });
  out = await html(TrackRecordPage());
  assert.match(out, /Hash chain check FAILED at entry 2 \(row_hash_mismatch\)/);

  // 6. /about prints no identity block while all identity fields are null
  out = await html(AboutPage());
  assert.doesNotMatch(out, /WHO IS RESPONSIBLE/);

  console.log('trust-ledgers.check: all assertions passed');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
