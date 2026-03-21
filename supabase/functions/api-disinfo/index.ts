import { handleCors, jsonResponse, authenticate, serviceClient } from "../_shared/middleware.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const conflictDay = dayParam ? parseInt(dayParam, 10) : null;

  const auth = await authenticate(req);
  const limit = auth.tier === "free" ? 5 : 500;

  const supabase = serviceClient();
  // Schema matches collect_disinfo.py / app/disinfo — no conflict_day on disinfo_claims in all envs
  let query = supabase
    .from("disinfo_claims")
    .select("id, claim_text, verdict, source_url, created_at", { count: "exact" });
  query = query.order("created_at", { ascending: false }).range(0, limit - 1);

  const { data: rows, error, count } = await query;
  if (error) {
    return jsonResponse({ error: error.message }, 500, origin);
  }

  const data = (rows || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    conflict_day: null,
    claim: r.claim_text,
    status: "published",
    verdict: r.verdict,
    source: r.source_url,
    created_at: r.created_at,
  }));

  return jsonResponse({
    data: data as unknown[],
    total: count ?? data.length,
    tier: auth.tier,
    conflictDay: conflictDay ?? null,
  }, 200, origin);
});
