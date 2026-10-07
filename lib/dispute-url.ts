/**
 * Client-side mirror of the `disputes` CHECKs (migration 20261008090000_security_hardening):
 *   disputes_content_chk: source_url ~* '^https?://[^[:space:]]+$', article_url NULL or the same,
 *                         claim_text / article_id non-blank
 *   disputes_len_chk:     article_url / source_url <= 2048, claim_text <= 5000, article_id <= 100
 * so a visitor gets a clear message instead of a silently rejected insert.
 */
export const DISPUTE_URL_MAX = 2048;
export const DISPUTE_CLAIM_MAX = 5000;
const HTTP_URL = /^https?:\/\/\S+$/i;

/**
 * Normalise a visitor-typed source URL: trims, adds `https://` when no scheme was typed
 * (`reuters.com/x` -> `https://reuters.com/x`), and returns null for anything that is not a valid
 * http(s) URL the database would accept (other schemes such as `javascript:` / `ftp://`, spaces,
 * no host, too long).
 */
export function normalizeDisputeUrl(raw: string | null | undefined): string | null {
  let t = (raw ?? '').trim();
  if (!t) return null;
  if (t.startsWith('//')) t = t.slice(2);
  if (!/^https?:\/\//i.test(t)) {
    // An explicit non-http scheme ("javascript:", "mailto:", "ftp://") is rejected, not rewritten.
    if (/^[a-z][a-z0-9+-]*:(?!\d)/i.test(t)) return null;
    t = `https://${t}`;
  }
  if (!HTTP_URL.test(t) || t.length > DISPUTE_URL_MAX) return null;
  try {
    const u = new URL(t);
    if (!(u.protocol === 'http:' || u.protocol === 'https:') || !u.hostname.includes('.')) return null;
  } catch {
    return null;
  }
  return t;
}

/** The article URL is optional in the CHECK: keep it only when it already passes, else send null. */
export function articleUrlForDispute(raw: string | null | undefined): string | null {
  const t = (raw ?? '').trim();
  return t && HTTP_URL.test(t) && t.length <= DISPUTE_URL_MAX ? t : null;
}
