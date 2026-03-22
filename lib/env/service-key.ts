/**
 * Service role JWT for Supabase admin API (same value as Dashboard "service_role").
 * Prefer `SUPABASE_SERVICE_KEY` (GitHub Actions / this repo's convention).
 * Accept `SUPABASE_SERVICE_ROLE_KEY` (Supabase CLI / dashboard naming).
 */
export function resolveSupabaseServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  ).trim();
}
