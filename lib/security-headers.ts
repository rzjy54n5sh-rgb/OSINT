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
 *   spawns its worker. Since maplibre-gl v6 the worker is a same-origin
 *   /_next/static file (worker-src 'self'); blob: is kept, harmless.
 * - Media room embeds YouTube live players (frame-src youtube[-nocookie]);
 *   thumbnails (img.youtube.com, *.ytimg.com, *.staticflickr.com,
 *   t2.gstatic.com favicons) are covered by img-src https:.
 * - Stripe hosts kept for checkout/portal flows.
 * - Cloudflare Web Analytics (lib/analytics.ts): static.cloudflareinsights.com (script) and
 *   cloudflareinsights.com (beacon endpoint) are allowed ONLY while NEXT_PUBLIC_CF_BEACON_TOKEN is set,
 *   evaluated per response (Worker env is populated on the first request, after module load).
 *
 * Embeds (/embed/*, media/partner iframes): the ONLY paths that may be framed by other sites. They get
 * EMBED_SECURITY_HEADERS instead (no X-Frame-Options, `frame-ancestors *`, and a no-script, no-network
 * CSP: the widgets are static HTML with inline CSS). middleware.ts picks the set by path via isEmbedPath();
 * the /embed snippet page itself (no trailing segment) keeps the site headers and cannot be framed.
 * Route-level headers cannot do this on OpenNext: middleware headers win over route headers
 * (mergeHeadersPriority defaults to "middleware").
 */

import { cfBeaconToken, CF_BEACON_CONNECT_ORIGIN, CF_BEACON_SCRIPT_ORIGIN } from '@/lib/analytics';

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

const serialize = (d: Record<string, string[]>) =>
  Object.entries(d)
    .map(([directive, sources]) => `${directive} ${sources.join(' ')}`)
    .join('; ');

/** Site CSP; `beacon: true` adds the Cloudflare Web Analytics hosts (script + report endpoint). */
export function contentSecurityPolicy({ beacon = false }: { beacon?: boolean } = {}): string {
  if (!beacon) return serialize(CSP_DIRECTIVES);
  return serialize({
    ...CSP_DIRECTIVES,
    'script-src': [...CSP_DIRECTIVES['script-src'], CF_BEACON_SCRIPT_ORIGIN],
    'connect-src': [...CSP_DIRECTIVES['connect-src'], CF_BEACON_CONNECT_ORIGIN],
  });
}

/** Site CSP without the analytics beacon (the beacon variant is built per response, see applySecurityHeaders). */
export const CONTENT_SECURITY_POLICY = contentSecurityPolicy();

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
  if (cfBeaconToken()) res.headers.set('Content-Security-Policy', contentSecurityPolicy({ beacon: true }));
  return res;
}

// ---------------------------------------------------------------------------------------------------
// Embeds: /embed/<widget> may be framed by any site; nothing else may.
// ---------------------------------------------------------------------------------------------------
export const EMBED_PATH_PREFIX = '/embed/';

/** true for /embed/<something> only (not /embed itself, /embedded, or /x/embed/...). */
export function isEmbedPath(pathname: string): boolean {
  return pathname.startsWith(EMBED_PATH_PREFIX) && pathname.length > EMBED_PATH_PREFIX.length;
}

/**
 * Embed CSP: framing by any http(s) page; the document itself may load nothing but its inline <style>
 * (no scripts, no fonts, no fetches, no forms), so a partner page embedding it gains no code from us.
 */
export const EMBED_CONTENT_SECURITY_POLICY = serialize({
  'default-src': ["'none'"],
  'style-src': ["'unsafe-inline'"],
  'img-src': ["'self'", 'data:'],
  'script-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  'frame-ancestors': ['*'],
});

export const EMBED_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'Content-Security-Policy': EMBED_CONTENT_SECURITY_POLICY,
  ...STATIC_SECURITY_HEADERS,
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

/** Embed header set; also removes any X-Frame-Options set earlier on the same response. */
export function applyEmbedSecurityHeaders<T extends { headers: Headers }>(res: T): T {
  res.headers.delete('X-Frame-Options');
  for (const [key, value] of Object.entries(EMBED_SECURITY_HEADERS)) {
    res.headers.set(key, value);
  }
  return res;
}
