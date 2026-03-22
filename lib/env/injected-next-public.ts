/**
 * Browser runtime bridge: one `window` bag whose **property names** match
 * Cloudflare / GitHub env var names exactly. This is NOT a separate secret —
 * values are copied from `NEXT_PUBLIC_*` in `app/layout.tsx`.
 *
 * @see PROJECT.md § "Canonical environment variable names"
 * @see CURSOR.md — Environment variables
 */
export const INJECTED_NEXT_PUBLIC_GLOBAL = '__NEXT_PUBLIC_RUNTIME__' as const;

/** Keys mirror real env names; at least one of the two key fields should be set. */
export type InjectedNextPublicRuntime = Readonly<{
  NEXT_PUBLIC_SUPABASE_URL: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
}>;

declare global {
  interface Window {
    __NEXT_PUBLIC_RUNTIME__?: InjectedNextPublicRuntime;
  }
}
