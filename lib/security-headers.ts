/**
 * Security headers applied at the edge (Next.js middleware → CF Worker).
 * Single source of truth so CSP and other headers are consistent with next.config.js.
 */
import { NextResponse } from 'next/server';

const CSP =
  "default-src 'self'; " +
  "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://plausible.io https://js.stripe.com; " +
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
  "font-src 'self' https://fonts.gstatic.com; " +
  "img-src 'self' data: https: blob:; " +
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.anthropic.com https://api.stripe.com https://api.resend.com; " +
  "frame-src https://js.stripe.com https://hooks.stripe.com; " +
  "frame-ancestors 'none';";

export function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set('Content-Security-Policy', CSP);
  res.headers.set('X-Frame-Options', 'DENY');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  return res;
}
