/**
 * Server Supabase client for Server Components, Server Actions, Route Handlers.
 * Uses createServerClient from @supabase/ssr. Memoized per request via React.cache().
 */
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { User } from '@/types';

export const createClient = cache(async () => {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Ignored: setAll from Server Component; middleware handles session refresh
        }
      },
    },
  });
});

export const getUser = cache(async (): Promise<User | null> => {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).maybeSingle();
    return (profile as User) ?? null;
  } catch {
    return null;
  }
});

/** Returns the current session's access_token for calling Edge Functions with user context. */
export const getSessionToken = cache(async (): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  } catch {
    return null;
  }
});

export const getConflictDay = cache(async (): Promise<number> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase.rpc('get_current_conflict_day');
    return (data as number) ?? 17;
  } catch {
    return 17;
  }
});
