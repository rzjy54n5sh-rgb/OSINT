/**
 * Environment variable validation at startup.
 * Call validateEnv() from app/layout.tsx to fail fast on misconfiguration.
 */

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SITE_URL',
] as const;

/** Either anon or publishable key must be set for Supabase client. */
const SUPABASE_KEY_NAMES = ['NEXT_PUBLIC_SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'] as const;

/** Prefer SUPABASE_SERVICE_KEY (repo/GitHub); SUPABASE_SERVICE_ROLE_KEY is accepted as alias. */
function warnIfNoServiceKeyInProduction(isDev: boolean): void {
  if (isDev) return;
  const has =
    (process.env.SUPABASE_SERVICE_KEY && process.env.SUPABASE_SERVICE_KEY.trim() !== '') ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.trim() !== '');
  if (!has) {
    console.error(
      '[env] Optional but recommended in production: set SUPABASE_SERVICE_KEY (or SUPABASE_SERVICE_ROLE_KEY) for admin routes and /api/generate-briefing.'
    );
  }
}

export function validateEnv(): void {
  const isDev = process.env.NODE_ENV === 'development';
  const missing: string[] = [];

  for (const key of REQUIRED) {
    const val = process.env[key];
    if (val === undefined || val === '') missing.push(key);
  }

  const hasSupabaseKey = SUPABASE_KEY_NAMES.some(
    (k) => process.env[k] !== undefined && process.env[k] !== ''
  );
  if (!hasSupabaseKey) {
    missing.push('NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  }

  if (missing.length > 0) {
    const message = `Missing required env: ${missing.join(', ')}. Set them in .env.local or deployment env.`;
    if (isDev) {
      throw new Error(message);
    }
    console.error('[env]', message);
    return;
  }

  if (!isDev) {
    warnIfNoServiceKeyInProduction(isDev);
  }
}
