/**
 * Server Supabase client for Server Components, Server Actions, Route Handlers.
 * Uses createServerClient from @supabase/ssr. Memoized per request via React.cache().
 */
import { createServerClient } from '@supabase/ssr';
import { createClient as createSupabaseJsClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { cache } from 'react';
import type { User } from '@/types';
import { currentConflictDay } from '@/lib/conflict-calendar';
import { USER_PROFILE_COLUMNS } from '@/lib/user-profile';

/**
 * Cookie-less anon client for PUBLIC, cacheable (ISR) pages. It never reads the request's
 * cookies, so (a) Next.js can keep the route static/ISR instead of forcing it dynamic, and
 * (b) the rendered HTML is identical for every visitor — it can be shared by the edge cache
 * without leaking any user's tier or session. Anything tier-dependent must be loaded after
 * hydration through an authenticated, `private` route (see app/api/viewer/*).
 *
 * Still one client per request (React.cache is request-scoped) — never a module-level global
 * (Workers: "Cannot perform I/O on behalf of a different request").
 */
export const createPublicClient = cache(() => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  return createSupabaseJsClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
});

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
    const { data: profile } = await supabase.from('users').select(USER_PROFILE_COLUMNS).eq('id', user.id).maybeSingle();
    if (!profile) return null;
    // Admin users always get professional tier access regardless of subscription
    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('role, is_active')
      .eq('user_id', user.id)
      .maybeSingle();
    if (adminRow?.is_active) {
      (profile as Record<string, unknown>).tier = 'professional';
      (profile as Record<string, unknown>).admin_role = adminRow.role;
    }
    return profile as User;
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

/**
 * Current conflict day — DAY LOCK (CLAUDE.md rule 1): pure UTC calendar, no DB read.
 * Previously this called the `get_current_conflict_day` RPC and fell back to a
 * hardcoded 17 on any error; the day must never depend on DB availability or on
 * any table's MAX(conflict_day). Kept async for call-site compatibility.
 */
export const getConflictDay = cache(async (): Promise<number> => currentConflictDay());

/** Tables whose rows are stamped with a conflict_day and can report their own latest day. */
export type DayStampedTable =
  | 'daily_briefings'
  | 'market_data'
  | 'nai_scores'
  | 'scenario_probabilities'
  | 'social_trends'
  | 'articles';

/**
 * Latest conflict_day present in ONE table ("latest day this section has data").
 * Each section maxes over its OWN table — never nai_scores on behalf of another
 * section. Returns null when the table is empty or unreadable.
 */
export const getLatestDayFor = cache(
  async (table: DayStampedTable, reportType?: string): Promise<number | null> => {
    try {
      const supabase = await createClient();
      let q = supabase
        .from(table)
        .select('conflict_day')
        .not('conflict_day', 'is', null)
        .order('conflict_day', { ascending: false })
        .limit(1);
      if (reportType && table === 'daily_briefings') q = q.eq('report_type', reportType);
      const { data } = await q.maybeSingle();
      const d = (data as { conflict_day?: number } | null)?.conflict_day;
      return typeof d === 'number' && Number.isFinite(d) ? d : null;
    } catch {
      return null;
    }
  }
);
