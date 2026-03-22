/**
 * Extra ProcessEnv keys not always present in generated cloudflare-env.d.ts.
 * Same names as GitHub / Cloudflare secrets — do not rename without updating PROJECT.md + CURSOR.md.
 */
declare namespace NodeJS {
  interface ProcessEnv {
    SUPABASE_SERVICE_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?: string;
  }
}
