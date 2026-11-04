/**
 * Operator scenario notice (lib/scenario-notice.ts + components/scenarios/ScenarioNotice.tsx): the
 * platform_alerts row key = 'scenario_notice' shown on /scenarios (full panel) and on the home scenario
 * card (one line linking to /scenarios). Asserts: inactive → nothing; expired (expires_at <= now) →
 * nothing; any read failure (error, rejection, synchronous throw, hang past the timeout) → nothing and
 * no throw; Arabic in a dir="rtl" lang="ar" block; title/message rendered as escaped text with line breaks
 * kept; the posted stamp in UTC. `now` is always injected: no wall clock, no live data.
 *
 *   npx --yes tsx@4.23.13 tests/unit/scenario-notice.check.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  SCENARIO_NOTICE_KEY,
  formatNoticePosted,
  getScenarioNotice,
  scenarioNoticeFromRow,
  type ScenarioNotice,
  type ScenarioNoticeClient,
} from '../../lib/scenario-notice';

// tsconfig has jsx: "preserve", so tsx compiles JSX with the classic runtime: expose React first.
(globalThis as { React?: typeof React }).React = React;
const { createElement } = React;
// CSS modules: under plain Node a class lookup returns its own name.
require.extensions['.css'] = (m: NodeJS.Module) => {
  m.exports = new Proxy({}, { get: (_t, k) => (k === '__esModule' ? undefined : String(k)) });
};
const { ScenarioNoticePanel, ScenarioNoticeLine } =
  require('../../components/scenarios/ScenarioNotice') as typeof import('../../components/scenarios/ScenarioNotice');

let n = 0;
const checks: { label: string; fn: () => void | Promise<void> }[] = [];
const ok = (label: string, fn: () => void | Promise<void>) => checks.push({ label, fn });

const NOW = new Date('2026-11-04T12:00:00Z');
const row = (over: Record<string, unknown> = {}) => ({
  key: SCENARIO_NOTICE_KEY,
  title: 'Scenario model paused',
  message: 'No market passes the quality floor.\nThe model resumes when one does.',
  message_ar: null,
  is_active: true,
  activated_at: '2026-11-04T05:10:33Z',
  expires_at: null,
  ...over,
});

/** Minimal PostgREST builder double: from().select().eq().maybeSingle() → `result()`. Records the key asked for. */
function fakeClient(result: () => unknown, seen: { table?: string; eq: [string, unknown][] } = { eq: [] }): ScenarioNoticeClient {
  const builder = {
    select: () => builder,
    eq: (col: string, val: unknown) => {
      seen.eq.push([col, val]);
      return builder;
    },
    maybeSingle: () => result(),
  };
  return {
    from: (t: string) => {
      seen.table = t;
      return builder;
    },
  } as unknown as ScenarioNoticeClient;
}
const resolves = (data: unknown, error: unknown = null) => () => Promise.resolve({ data, error });

const panel = (n: ScenarioNotice | null) => renderToStaticMarkup(createElement(ScenarioNoticePanel, { notice: n }));
const line = (n: ScenarioNotice | null) => renderToStaticMarkup(createElement(ScenarioNoticeLine, { notice: n }));

// --- active row --------------------------------------------------------------------------------
ok('active row: reads platform_alerts key=scenario_notice and renders title, message and posted stamp', async () => {
  const seen: { table?: string; eq: [string, unknown][] } = { eq: [] };
  const notice = await getScenarioNotice(fakeClient(resolves(row()), seen), NOW);
  assert.equal(seen.table, 'platform_alerts');
  assert.deepEqual(seen.eq.find(([c]) => c === 'key'), ['key', 'scenario_notice']);
  assert.ok(notice);
  const html = panel(notice);
  assert.match(html, /data-testid="scenario-notice"/);
  assert.match(html, /Scenario model paused/);
  assert.match(html, /No market passes the quality floor\.\nThe model resumes when one does\./, 'line break kept in the text');
  assert.match(html, /Posted 4 Nov 2026, 05:10 UTC/);
  assert.match(html, /<time dateTime="2026-11-04T05:10:33Z"/);
  assert.match(html, /aria-labelledby="scenario-notice-h"/);
  assert.match(html, /<h2 id="scenario-notice-h"/);
  assert.doesNotMatch(html, /dir="rtl"/, 'no Arabic block without message_ar');
});

ok('posted stamp is UTC and deterministic', () => {
  assert.equal(formatNoticePosted('2026-11-04T05:10:33Z'), 'Posted 4 Nov 2026, 05:10 UTC');
  assert.equal(formatNoticePosted('2026-01-09T23:59:00+02:00'), 'Posted 9 Jan 2026, 21:59 UTC');
  assert.equal(formatNoticePosted(null), null);
  assert.equal(formatNoticePosted('not a date'), null);
});

// --- inactive / expired / empty ----------------------------------------------------------------
ok('inactive → nothing', async () => {
  assert.equal(scenarioNoticeFromRow(row({ is_active: false }), NOW), null);
  const notice = await getScenarioNotice(fakeClient(resolves(row({ is_active: false }))), NOW);
  assert.equal(notice, null);
  assert.equal(panel(notice), '');
  assert.equal(line(notice), '');
});

ok('no row (RLS hides inactive rows) → nothing', async () => {
  assert.equal(await getScenarioNotice(fakeClient(resolves(null)), NOW), null);
});

