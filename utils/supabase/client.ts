/**
 * Browser Supabase client — re-exports the canonical implementation.
 *
 * Always import from here or `@/lib/supabase/client`; both resolve to the same
 * `createClient()`, which reads `lib/supabase/env.client.generated.ts` (CI/local
 * pre-build) plus `process.env` fallbacks. A duplicate implementation here used to
 * miss generated keys and return a no-op client in production → empty DB reads.
 */
export { createClient } from '@/lib/supabase/client';
