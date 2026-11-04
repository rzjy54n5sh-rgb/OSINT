/**
 * Operator scenario notice (lib/scenario-notice.ts + components/scenarios/ScenarioNotice.tsx): the
 * platform_alerts row key = 'scenario_notice' shown on /scenarios (full panel) and on the home scenario
 * card (one line linking to /scenarios). Asserts: inactive → nothing; expired (expires_at <= now) →
 * nothing; any read failure (error, rejection, synchronous throw, hang past the timeout) → nothing and
 * no throw; Arabic in a dir="rtl" lang="ar" block; title/message rendered as escaped text with line breaks
 * kept; the updated stamp in UTC; bidi override/isolate controls stripped; an English edit in the admin
 * clears the stale Arabic. `now` is always injected: no wall clock, no live data.
 *
 *   npx --yes tsx@4.23.13 tests/unit/scenario-notice.check.ts
 *
 * TZ is pinned to a non-UTC zone (before any Date use) so a local-time getter in the formatter fails
 * here even on a UTC CI runner. The process exits non-zero unless every check ran to the end (a
 * never-settling promise empties the event loop and would otherwise exit 0 before the summary).
 */
process.env.TZ = 'Asia/Dubai';
process.exitCode = 1;
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import Module from 'node:module';
import {
  SCENARIO_NOTICE_KEY,
  formatNoticeUpdated,
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
  activated_at: '2026-10-30T08:00:00Z',
  updated_at: '2026-11-04T05:10:33Z',
  expires_at: null,
  ...over,
});

