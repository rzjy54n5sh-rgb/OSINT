import { resolveSupabasePublicKey, resolveSupabasePublicUrl } from './resolve-public-env';

export type AnonInsertResult = 'done' | 'duplicate' | 'error';

/**
 * Browser-side INSERT into a public intake table (subscribers, contact_inquiries) with the public
 * key only — role `anon`, never the visitor's session. Those tables' INSERT policies are granted
 * to `anon` alone, so the session client (role `authenticated` once signed in) is refused by RLS.
 * Plain fetch also keeps working when Supabase env is missing (the browser client then returns a
 * mock without `.insert`): it resolves to 'error' instead of throwing.
 */
export async function anonInsert(table: string, row: Record<string, unknown>): Promise<AnonInsertResult> {
  const url = resolveSupabasePublicUrl();
  const key = resolveSupabasePublicKey();
  if (!url || !key) return 'error';
  try {
    const res = await fetch(`${url.replace(/\/+$/, '')}/rest/v1/${encodeURIComponent(table)}`, {
      method: 'POST',
      headers: { apikey: key, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(row),
    });
    if (res.ok) return 'done';
    if (res.status === 409) return 'duplicate'; // unique violation (23505) -> HTTP 409
    return 'error';
  } catch {
    return 'error';
  }
}
