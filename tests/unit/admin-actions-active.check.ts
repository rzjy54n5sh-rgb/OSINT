/**
 * Every admin server action requires an ACTIVE admin (CLAUDE.md Critical Rule 5, CVE-2025-29927).
 * A server action can be POSTed to any path, so the path-based /admin middleware gate is not a defence:
 * each action must itself verify getUser → admin_users row → is_active === true → role.
 *
 * For each action below: an active admin with an allowed role gets past auth (reaches the action's first
 * data call); is_active false / null / missing → { ok: false, error: 'Forbidden' } with ZERO writes
 * (update / insert / upsert / delete / rpc), no audit row and no data read beyond the auth lookup.
 * The admin_users double projects only the columns the action selected, so an action that stops selecting
 * is_active fails closed here too. No network, no DB.
 * (app/(admin)/admin/alerts/actions.ts is covered by tests/unit/scenario-notice.check.ts.)
 *
 *   npx --yes tsx@4.23.13 tests/unit/admin-actions-active.check.ts
 *
 * The process exits non-zero unless every check ran to the end.
 */
process.exitCode = 1;
import assert from 'node:assert/strict';
import Module from 'node:module';

let n = 0;
const checks: { label: string; fn: () => void | Promise<void> }[] = [];
const ok = (label: string, fn: () => void | Promise<void>) => checks.push({ label, fn });

// --- recording service-role client double ------------------------------------------------------
type Call = { table: string; op: string; values?: unknown; cols?: string; eq: [string, unknown][] };
const WRITES = new Set(['update', 'insert', 'upsert', 'delete', 'rpc']);
let calls: Call[] = [];
let fetches = 0;
let adminRow: Record<string, unknown> = {};
let currentUser: { id: string; email: string } | null = null;

const AUTH_USER = { id: 'u-1', email: 'ops@example.test' };
const done = { data: null, error: null };