type Seen = { table?: string; cols?: string; eq: [string, unknown][]; signal?: AbortSignal };
/** Minimal PostgREST builder double: from().select().eq().abortSignal().maybeSingle() → `result(signal)`. Records what was asked. */
function fakeClient(result: (signal?: AbortSignal) => unknown, seen: Seen = { eq: [] }): ScenarioNoticeClient {
  const builder = {
    select: (cols: string) => {
      seen.cols = cols;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      seen.eq.push([col, val]);
      return builder;
    },
    abortSignal: (sig: AbortSignal) => {
      seen.signal = sig;
      return builder;
    },
    maybeSingle: () => result(seen.signal),
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
ok('TZ is pinned to a non-UTC zone for this run (local getters differ from UTC getters)', () => {
  assert.equal(new Date('2026-11-04T05:10:33Z').getHours(), 9, 'Asia/Dubai is UTC+4');
});

ok('active row: reads platform_alerts key=scenario_notice and renders title, message and updated stamp', async () => {
  const seen: Seen = { eq: [] };
  const notice = await getScenarioNotice(fakeClient(resolves(row()), seen), NOW);
  assert.equal(seen.table, 'platform_alerts');
  assert.deepEqual(seen.eq.find(([c]) => c === 'key'), ['key', 'scenario_notice']);
  assert.ok(seen.cols?.split(',').map((c) => c.trim()).includes('updated_at'), 'selects updated_at');
  assert.ok(notice);
  const html = panel(notice);
  assert.match(html, /data-testid="scenario-notice"/);
  assert.match(html, /Scenario model paused/);
  assert.match(html, /No market passes the quality floor\.\nThe model resumes when one does\./, 'line break kept in the text');
  assert.match(html, /Updated 4 Nov 2026, 05:10 UTC/, 'stamp is updated_at (an admin edit moves it), not activated_at');
  assert.match(html, /<time dateTime="2026-11-04T05:10:33Z"/);
  assert.doesNotMatch(html, /Posted|30 Oct/);
  assert.match(html, /aria-labelledby="scenario-notice-h"/);
  assert.match(html, /<h2 id="scenario-notice-h"/);
  assert.doesNotMatch(html, /dir="rtl"/, 'no Arabic block without message_ar');
});

ok('updated stamp is UTC and deterministic', () => {
  assert.equal(formatNoticeUpdated('2026-11-04T05:10:33Z'), 'Updated 4 Nov 2026, 05:10 UTC');
  assert.equal(formatNoticeUpdated('2026-01-09T23:59:00+02:00'), 'Updated 9 Jan 2026, 21:59 UTC');
  // 22:30 UTC is already the next day (and 02:30) in Asia/Dubai: a local getter would change both.
  assert.equal(formatNoticeUpdated('2026-12-31T22:30:00Z'), 'Updated 31 Dec 2026, 22:30 UTC');
  assert.equal(formatNoticeUpdated(null), null);
  assert.equal(formatNoticeUpdated('not a date'), null);
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

ok('read timeout → nothing, within the timeout (hard cap even when the client ignores the abort)', async () => {
  const t0 = Date.now();
  const notice = await getScenarioNotice(fakeClient(() => new Promise(() => {})), NOW, { timeoutMs: 30 });
  assert.equal(notice, null);
  assert.ok(Date.now() - t0 < 1000, 'resolved by the timeout, not left hanging');
});

ok('the query carries an AbortSignal that fires at the timeout (the request itself is cancelled)', async () => {
  const seen: Seen = { eq: [] };
  let abortedReject = false;
  const pending = (signal?: AbortSignal) =>
    new Promise((_resolve, reject) => {
      signal?.addEventListener('abort', () => {
        abortedReject = true;
        reject(signal.reason);
      });
    });
  const notice = await getScenarioNotice(fakeClient(pending, seen), NOW, { timeoutMs: 30 });
  assert.equal(notice, null);
  assert.ok(seen.signal instanceof AbortSignal, 'abortSignal() was called on the builder');
  for (let i = 0; i < 40 && !seen.signal.aborted; i++) await new Promise((r) => setTimeout(r, 10));
  assert.equal(seen.signal.aborted, true, 'signal aborted after timeoutMs');
  assert.equal(abortedReject, true, 'the pending request saw the abort');
});

// --- Arabic and escaping -----------------------------------------------------------------------
ok('Arabic block rendered with dir="rtl" lang="ar"', () => {
  const notice = scenarioNoticeFromRow(row({ message_ar: 'النموذج متوقف مؤقتاً.\nسطر ثانٍ' }), NOW);
  const html = panel(notice);
  assert.match(html, /<div[^>]*dir="rtl"[^>]*lang="ar"[^>]*>|<div[^>]*lang="ar"[^>]*dir="rtl"[^>]*>/);
  assert.ok(html.includes('النموذج متوقف مؤقتاً.\nسطر ثانٍ'));
  assert.equal(scenarioNoticeFromRow(row({ message_ar: '   ' }), NOW)?.messageAr, null, 'blank Arabic → no block');
});

ok('Arabic-only row (title and message empty, message_ar set) → nothing, by design', async () => {
  const r = row({ title: '', message: null, message_ar: 'النموذج متوقف مؤقتاً.' });
  assert.equal(scenarioNoticeFromRow(r, NOW), null);
  const notice = await getScenarioNotice(fakeClient(resolves(r)), NOW);
  assert.equal(notice, null);
  assert.equal(panel(notice), '');
  assert.equal(line(notice), '');
});

ok('bidi override/isolate controls (U+202A–U+202E, U+2066–U+2069) are stripped from all three texts', () => {
  const ctl = ['\u202A', '\u202B', '\u202C', '\u202D', '\u202E', '\u2066', '\u2067', '\u2068', '\u2069'];
  const notice = scenarioNoticeFromRow(
    row({
      title: '\u202EScenario D\u202C event',
      message: 'Line one \u2066isolated\u2069\nLine \u202Atwo\u202C',
      message_ar: '\u2067النموذج\u2069 متوقف \u202Bمؤقتاً\u202C',
    }),
    NOW,
  );
  assert.ok(notice);
  assert.equal(notice.title, 'Scenario D event');
  assert.equal(notice.message, 'Line one isolated\nLine two');
  assert.equal(notice.messageAr, 'النموذج متوقف مؤقتاً');
  for (const html of [panel(notice), line(notice)]) for (const c of ctl) assert.ok(!html.includes(c), `no U+${c.codePointAt(0)?.toString(16).toUpperCase()} in HTML`);
  // A field made only of controls is blank.
  assert.equal(scenarioNoticeFromRow(row({ title: '\u202E\u202C', message: '\u2066 \u2069' }), NOW), null);
  // Ordinary RTL text and the implicit marks (LRM/RLM, not overrides) survive.
  assert.equal(scenarioNoticeFromRow(row({ message_ar: 'اليوم\u200F 249' }), NOW)?.messageAr, 'اليوم\u200F 249');
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
ok('home line: links to /scenarios, title (or first message line) only', () => {
  const html = line(scenarioNoticeFromRow(row(), NOW));
  assert.match(html, /data-testid="home-scenario-notice"/);
  assert.match(html, /href="\/scenarios"/);
  assert.match(html, /Scenario model paused/);
  assert.doesNotMatch(html, /The model resumes/);
  const untitled = line(scenarioNoticeFromRow(row({ title: null }), NOW));
  assert.match(untitled, /No market passes the quality floor\./);
  assert.doesNotMatch(untitled, /The model resumes/);
});

ok('home line CSS: 2-line clamp (no single-line nowrap/ellipsis); label and link never shrink', () => {
  const css = readFileSync(join(__dirname, '../../components/scenarios/notice.module.css'), 'utf8');
  const rule = (sel: string) => {
    const m = css.match(new RegExp(`\\.${sel}\\s*\\{([^}]*)\\}`));
    assert.ok(m, `.${sel} rule present`);
    return m[1].replace(/\s+/g, ' ');
  };
  const t = rule('lineText');
  assert.match(t, /-webkit-line-clamp:\s*2/);
  assert.match(t, /display:\s*-webkit-box/);
  assert.match(t, /-webkit-box-orient:\s*vertical/);
  assert.match(t, /overflow:\s*hidden/);
  assert.match(t, /white-space:\s*normal/);
  assert.doesNotMatch(t, /nowrap|text-overflow/);
  assert.match(rule('label'), /flex:\s*none/);
  assert.match(rule('lineLink'), /flex:\s*none/);
});

// --- admin edit clears the stale Arabic --------------------------------------------------------
// The server action is loaded with its dependencies stubbed (auth, service-role client, revalidate):
// the real auth and audit-log steps run against a recording double. No network, no DB.
type Call = { table: string; op: string; values?: unknown; cols?: string; eq: [string, unknown][] };
let adminCalls: Call[] = [];
let adminRole = 'SUPER_ADMIN';
let currentUser: { id: string; email: string } | null = { id: 'u-1', email: 'ops@example.test' };
const adminClient = {
  from(table: string) {
    const call: Call = { table, op: '', eq: [] };
    adminCalls.push(call);
    const b = {
      select(cols: string) {
        call.op = 'select';
        call.cols = cols;
        return b;
      },
      update(values: unknown) {
        call.op = 'update';
        call.values = values;
        return b;
      },
      insert(values: unknown) {
        call.op = 'insert';
        call.values = values;
        return Promise.resolve({ error: null });
      },
      eq(col: string, val: unknown) {
        call.eq.push([col, val]);
        return call.op === 'update' ? Promise.resolve({ error: null }) : b;
      },
      single: () => Promise.resolve({ data: table === 'admin_users' ? { id: 'adm-1', role: adminRole, email: 'ops@example.test' } : null, error: null }),
      // Returns only the columns the action selected (so the audit before_state is what was really read).
      maybeSingle: () => {
        const stored: Record<string, unknown> = { title: 'Old title', message: 'Old message', message_ar: 'نص قديم' };
        const cols = (call.cols ?? '').split(',').map((c) => c.trim());
        return Promise.resolve({ data: Object.fromEntries(cols.filter((c) => c in stored).map((c) => [c, stored[c]])), error: null });
      },
    };
    return b;
  },
};
const stub = (spec: string, exports: Record<string, unknown>) => {
  const file = require.resolve(spec);
  const m = new Module(file);
  m.filename = file;
  m.loaded = true;
  m.exports = exports;
  require.cache[file] = m;
};
stub('../../utils/supabase/server', { getUser: async () => currentUser });
stub('../../utils/supabase/admin', { createAdminClient: () => adminClient });
stub('next/cache', { revalidatePath: () => {} });
const { editAlertAction } = require('../../app/(admin)/admin/alerts/actions') as typeof import('../../app/(admin)/admin/alerts/actions');
const reset = (role = 'SUPER_ADMIN', user: typeof currentUser = { id: 'u-1', email: 'ops@example.test' }) => {
  adminCalls = [];
  adminRole = role;
  currentUser = user;
};

ok('admin edit of scenario_notice sets message_ar = null in the same update; audit log still written', async () => {
  reset();
  assert.deepEqual(await editAlertAction(SCENARIO_NOTICE_KEY, 'New title', 'New message'), { ok: true });
  const updates = adminCalls.filter((c) => c.table === 'platform_alerts' && c.op === 'update');
  assert.equal(updates.length, 1, 'one update');
  const v = updates[0].values as Record<string, unknown>;
  assert.equal(v.title, 'New title');
  assert.equal(v.message, 'New message');
  assert.ok('message_ar' in v && v.message_ar === null, 'message_ar cleared in the same update');
  assert.deepEqual(updates[0].eq, [['key', SCENARIO_NOTICE_KEY]]);
  const audit = adminCalls.filter((c) => c.table === 'admin_audit_log' && c.op === 'insert');
  assert.equal(audit.length, 1, 'audit log written');
  const a = audit[0].values as Record<string, unknown>;
  assert.equal(a.action_type, 'ALERT_BANNER_EDIT');
  assert.equal((a.after_state as Record<string, unknown>).message_ar, null, 'audit after_state records the clear');
  assert.equal((a.before_state as Record<string, unknown>).message_ar, 'نص قديم', 'audit before_state keeps the cleared Arabic');
});

ok('admin edit of any other alert leaves message_ar alone', async () => {
  reset();
  assert.deepEqual(await editAlertAction('pipeline_failure', 'T', 'M'), { ok: true });
  const v = adminCalls.find((c) => c.table === 'platform_alerts' && c.op === 'update')?.values as Record<string, unknown>;
  assert.ok(v);
  assert.ok(!('message_ar' in v), 'no message_ar key in the update');
});

ok('admin edit auth unchanged: no user → Unauthorized, wrong role → Forbidden, and no write either way', async () => {
  reset('SUPER_ADMIN', null);
  assert.deepEqual(await editAlertAction(SCENARIO_NOTICE_KEY, 'x', 'y'), { ok: false, error: 'Unauthorized' });
  assert.equal(adminCalls.filter((c) => c.op === 'update' || c.op === 'insert').length, 0);
  reset('FINANCE_MANAGER');
  assert.deepEqual(await editAlertAction(SCENARIO_NOTICE_KEY, 'x', 'y'), { ok: false, error: 'Forbidden' });
  assert.equal(adminCalls.filter((c) => c.op === 'update' || c.op === 'insert').length, 0);
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

process.on('exit', () => {
  if (n !== checks.length) console.error(`\nFAIL only ${n} of ${checks.length} checks completed (a check never settled)`);
});
(async () => {
  let failed = 0;
  for (const c of checks) {
    try {
      await c.fn();
      console.log(`PASS ${c.label}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${c.label}\n  ${e instanceof Error ? e.message.split('\n')[0] : String(e)}`);
    }
    n++;
  }
  if (failed > 0 || n !== checks.length) {
    console.error(`\n${failed} of ${checks.length} checks failed`);
    process.exit(1);
  }
  console.log(`\n${n} checks passed`);
  process.exitCode = 0;
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
