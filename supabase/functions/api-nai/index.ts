import { handleCors, jsonResponse, authenticate, serviceClient, getFeatureFlags, tierHasFeature } from "../_shared/middleware.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const country = url.searchParams.get("country") || "";
  const conflictDay = dayParam ? parseInt(dayParam, 10) : null;

  const auth = await authenticate(req);
  const flags = await getFeatureFlags();
  const tier = auth.tier;
  const canSeeFull = tierHasFeature(tier, "nai_expressed_score", flags) && tier !== "free";
  const supabase = serviceClient();

  let query = supabase.from("nai_scores").select("country_code, conflict_day, expressed_score, latent_score, gap_size, category, updated_at");
  if (conflictDay != null) query = query.eq("conflict_day", conflictDay);
  if (country) query = query.eq("country_code", country);
  query = query.order("conflict_day", { ascending: false }).limit(country ? 1 : 200);

  const { data: rows, error } = await query;
  if (error) {
    return jsonResponse({ error: error.message }, 500, origin);
  }

  const day = conflictDay ?? (rows?.[0]?.conflict_day as number | undefined) ?? 0;
  let data: unknown[] = (rows || []).map((r: Record<string, unknown>) => {
    const out: Record<string, unknown> = {
      country_code: r.country_code,
      conflict_day: r.conflict_day,
      expressed_score: r.expressed_score,
      updated_at: r.updated_at,
    };
    if (canSeeFull) {
      out.latent_score = r.latent_score;
      out.gap_size = r.gap_size;
      out.category = r.category;
    } else {
      out._tier_note = "Upgrade to Informed or Pro for latent score, gap, and category.";
    }
    return out;
  });

  if (canSeeFull && data.length > 0) {
    const prevDay = day - 1;
    const { data: prevRows } = await supabase.from("nai_scores").select("country_code, expressed_score").eq("conflict_day", prevDay);
    const prevMap = new Map((prevRows || []).map((r: Record<string, unknown>) => [r.country_code, r.expressed_score as number]));
    data = data.map((row: Record<string, unknown>) => {
      const code = row.country_code as string;
      const current = (row.expressed_score as number) ?? 0;
      const prev = prevMap.get(code);
      if (prev == null) return { ...row, velocity: "stable" as const, velocity_delta: 0 };
      const delta = Math.round((current - prev) * 10) / 10;
      const velocity = delta > 2 ? "up" : delta < -2 ? "down" : "stable";
      return { ...row, velocity, velocity_delta: delta };
    });
  }

  const res: Record<string, unknown> = {
    data,
    conflictDay: day,
    tier,
    total: data.length,
  };
  if (tier === "free") res._tier_note = "Upgrade to Informed or Pro for latent score, gap, category, and velocity.";
  return jsonResponse(res, 200, origin);
});
