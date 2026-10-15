/**
 * Free, cookie-less analytics: Cloudflare Web Analytics (JS beacon). Rendered by app/layout.tsx only when
 * NEXT_PUBLIC_CF_BEACON_TOKEN is set (the site token from the Cloudflare dashboard: Analytics & Logs ->
 * Web Analytics -> the site's JS snippet, `data-cf-beacon='{"token": "..."}'`). Until it is set nothing
 * changes. The /embed/* widgets are route handlers outside the root layout, so partners' readers are
 * never counted or sent to Cloudflare from an embed.
 *
 * The token is public (it ships in every page's HTML); it is validated here only so a malformed value
 * can never break out of the data-cf-beacon attribute. lib/security-headers.ts allows the beacon's two
 * hosts in the CSP under the same condition (cfBeaconToken() !== null).
 *
 * The env var is read with a literal `process.env.NEXT_PUBLIC_CF_BEACON_TOKEN` so it works both when
 * inlined at build time and when it is only a Worker variable/secret at runtime (OpenNext copies string
 * bindings into process.env per request).
 */

export const CF_BEACON_SRC = 'https://static.cloudflareinsights.com/beacon.min.js';
/** Script host and the endpoint the beacon reports to (cloudflareinsights.com/cdn-cgi/rum). */
export const CF_BEACON_SCRIPT_ORIGIN = 'https://static.cloudflareinsights.com';
export const CF_BEACON_CONNECT_ORIGIN = 'https://cloudflareinsights.com';

const TOKEN_RE = /^[A-Za-z0-9]{16,64}$/;

/** The beacon token, or null when unset or not token-shaped (alphanumeric, 16-64 chars). */
export function cfBeaconToken(raw: string | null | undefined = process.env.NEXT_PUBLIC_CF_BEACON_TOKEN): string | null {
  const t = (raw ?? '').trim();
  return TOKEN_RE.test(t) ? t : null;
}

/** Value of the data-cf-beacon attribute. */
export function cfBeaconConfig(token: string): string {
  return JSON.stringify({ token });
}