const adminClient = {
  rpc(fn: string, args?: unknown) {
    calls.push({ table: `rpc:${fn}`, op: 'rpc', values: args, eq: [] });
    return Promise.resolve(done);
  },
  from(table: string) {
    const call: Call = { table, op: '', eq: [] };
    calls.push(call);
    const settle = () => Promise.resolve(done);
    const b = {
      select(cols: string) {
        if (!call.op) call.op = 'select';
        call.cols = cols;
        return b;
      },
      update(values: unknown) {
        call.op = 'update';
        call.values = values;
        return b;
      },
      upsert(values: unknown) {
        call.op = 'upsert';
        call.values = values;
        return b;
      },
      delete() {
        call.op = 'delete';
        return b;
      },
      insert(values: unknown) {
        call.op = 'insert';
        call.values = values;
        return Object.assign(settle(), b);
      },
      eq(col: string, val: unknown) {
        call.eq.push([col, val]);
        return call.op === 'select' ? b : Object.assign(settle(), b);
      },
      // The auth lookup: admin_users by user_id (a row exists only for AUTH_USER). Projects only the selected columns.
      single: () => {
        const byUser = call.eq.some(([c, v]) => c === 'user_id' && v === AUTH_USER.id); // the admin row belongs to AUTH_USER only
        if (table !== 'admin_users' || !byUser) return Promise.resolve({ data: null, error: { message: 'no rows' } });
        const cols = (call.cols ?? '').split(',').map((c) => c.trim());
        return Promise.resolve({ data: Object.fromEntries(cols.filter((c) => c in adminRow).map((c) => [c, adminRow[c]])), error: null });
      },
      // Every data read after auth finds nothing: each action stops at its own "not found" (or carries on).
      maybeSingle: () => Promise.resolve(done),
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
globalThis.fetch = (async () => {
  fetches++;
  throw new Error('no network in this check');
}) as typeof fetch;

const admins = require('../../app/(admin)/admin/admins/actions') as typeof import('../../app/(admin)/admin/admins/actions');
const apiKeys = require('../../app/(admin)/admin/api-keys/actions') as typeof import('../../app/(admin)/admin/api-keys/actions');
const config = require('../../app/(admin)/admin/config/actions') as typeof import('../../app/(admin)/admin/config/actions');
const disputes = require('../../app/(admin)/admin/disputes/actions') as typeof import('../../app/(admin)/admin/disputes/actions');
const feed = require('../../app/(admin)/admin/feed/actions') as typeof import('../../app/(admin)/admin/feed/actions');
const payments = require('../../app/(admin)/admin/payments/actions') as typeof import('../../app/(admin)/admin/payments/actions');
const subscriptions = require('../../app/(admin)/admin/subscriptions/actions') as typeof import('../../app/(admin)/admin/subscriptions/actions');

const reset = (role: string, active: unknown, opts: { omitActive?: boolean; user?: typeof currentUser } = {}) => {
  calls = [];
  fetches = 0;
  currentUser = opts.user === undefined ? AUTH_USER : opts.user;
  adminRow = { id: 'adm-1', role, email: 'ops@example.test' };
  if (!opts.omitActive) adminRow.is_active = active;
};
const writes = () => calls.filter((c) => WRITES.has(c.op));
const audits = () => calls.filter((c) => c.table === 'admin_audit_log');

type Case = {
  name: string;
  role: string; // an allowed role for this action
  deniedRole: string; // a role this action already refuses (behaviour unchanged)
  run: () => Promise<{ ok: boolean; error?: string }>;
  /** The first data call after the auth lookup, and what an active admin gets back with an empty DB. */
  firstData: (c: Call) => boolean;
  activeResult: { ok: boolean; error?: string };
};

const cases: Case[] = [
  {
    name: 'addAdminAction',
    role: 'SUPER_ADMIN',
    deniedRole: 'USER_MANAGER',
    run: () => admins.addAdminAction('new@example.test', 'INTEL_ANALYST'),
    firstData: (c) => c.table === 'users' && c.op === 'select',
    activeResult: { ok: false, error: 'No platform user with this email' },
  },
  {
    name: 'deactivateAdminAction',
    role: 'SUPER_ADMIN',
    deniedRole: 'USER_MANAGER',
    run: () => admins.deactivateAdminAction('adm-2'),
    firstData: (c) => c.table === 'admin_users' && c.op === 'select' && c.eq.some(([k, v]) => k === 'id' && v === 'adm-2'),
    activeResult: { ok: false, error: 'Admin not found' },
  },
  {
    name: 'changeAdminRoleAction',
    role: 'SUPER_ADMIN',
    deniedRole: 'INTEL_ANALYST',
    run: () => admins.changeAdminRoleAction('adm-2', 'CONTENT_REVIEWER'),
    firstData: (c) => c.table === 'admin_users' && c.op === 'select' && c.eq.some(([k, v]) => k === 'id' && v === 'adm-2'),
    activeResult: { ok: false, error: 'Admin not found' },
  },
  {
    name: 'revokeApiKeyAction',
    role: 'USER_MANAGER',
    deniedRole: 'FINANCE_MANAGER',
    run: () => apiKeys.revokeApiKeyAction('key-1'),
    firstData: (c) => c.table === 'api_keys' && c.op === 'select',
    activeResult: { ok: false, error: 'Key not found' },
  },
  {
    name: 'updateConfigAction',
    role: 'SUPER_ADMIN',
    deniedRole: 'INTEL_ANALYST',
    run: () => config.updateConfigAction('maintenance_mode', 'true'),
    firstData: (c) => c.table === 'platform_config' && c.op === 'select',
    activeResult: { ok: true },
  },
  {
    name: 'resolveDisputeAction',
    role: 'USER_MANAGER',
    deniedRole: 'CONTENT_REVIEWER',
    run: () => disputes.resolveDisputeAction('disp-1', 'accepted'),
    firstData: (c) => c.table === 'disputes' && c.op === 'select',
    activeResult: { ok: false, error: 'Dispute not found' },
  },
  {
    name: 'flagArticleForReviewAction',
    role: 'INTEL_ANALYST',
    deniedRole: 'FINANCE_MANAGER',
    run: () => feed.flagArticleForReviewAction('art-1'),
    // Its only data call is the audit row itself.
    firstData: (c) => c.table === 'admin_audit_log' && c.op === 'insert',
    activeResult: { ok: true },
  },
  {
    name: 'refundPaymentAction',
    role: 'SUPER_ADMIN',
    deniedRole: 'FINANCE_MANAGER',
    run: () => payments.refundPaymentAction('pay-1', 'duplicate charge'),
    firstData: (c) => c.table === 'payments' && c.op === 'select',
    activeResult: { ok: false, error: 'Payment not found' },
  },
  {
    name: 'cancelSubscriptionAction',
    role: 'USER_MANAGER',
    deniedRole: 'INTEL_ANALYST',
    run: () => subscriptions.cancelSubscriptionAction('sub-1'),
    firstData: (c) => c.table === 'subscriptions' && c.op === 'select',
    activeResult: { ok: false, error: 'Subscription not found' },
  },
];

const FORBIDDEN = { ok: false, error: 'Forbidden' };
const assertNothingDone = (name: string, what: string) => {
  assert.equal(writes().length, 0, `${name} (${what}): no update/insert/upsert/delete/rpc, got ${JSON.stringify(writes().map((c) => `${c.op} ${c.table}`))}`);
  assert.equal(audits().length, 0, `${name} (${what}): no audit row`);
  assert.equal(calls.length, 1, `${name} (${what}): nothing read beyond the auth lookup, got ${JSON.stringify(calls.map((c) => `${c.op} ${c.table}`))}`);
  assert.equal(fetches, 0, `${name} (${what}): no outbound request`);
};

for (const c of cases) {
  ok(`${c.name}: active ${c.role} gets past auth (reaches its first data call)`, async () => {
    reset(c.role, true);
    const res = await c.run();
    const auth = calls[0];
    assert.ok(auth && auth.table === 'admin_users' && auth.eq.some(([k, v]) => k === 'user_id' && v === AUTH_USER.id), 'auth lookup first');
    assert.ok(auth.cols?.split(',').map((s) => s.trim()).includes('is_active'), 'auth lookup selects is_active');
    assert.ok(calls.slice(1).some(c.firstData), `reached its first data call, got ${JSON.stringify(calls.map((x) => `${x.op} ${x.table}`))}`);
    assert.deepEqual(res, c.activeResult);
  });

  ok(`${c.name}: is_active false / null / missing → Forbidden, zero writes, no audit row`, async () => {
    const variants: [string, unknown, boolean][] = [
      ['false', false, false],
      ['null', null, false],
      ['undefined', undefined, false],
      ['column missing', undefined, true],
    ];
    for (const [what, active, omit] of variants) {
      reset(c.role, active, { omitActive: omit });
      assert.deepEqual(await c.run(), FORBIDDEN, `${c.name} with is_active ${what}`);
      assertNothingDone(c.name, `is_active ${what}`);
    }
    // A deactivated SUPER_ADMIN is refused too (not only lesser roles).
    reset('SUPER_ADMIN', false);
    assert.deepEqual(await c.run(), FORBIDDEN, `${c.name}: deactivated SUPER_ADMIN`);
    assertNothingDone(c.name, 'deactivated SUPER_ADMIN');
  });

  ok(`${c.name}: unchanged: no user → Unauthorized; active ${c.deniedRole} → Forbidden; no admin row → Forbidden`, async () => {
    reset(c.role, true, { user: null });
    assert.deepEqual(await c.run(), { ok: false, error: 'Unauthorized' });
    assert.equal(calls.length, 0);
    reset(c.deniedRole, true);
    assert.deepEqual(await c.run(), FORBIDDEN);
    assertNothingDone(c.name, `role ${c.deniedRole}`);
    reset(c.role, true, { user: { id: 'u-not-admin', email: 'x@example.test' } }); // no admin_users row for this user
    assert.deepEqual(await c.run(), FORBIDDEN);
    assertNothingDone(c.name, 'no admin_users row');
  });
}

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
      console.error(`FAIL ${c.label}\n  ${e instanceof Error ? e.message.split('\n').slice(0, 8).join(' | ') : String(e)}`);
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
