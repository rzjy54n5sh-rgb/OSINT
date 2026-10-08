/**
 * RPC-first reads with a fallback for databases that do not have the RPC yet.
 *
 * Migration 20261008090000_security_hardening moves the paid War Posture / country-report columns
 * behind two SECURITY DEFINER RPCs (viewer_nai_v2, viewer_country_report) and revokes the direct
 * column SELECT. The app ships BEFORE that migration, so every read calls the RPC first and, only
 * when PostgREST answers PGRST202 ("function not found in the schema cache"), runs the old table
 * query. Any other error is returned as-is: after the migration a permission error must surface,
 * never be papered over by the (then denied) table query.
 */
import type { PostgrestError } from '@supabase/supabase-js';

export type ReadResult<T> = { data: T | null; error: PostgrestError | null };
export type ReadVia = 'rpc' | 'table' | 'missing';

/** PostgREST could not find the function (pre-migration database). */
export function isMissingRpc(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  if (e.code === 'PGRST202') return true;
  // Postgres-level "function does not exist" (e.g. a direct pg connection or an older PostgREST).
  return e.code === '42883' && typeof e.message === 'string' && /viewer_/.test(e.message);
}

/**
 * Run `rpc()`; if the RPC does not exist, run `fallback()` instead. Pass `fallback = null` to get
 * `via: 'missing'` back instead of running a table query (callers that must not read the table
 * directly from the browser, e.g. /warroom, then use a server route).
 */
export async function rpcWithFallback<T>(
  // Loosely typed on purpose: supabase-js infers `any`-ish row types for untyped RPCs/selects;
  // the caller states the row shape once through T.
  rpc: () => PromiseLike<{ data: unknown; error: PostgrestError | null }>,
  fallback: (() => PromiseLike<{ data: unknown; error: PostgrestError | null }>) | null,
): Promise<ReadResult<T> & { via: ReadVia }> {
  let first: ReadResult<T>;
  try {
    first = (await rpc()) as ReadResult<T>;
  } catch (e) {
    // A client without .rpc (the no-op client used when Supabase env is missing) lands here.
    first = { data: null, error: { code: 'PGRST202', message: String(e), details: '', hint: '' } as PostgrestError };
  }
  if (!isMissingRpc(first.error)) return { ...first, via: 'rpc' };
  if (!fallback) return { data: null, error: first.error, via: 'missing' };
  const second = (await fallback()) as ReadResult<T>;
  return { ...second, via: 'table' };
}
