/**
 * Security headers — SINGLE SOURCE OF TRUTH for every Worker-rendered response
 * (HTML pages, route handlers, redirects). Applied in middleware.ts via
 * utils/supabase/middleware.ts. Do NOT re-add a headers() block to next.config.js:
 * OpenNext applies both, which produced duplicated, comma-joined header values.
 *
 * Static files under /_next/static, /icons, etc. are served by the Cloudflare
 * assets layer and never reach middleware; public/_headers carries the small,
 * non-CSP subset for them (HSTS, nosniff, referrer) — keep those values in sync
 * with STATIC_SECURITY_HEADERS below.
 *
 * CSP notes
 * - script-src keeps 'unsafe-inline': Next.js App Router emits inline
 *   `self.__next_f.push(...)` RSC payload scripts plus our injected runtime-env
 *   script. Removing 'unsafe-inline' requires per-request nonces, which only
 *   work while every page is dynamically rendered; HTML caching / ISR (in
 *   progress separately) would serve a stale nonce and block every script.
 *   Revisit once the caching strategy is settled.
 * - 'unsafe-eval' is NOT allowed in production (no production code path needs
 *   eval / new Function). It is added only for `next dev` (React Refresh).
 * - NAI map (maplibre-gl, components/nai/NaiMapClient.tsx) loads style, vector
 *   tiles and glyphs from demotiles.maplibre.org via fetch (connect-src) and
 *   spawns its worker from a blob: URL (worker-src blob:).
 * - Media room embeds YouTube live players (frame-src youtube[-nocookie]);
 *   thumbnails (img.youtube.com, *.ytimg.com, *.staticflickr.com,
 *   t2.gstatic.com favicons) are covered by img-src https:.
 * - Stripe hosts kept for checkout/portal flows.
 */

const isDev = process.env.NODE_ENV === 'development';

const CSP_DIRECTIVES: Record<string, string[]> = {
  'default-src': ["'self'"],
  'script-src': [
    "'self'",
    "'unsafe-inline'",
    ...(isDev ? ["'unsafe-eval'"] : []),
    'https://plausible.io',
    'https://js.stripe.com',
  ],
  'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
  'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
  'img-src': ["'self'", 'data:', 'blob:', 'https:'],
  'connect-src': [
    "'self'",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    'https://plausible.io',
    'https://api.stripe.com',
    'https://demotiles.maplibre.org',
  ],
  'worker-src': ["'self'", 'blob:'],
  'child-src': ["'self'", 'blob:'],
  'frame-src': [
    'https://js.stripe.com',
    'https://hooks.stripe.com',
    'https://checkout.stripe.com',
    'https://www.youtube-nocookie.com',
    'https://www.youtube.com',
  ],
  'object-src': ["'none'"],
  'base-uri': ["'self'"],
  'form-action': ["'self'"],
  'frame-ancestors': ["'none'"],
};

export const CONTENT_SECURITY_POLICY = Object.entries(CSP_DIRECTIVES)
  .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
  .join('; ');

/** Headers that also apply to static assets (mirrored in public/_headers). */
export const STATIC_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  ...STATIC_SECURITY_HEADERS,
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Sets (overwrites, never appends) the security headers on a response. */
export function applySecurityHeaders<T extends { headers: Headers }>(res: T): T {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}
