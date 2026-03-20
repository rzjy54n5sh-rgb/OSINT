/**
 * Session refresh for use in root middleware.ts only (Edge runtime for OpenNext CF).
 * Creates server client with cookie read/write and refreshes token if expired.
 */
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import type { User } from '@/types';
import { applySecurityHeaders } from '@/lib/security-headers';

export async function updateSession(request: NextRequest): Promise<{
  supabaseResponse: NextResponse;
  user: User | null;
}> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;
  if (!url || !anonKey) {
    const res = NextResponse.next({ request });
    applySecurityHeaders(res);
    return { supabaseResponse: res, user: null };
  }

  const response = NextResponse.next({ request });
  applySecurityHeaders(response);
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { data: { user: authUser } } = await supabase.auth.getUser();

  if (!authUser) {
    return { supabaseResponse: response, user: null };
  }

  const { data: profile } = await supabase
    .from('users')
    .select('*')
    .eq('id', authUser.id)
    .maybeSingle();
  const user = profile ? (profile as unknown as User) : null;

  return { supabaseResponse: response, user };
}
