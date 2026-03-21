/**
 * Resolves Supabase URL + anon/publishable key for browser and SSR.
 *
 * On Cloudflare, `wrangler.toml` / dashboard vars are available on the Worker at
 * request time. We inject them into `window` from `app/layout.tsx` so client
 * bundles always match the live deployment even if the static build had empty
 * NEXT_PUBLIC_* (common when CI secrets differ from local `opennextjs` builds).
 */
import {
  NEXT_PUBLIC_SUPABASE_URL as GEN_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY as GEN_ANON_KEY,
} from './env.client.generated';

declare global {
  interface Window {
    __MENA_SUPABASE_PUBLIC__?: { url: string; key: string };
  }
}

export function resolveSupabasePublicUrl(): string {
  if (typeof window !== 'undefined') {
    const w = window.__MENA_SUPABASE_PUBLIC__?.url?.trim();
    if (w) return w;
  }
  return (typeof GEN_URL === 'string' && GEN_URL) || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function resolveSupabasePublicKey(): string {
  if (typeof window !== 'undefined') {
    const w = window.__MENA_SUPABASE_PUBLIC__?.key?.trim();
    if (w) return w;
  }
  return (
    (typeof GEN_ANON_KEY === 'string' && GEN_ANON_KEY) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  );
}