ok('expired → nothing; expires_at == now counts as expired; future or null expiry renders', () => {
  assert.equal(scenarioNoticeFromRow(row({ expires_at: '2026-11-04T11:59:00Z' }), NOW), null);
  assert.equal(scenarioNoticeFromRow(row({ expires_at: '2026-11-04T12:00:00Z' }), NOW), null);
  assert.equal(scenarioNoticeFromRow(row({ expires_at: 'garbage' }), NOW), null, 'an unreadable expiry fails closed');
  assert.ok(scenarioNoticeFromRow(row({ expires_at: '2026-11-04T12:01:00Z' }), NOW));
  assert.ok(scenarioNoticeFromRow(row({ expires_at: null }), NOW));
  // Same row, later `now`: the result depends only on the injected clock.
  assert.equal(scenarioNoticeFromRow(row({ expires_at: '2026-11-05T00:00:00Z' }), new Date('2026-11-06T00:00:00Z')), null);
});

ok('blank title and message → nothing', () => {
  assert.equal(scenarioNoticeFromRow(row({ title: '  ', message: '' }), NOW), null);
  assert.equal(scenarioNoticeFromRow({ is_active: true }, NOW), null);
  assert.equal(scenarioNoticeFromRow(null, NOW), null);
  assert.equal(scenarioNoticeFromRow('nope', NOW), null);
});

// --- read failures never throw -----------------------------------------------------------------
ok('read error → nothing (PostgREST error object)', async () => {
  assert.equal(await getScenarioNotice(fakeClient(resolves(null, { message: 'permission denied' })), NOW), null);
});

ok('read error → nothing (rejected promise)', async () => {
  assert.equal(await getScenarioNotice(fakeClient(() => Promise.reject(new Error('fetch failed'))), NOW), null);
});

ok('read error → nothing (synchronous throw in the client)', async () => {
  const throwing = {
    from: () => {
      throw new Error('boom');
    },
  } as unknown as ScenarioNoticeClient;
  assert.equal(await getScenarioNotice(throwing, NOW), null);
});

ok('read timeout → nothing, within the timeout', async () => {
  const t0 = Date.now();
  const notice = await getScenarioNotice(fakeClient(() => new Promise(() => {})), NOW, { timeoutMs: 30 });
  assert.equal(notice, null);
  assert.ok(Date.now() - t0 < 1000, 'resolved by the timeout, not left hanging');
});

// --- Arabic and escaping -----------------------------------------------------------------------
ok('Arabic block rendered with dir="rtl" lang="ar"', () => {
  const notice = scenarioNoticeFromRow(row({ message_ar: 'النموذج متوقف مؤقتاً.\nسطر ثانٍ' }), NOW);
  const html = panel(notice);
  assert.match(html, /<div[^>]*dir="rtl"[^>]*lang="ar"[^>]*>|<div[^>]*lang="ar"[^>]*dir="rtl"[^>]*>/);
  assert.ok(html.includes('النموذج متوقف مؤقتاً.\nسطر ثانٍ'));
  assert.equal(scenarioNoticeFromRow(row({ message_ar: '   ' }), NOW)?.messageAr, null, 'blank Arabic → no block');
});

ok('message text is escaped: a <script> string renders as text', () => {
  const notice = scenarioNoticeFromRow(
    row({ title: '<b>x</b>', message: '<script>alert(1)</script>', message_ar: '<img src=x onerror=alert(1)>' }),
    NOW,
  );
  for (const html of [panel(notice), line(notice)]) {
    assert.doesNotMatch(html, /<script/i);
    assert.doesNotMatch(html, /<img/i);
    assert.doesNotMatch(html, /<b>/);
  }
  const html = panel(notice);
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'));
  assert.ok(html.includes('&lt;b&gt;x&lt;/b&gt;'));
});

// --- compact home line ------------------------------------------------------------------------
ok('home line: one line, links to /scenarios, title (or first message line) only', () => {
  const html = line(scenarioNoticeFromRow(row(), NOW));
  assert.match(html, /data-testid="home-scenario-notice"/);
  assert.match(html, /href="\/scenarios"/);
  assert.match(html, /Scenario model paused/);
  assert.doesNotMatch(html, /The model resumes/);
  const untitled = line(scenarioNoticeFromRow(row({ title: null }), NOW));
  assert.match(untitled, /No market passes the quality floor\./);
  assert.doesNotMatch(untitled, /The model resumes/);
});

// --- wiring (static) --------------------------------------------------------------------------
ok('wiring: /scenarios and home read the notice through the public client; no cookies', () => {
  const root = join(__dirname, '../..');
  for (const f of ['app/scenarios/page.tsx', 'app/page.tsx']) {
    const src = readFileSync(join(root, f), 'utf8');
    assert.match(src, /getScenarioNotice\(supabase, new Date\(\)\)/, `${f} reads the notice`);
    assert.match(src, /createPublicClient\(\)/, `${f} uses the cookie-less client`);
    assert.doesNotMatch(src, /next\/headers|cookies\(\)/, `${f} must not read cookies (ISR)`);
  }
  const lib = readFileSync(join(root, 'lib/scenario-notice.ts'), 'utf8');
  assert.doesNotMatch(lib, /dangerouslySetInnerHTML/);
  const comp = readFileSync(join(root, 'components/scenarios/ScenarioNotice.tsx'), 'utf8');
  assert.doesNotMatch(comp, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(comp, /^'use client'/m, 'server-safe component');
});

(async () => {
  for (const c of checks) {
    await c.fn();
    n++;
    console.log(`PASS ${c.label}`);
  }
  console.log(`\n${n} checks passed`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
