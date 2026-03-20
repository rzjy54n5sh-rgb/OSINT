/**
 * DECISION — Next.js 16 `middleware.ts` vs `proxy.ts` (security patch documentation):
 * - Next.js 16 deprecates the `middleware` file name in favor of `proxy.ts` for the
 *   default Node.js request boundary. See https://nextjs.org/docs/messages/middleware-to-proxy
 * - **OpenNext + Cloudflare** (`npm run build:cf`) does not support the Node.js `proxy.ts`
 *   path. We **keep `middleware.ts`**. Next 16 rejects `runtime = "edge"` on this file during the
 *   OpenNext build; **`runtime = "experimental-edge"`** is required (see Next build error).
 * - CVE-2025-55182: addressed by framework version (Next 16.1.5, React 19.2.4), not by
 *   renaming this file.
 *
 * Two responsibilities:
 * 1. Refresh Supabase session on every request (@supabase/ssr requirement).
 * 2. Protect /admin/* — redirect unauthenticated or non-admin users.
 * Layer 2: each admin Server Component must still verify independently (Phase 9).
 * Security headers on redirects: applySecurityHeaders; static headers: next.config.js.
 */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateSession } from '@/utils/supabase/middleware';
import { applySecurityHeaders } from '@/lib/security-headers';

export const runtime = 'experimental-edge';

export async function middleware(request: NextRequest) {
  const { supabaseResponse, user } = await updateSession(request);
  const pathname = request.nextUrl.pathname;

  if (!pathname.startsWith('/admin')) {
    return supabaseResponse;
  }

  if (!user) {
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
    .eq('user_id', user.id)
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
