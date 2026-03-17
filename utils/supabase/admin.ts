/**
 * Service-role Supabase client for admin Server Components only.
 * Uses createClient from @supabase/supabase-js (not @supabase/ssr).
 * Reads SUPABASE_SERVICE_ROLE_KEY (never NEXT_PUBLIC_).
 * Disables auth auto-refresh and session persistence.
 *
 * @important Only import this in:
 * - Server Components inside app/(admin)/admin/
 * - Server Actions with 'use server' directive
 * - Never in any file with 'use client'
 * - Never in Edge Functions (they use their own service client)
 */
import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY and NEXT_PUBLIC_SUPABASE_URL must be set for admin client.');
  }
  return createClient(url, serviceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
