/**
 * Build-time Supabase env for the client bundle.
 * CI overwrites this with real values from secrets so the client gets URL/key
 * even when Next.js env inlining is not applied (e.g. OpenNext/Cloudflare).
 * Local: keep empty and use .env.local via process.env fallback in client.ts
 */
export const NEXT_PUBLIC_SUPABASE_URL = '';
export const NEXT_PUBLIC_SUPABASE_ANON_KEY = '';
