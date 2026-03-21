import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveSupabasePublicKey, resolveSupabasePublicUrl } from './resolve-public-env';

const SUPABASE_NOT_CONFIGURED = 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment environment.';

const MOCK_ERROR = { message: SUPABASE_NOT_CONFIGURED, details: '', hint: '', code: '' };

/** Chainable mock that resolves to empty result so app does not crash when env is missing */
function createMockClient(): SupabaseClient {
  const empty = Promise.resolve({
    data: null,
    error: MOCK_ERROR,
    count: 0 as number | null,
  });
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
    then: (onFulfilled?: (v: unknown) => unknown, onRejected?: (e: unknown) => unknown) =>
      empty.then(onFulfilled, onRejected),
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
  const url = resolveSupabasePublicUrl();
  const anonKey = resolveSupabasePublicKey();
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
