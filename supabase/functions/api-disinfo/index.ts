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
  let query = supabase.from("disinfo_claims").select("id, conflict_day, claim_text as claim, verdict, source_url as source, created_at", { count: "exact" });
  if (conflictDay != null) query = query.eq("conflict_day", conflictDay);
  query = query.order("published_at", { ascending: false }).order("created_at", { ascending: false }).range(0, limit - 1);

  const { data: rows, error, count } = await query;
  if (error) {
    return jsonResponse({ error: error.message }, 500, origin);
  }

  const data = (rows || []).map((r: Record<string, unknown>) => ({
    id: r.id,
    conflict_day: r.conflict_day,
    claim: r.claim ?? r.claim_text,
    status: "published",
    verdict: r.verdict,
    source: r.source ?? r.source_url,
    created_at: r.created_at,
  }));

  return jsonResponse({
    data: data as unknown[],
    total: count ?? data.length,
    tier: auth.tier,
    conflictDay: conflictDay ?? null,
  }, 200, origin);
});
