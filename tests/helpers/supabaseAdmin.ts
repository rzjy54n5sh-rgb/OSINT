import { mustGetEnv } from './env';

type Json = Record<string, unknown>;

function supabaseBaseUrl(): string {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL ||
    '';
  if (!url) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL for tests');
  return url.replace(/\/$/, '');
}

function serviceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    mustGetEnv('SUPABASE_SERVICE_ROLE_KEY')
  );
}

async function rest<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
  extraHeaders?: Record<string, string>
): Promise<T> {
  const url = `${supabaseBaseUrl()}/rest/v1${path}`;
  const headers: Record<string, string> = {
    apikey: serviceRoleKey(),
    Authorization: `Bearer ${serviceRoleKey()}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...(extraHeaders ?? {}),
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase REST ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

async function authAdmin<T>(
  method: 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${supabaseBaseUrl()}/auth/v1${path}`;
  const headers: Record<string, string> = {
    apikey: serviceRoleKey(),
    Authorization: `Bearer ${serviceRoleKey()}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Supabase Auth ${method} ${path} failed: ${res.status} ${text.slice(0, 500)}`);
  }
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

export type CreatedTestUser = {
  userId: string;
  email: string;
  password: string;
  runTag: string;
};

export async function createConfirmedTestUser(runTag: string): Promise<CreatedTestUser> {
  const stamp = new Date().toISOString().slice(0, 10);
  const rnd = Math.random().toString(16).slice(2, 10);
  const email = `prod-e2e-${stamp}-${rnd}@example.com`;
  const password = `Test!${rnd}aA1`;

  // Some Supabase projects have auth triggers that are sensitive to metadata shape.
  // Try a richer payload first, then fall back to minimal if creation fails.
  let created: { id: string } | null = null;
  const payloads: Array<Record<string, unknown>> = [
    {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        test_run: runTag,
        purpose: 'prod-e2e',
        full_name: `prod-e2e ${stamp}`,
        country: 'AE',
      },
      app_metadata: {
        provider: 'email',
        test_run: runTag,
        purpose: 'prod-e2e',
      },
    },
    {
      email,
      password,
      email_confirm: true,
      app_metadata: { provider: 'email' },
    },
    {
      email,
      password,
      email_confirm: true,
    },
  ];

  let lastErr: unknown;
  for (const p of payloads) {
    try {
      created = await authAdmin<{ id: string }>('POST', '/admin/users', p);
      lastErr = undefined;
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!created) {
    throw lastErr instanceof Error ? lastErr : new Error('Failed to create test user');
  }

  // Ensure public.users row exists (some setups use trigger; still safe to upsert minimal)
  try {
    await rest<Json[]>('PATCH', `/users?id=eq.${created.id}`, { updated_at: new Date().toISOString() });
  } catch {
    // ignore; depends on schema/triggers
  }

  return { userId: created.id, email, password, runTag };
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await authAdmin('DELETE', `/admin/users/${userId}`);
}

export async function deleteTestRowsForUser(userId: string): Promise<void> {
  // Conservative cleanup: delete rows we *might* have created that are directly tied to this user.
  // Only uses user_id filters; does not touch global tables.
  const tables: Array<{ table: string; where: string }> = [
    { table: 'subscriptions', where: `user_id=eq.${userId}` },
    { table: 'payments', where: `user_id=eq.${userId}` },
    { table: 'api_keys', where: `user_id=eq.${userId}` },
  ];
  for (const t of tables) {
    try {
      await rest('DELETE', `/${t.table}?${t.where}`);
    } catch {
      // ignore if table or policy differs
    }
  }
}

export async function getLatestConflictDay(): Promise<number> {
  const url = `${supabaseBaseUrl()}/rest/v1/rpc/get_current_conflict_day`;
  const headers = {
    apikey: serviceRoleKey(),
    Authorization: `Bearer ${serviceRoleKey()}`,
    'Content-Type': 'application/json',
  };
  const res = await fetch(url, { method: 'POST', headers, body: '{}' });
  const text = await res.text();
  if (!res.ok) throw new Error(`RPC get_current_conflict_day failed: ${res.status} ${text.slice(0, 200)}`);
  try {
    const parsed = JSON.parse(text);
    const v = Array.isArray(parsed) ? parsed[0] : parsed;
    return typeof v === 'number' ? v : 0;
  } catch {
    return 0;
  }
}

