/**
 * CORS for Edge Functions: explicit allow-list only.
 *
 * Previously any `*.pages.dev` / `*.workers.dev` origin was reflected, so any
 * page anyone deploys on those shared hosts could read responses cross-origin.
 * Now only the real site origin(s) are allowed:
 *   - https://mena-intel-desk.mores-cohorts9x.workers.dev (production)
 *   - NEXT_PUBLIC_SITE_URL / CORS_ALLOWED_ORIGINS (comma-separated) function
 *     secrets, if set — use these for a future custom domain
 *   - http://localhost:3000 / :3001 only when running locally
 *     (`supabase functions serve`, detected via a local SUPABASE_URL) or when
 *     the CORS_ALLOW_LOCALHOST=true secret is set
 * Server-to-server API clients (X-MENA-API-Key) do not send Origin and are
 * unaffected by CORS.
 */
const PRODUCTION_ORIGIN = "https://mena-intel-desk.mores-cohorts9x.workers.dev";
const LOCALHOST_ORIGINS = ["http://localhost:3000", "http://localhost:3001"];

function toOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

function env(name: string): string | undefined {
  try {
    return Deno.env.get(name) ?? undefined;
  } catch {
    return undefined;
  }
}

function isLocalStack(): boolean {
  if (env("CORS_ALLOW_LOCALHOST") === "true") return true;
  const supabaseUrl = env("SUPABASE_URL") ?? "";
  return /^https?:\/\/(localhost|127\.0\.0\.1|kong)(:\d+)?/i.test(supabaseUrl);
}

function allowedOrigins(): Set<string> {
  const list = new Set<string>([PRODUCTION_ORIGIN]);
  const site = toOrigin(env("NEXT_PUBLIC_SITE_URL"));
  if (site) list.add(site);
  for (const extra of (env("CORS_ALLOWED_ORIGINS") ?? "").split(",")) {
    const o = toOrigin(extra);
    if (o) list.add(o);
  }
  if (isLocalStack()) LOCALHOST_ORIGINS.forEach((o) => list.add(o));
  return list;
}

export function isAllowedOrigin(origin: string): boolean {
  const o = toOrigin(origin);
  return o !== null && allowedOrigins().has(o);
}

export function corsHeaders(origin: string): Record<string, string> {
  // Never reflect an unlisted origin; fall back to the production origin so the
  // browser rejects the cross-origin read.
  const allowOrigin = isAllowedOrigin(origin) ? toOrigin(origin)! : PRODUCTION_ORIGIN;
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MENA-API-Key",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function handleCors(req: Request, origin: string): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders(origin) });
  }
  return null;
}
