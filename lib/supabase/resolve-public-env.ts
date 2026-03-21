/**
 * Resolves Supabase URL + anon/publishable key for browser and SSR.
 *
 * `app/layout.tsx` may set `window.__SUPABASE_BROWSER_ENV__` from the same
 * `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or publishable key)
 * you already configure in GitHub Actions + Cloudflare — **not** a separate secret
 * name. It only bridges Worker/build env into the browser when the JS bundle
 * would otherwise miss those values.
 */
import {
  NEXT_PUBLIC_SUPABASE_URL as GEN_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY as GEN_ANON_KEY,
} from './env.client.generated';

declare global {
  interface Window {
    /** Populated by root layout inline script; same data as NEXT_PUBLIC_SUPABASE_* */
    __SUPABASE_BROWSER_ENV__?: { url: string; key: string };
  }
}

export function resolveSupabasePublicUrl(): string {
  if (typeof window !== 'undefined') {
    const w = window.__SUPABASE_BROWSER_ENV__?.url?.trim();
    if (w) return w;
  }
  return (typeof GEN_URL === 'string' && GEN_URL) || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function resolveSupabasePublicKey(): string {
  if (typeof window !== 'undefined') {
    const w = window.__SUPABASE_BROWSER_ENV__?.key?.trim();
    if (w) return w;
  }
  return (
    (typeof GEN_ANON_KEY === 'string' && GEN_ANON_KEY) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  );
}
