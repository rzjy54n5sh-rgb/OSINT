/**
 * Supabase session refresh + /admin/* gate (OpenNext + Cloudflare).
 * Next.js 15.x — do not set `runtime` here; OpenNext Cloudflare uses the Workers pipeline.
 *
 * 1. Refresh Supabase session on every request (@supabase/ssr).
 * 2. Protect /admin/* — redirect unauthenticated or non-admin users.
 * Admin Server Components still verify independently.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateSession } from '@/utils/supabase/middleware';
import { applySecurityHeaders } from '@/lib/security-headers';

export async function middleware(request: NextRequest) {
  const { supabaseResponse, authUser } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith('/admin')) {
    return supabaseResponse;
  }

  // Gate on Auth JWT, not public.users — profile sync can lag; admins still have user_id in admin_users.
  if (!authUser) {
    const redirect = new URL('/login', request.url);
    redirect.searchParams.set('redirect', pathname);
    const res = NextResponse.redirect(redirect);
    applySecurityHeaders(res);
    return res;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    const res = NextResponse.redirect(new URL('/', request.url));
    applySecurityHeaders(res);
    return res;
  }

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: adminRow } = await admin
    .from('admin_users')
    .select('id, role')
    .eq('user_id', authUser.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!adminRow) {
    const res = NextResponse.redirect(new URL('/', request.url));
    applySecurityHeaders(res);
    return res;
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
