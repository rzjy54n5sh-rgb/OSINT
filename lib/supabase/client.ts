import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_NOT_CONFIGURED = 'Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in your deployment environment.';

/** Chainable mock that resolves to empty result so app does not crash when env is missing */
function createMockClient(): SupabaseClient {
  const empty = Promise.resolve({
    data: null,
    error: { message: SUPABASE_NOT_CONFIGURED, details: '', hint: '', code: '' },
  });
  const chain: unknown = {
    select: () => chain,
    order: () => chain,
    limit: () => chain,
    eq: () => chain,
    single: () => chain,
    maybeSingle: () => chain,
    then: (onFulfilled?: (v: unknown) => unknown) => empty.then(onFulfilled),
    catch: (onRejected?: (e: unknown) => unknown) => empty.catch(onRejected),
  };
  return {
    from: () => chain,
    // Minimal stub so type is satisfied; other methods are unused in this app
    auth: { getSession: () => Promise.resolve({ data: { session: null }, error: null }) },
  } as unknown as SupabaseClient;
}

export function createClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    if (typeof window !== 'undefined') {
      console.warn('@supabase/ssr:', SUPABASE_NOT_CONFIGURED);
    }
    return createMockClient();
  }
  return createBrowserClient(url, anonKey);
}
