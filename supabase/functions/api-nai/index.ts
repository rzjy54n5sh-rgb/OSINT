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
  const conflictDayParam = dayParam ? parseInt(dayParam, 10) : null;

  const auth = await authenticate(req);
  const flags = await getFeatureFlags();
  const tier = auth.tier;
  const canSeeFull = tierHasFeature(tier, "nai_expressed_score", flags) && tier !== "free";
  const supabase = serviceClient();

  let currentDay = conflictDayParam;
  if (currentDay == null || !Number.isFinite(currentDay)) {
    const { data: latest } = await supabase
      .from("nai_scores")
      .select("conflict_day")
      .order("conflict_day", { ascending: false })
      .limit(1)
      .maybeSingle();
    currentDay = (latest?.conflict_day as number | undefined) ?? null;
  }

  if (currentDay == null || currentDay < 1) {
    const res: Record<string, unknown> = { data: [], conflictDay: 0, tier, total: 0 };
    if (tier === "free") res._tier_note = "Upgrade to Informed or Pro for latent score, gap, and category.";
    return jsonResponse(res, 200, origin);
  }

  const prevDay = currentDay - 1;
  let query = supabase
    .from("nai_scores")
    .select("country_code, conflict_day, expressed_score, latent_score, gap_size, category, updated_at")
    .in("conflict_day", [currentDay, prevDay]);
  if (country) query = query.eq("country_code", country);
  const { data: rows, error } = await query.order("conflict_day", { ascending: false });
  if (error) {
    return jsonResponse({ error: error.message }, 500, origin);
  }

  const list = rows || [];
  const todayScores = list.filter((r: { conflict_day: number }) => r.conflict_day === currentDay);
  const yesterdayMap = new Map(
    list
      .filter((r: { conflict_day: number }) => r.conflict_day === prevDay)
      .map((r: { country_code: string; expressed_score: number }) => [r.country_code, r.expressed_score]),
  );

  const withDeltas = todayScores.map((r: Record<string, unknown>) => {
    const code = r.country_code as string;
    const exp = r.expressed_score as number;
    const prev = yesterdayMap.get(code);
    const delta = prev !== undefined ? exp - prev : null;
    return { ...r, delta };
  });

  let data: unknown[] = withDeltas.map((r: Record<string, unknown>) => {
    const out: Record<string, unknown> = {
      country_code: r.country_code,
      conflict_day: r.conflict_day,
      expressed_score: r.expressed_score,
      updated_at: r.updated_at,
      delta: r.delta,
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
    data = data.map((row: Record<string, unknown>) => {
      const d = row.delta as number | null;
      if (d == null) return { ...row, velocity: "stable" as const, velocity_delta: 0 };
      const velocity_delta = Math.round(d * 10) / 10;
      const velocity = velocity_delta > 2 ? "up" : velocity_delta < -2 ? "down" : "stable";
      return { ...row, velocity, velocity_delta };
    });
  }

  const res: Record<string, unknown> = {
    data,
    conflictDay: currentDay,
    tier,
    total: data.length,
  };
  if (tier === "free") {
    res._tier_note = "Upgrade to Informed or Pro for latent score, gap, and category.";
  }
  return jsonResponse(res, 200, origin);
});
