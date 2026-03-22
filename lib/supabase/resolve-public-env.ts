/**
 * Resolves Supabase URL + anon/publishable key for browser and SSR.
 *
 * `app/layout.tsx` sets `window.__NEXT_PUBLIC_RUNTIME__` with property names
 * identical to env vars (`NEXT_PUBLIC_SUPABASE_URL`, etc.). That object is
 * not a separate GitHub secret — it mirrors Worker/build `NEXT_PUBLIC_*`.
 */
import {
  INJECTED_NEXT_PUBLIC_GLOBAL,
  type InjectedNextPublicRuntime,
} from '@/lib/env/injected-next-public';
import {
  NEXT_PUBLIC_SUPABASE_URL as GEN_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY as GEN_ANON_KEY,
} from './env.client.generated';

function readInjectedRuntime(): InjectedNextPublicRuntime | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as Record<string, InjectedNextPublicRuntime | undefined>;
  return w[INJECTED_NEXT_PUBLIC_GLOBAL];
}

export function resolveSupabasePublicUrl(): string {
  if (typeof window !== 'undefined') {
    const bag = readInjectedRuntime();
    const u = bag?.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (u) return u;
  }
  return (typeof GEN_URL === 'string' && GEN_URL) || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

export function resolveSupabasePublicKey(): string {
  if (typeof window !== 'undefined') {
    const bag = readInjectedRuntime();
    const anon = bag?.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
    const pub = bag?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
    const w = anon || pub;
    if (w) return w;
  }
  return (
    (typeof GEN_ANON_KEY === 'string' && GEN_ANON_KEY) ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  );
}
