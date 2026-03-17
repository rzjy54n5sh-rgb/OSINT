/**
 * Two responsibilities:
 * 1. Refresh Supabase session on every request (@supabase/ssr requirement).
 * 2. Protect /admin/* — redirect unauthenticated or non-admin users.
 * Layer 2: each admin Server Component must still verify independently (Phase 9).
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateSession } from '@/utils/supabase/middleware';

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith('/admin')) {
    return supabaseResponse;
  }

  if (!user) {
    const redirect = new URL('/login', request.url);
    redirect.searchParams.set('redirect', pathname);
    return NextResponse.redirect(redirect);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('id, role')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRow) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  supabaseResponse.headers.set('x-admin-role', adminRow.role);
  supabaseResponse.headers.set('x-admin-id', adminRow.id);
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:ico|png|jpg|jpeg|gif|webp|svg)$).*)',
  ],
};
