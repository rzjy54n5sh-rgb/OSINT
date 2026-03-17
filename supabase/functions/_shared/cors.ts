const ALLOWED_ORIGINS = [
  "*.pages.dev",
  "*.workers.dev",
  "http://localhost:3000",
  "http://localhost:3001",
];

function getOriginHost(origin: string): string {
  try {
    return new URL(origin).hostname.toLowerCase();
  } catch {
    return "";
  }
}

function originMatchesAllowed(origin: string): boolean {
  if (!origin) return false;
  const o = origin.trim().toLowerCase();
  const host = getOriginHost(origin);
  for (const allowed of ALLOWED_ORIGINS) {
    if (allowed.startsWith("*.")) {
      const suffix = allowed.slice(1);
      if (host.endsWith(suffix) || o.endsWith(suffix)) return true;
    } else if (o === allowed) return true;
  }
  return false;
}

export function corsHeaders(origin: string): Record<string, string> {
  const allowOrigin = originMatchesAllowed(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-MENA-API-Key",
    "Access-Control-Max-Age": "86400",
  };
}

export function handleCors(req: Request, origin: string): Response | null {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders(origin) });
  }
  return null;
}
