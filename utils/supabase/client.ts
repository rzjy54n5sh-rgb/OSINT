/**
 * Browser Supabase client for 'use client' components only.
 * Creates a new client per call — do not store globally (Cloudflare Workers).
 * Reads NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (publishable/anon key).
 */
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_NOT_CONFIGURED =
  'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment environment.';

function createMockClient(): SupabaseClient {
  const empty = Promise.resolve({ data: null, error: { message: SUPABASE_NOT_CONFIGURED, details: '', hint: '', code: '' }, count: 0 as number | null });
  const chain: unknown = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: () => chain,
    in: () => chain,
    ilike: () => chain,
    lte: () => chain,
    gte: () => chain,
    neq: () => chain,
    or: () => chain,
    range: () => chain,
    single: () => chain,
    maybeSingle: () => chain,
    then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) => empty.then(onFulfilled, onRejected),
    catch: (onRejected?: (e: unknown) => unknown) => empty.catch(onRejected),
  };
  const noopSub = { unsubscribe: () => {} };
  return {
    from: () => chain,
    auth: {
      getSession: () => Promise.resolve({ data: { session: null }, error: null }),
      onAuthStateChange: () => ({ data: { subscription: noopSub } }),
    },
  } as unknown as SupabaseClient;
}

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn('@supabase/ssr:', SUPABASE_NOT_CONFIGURED);
    }
    return createMockClient();
  }
  try {
    return createBrowserClient(url, anonKey);
  } catch (e) {
    if (typeof window !== 'undefined') {
      console.warn('@supabase/ssr: createBrowserClient failed, using no-op client.', e);
    }
    return createMockClient();
  }
}
