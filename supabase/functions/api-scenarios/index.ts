import { handleCors, jsonResponse, authenticate, serviceClient, getFeatureFlags, tierHasFeature } from "../_shared/middleware.ts";

/**
 * B ("none of A, C or D") as its Fréchet range. A, C and D can happen in the same window, so the
 * stored scenario_b (100 − A − C − D) is only the LOW end; the high end is 100 − max(A, C, D).
 * Additive field: scenario_b stays as stored for existing clients. Mirrors lib/scenario-range.ts.
 * Rows of Days 1–35 (legacy desk estimates, retired method, cannot be scored) get null.
 */
function bRange(r: Record<string, unknown>): { low: number; high: number; note: string } | null {
  const day = Number(r.conflict_day);
  const a = Number(r.scenario_a), c = Number(r.scenario_c), d = Number(r.scenario_d);
  if (!Number.isFinite(day) || day <= 35 || ![a, c, d].every(Number.isFinite) || r.scenario_b == null) return null;
  return {
    low: Math.max(0, 100 - a - c - d),
    high: 100 - Math.max(a, c, d),
    note: "B = none of A, C or D. A, C and D can co-occur, so B is bounded: [100 - (A+C+D), 100 - max(A,C,D)].",
  };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const url = new URL(req.url);
  const dayParam = url.searchParams.get("day");
  const history = url.searchParams.get("history") === "true";
  const conflictDay = dayParam ? parseInt(dayParam, 10) : null;

  const auth = await authenticate(req);
  const flags = await getFeatureFlags();
  const isT1Plus = auth.tier === "informed" || auth.tier === "professional";
  const canSeeHistory = history && isT1Plus && tierHasFeature(auth.tier, "scenario_summary", flags);

  const supabase = serviceClient();

  let scenarioRows: Record<string, unknown>[];
  if (isT1Plus) {
    let scenarioQuery = supabase
      .from("scenario_probabilities")
      .select("conflict_day, scenario_a, scenario_b, scenario_c, scenario_d, scenario_e, updated_at")
      .order("conflict_day", { ascending: false });
    if (conflictDay != null) scenarioQuery = scenarioQuery.eq("conflict_day", conflictDay);
    const limitRows = canSeeHistory ? 14 : 1;
    scenarioRows = (await scenarioQuery.limit(limitRows)).data ?? [];
  } else {
    let dayOnlyQuery = supabase.from("scenario_probabilities").select("conflict_day").order("conflict_day", { ascending: false });
    if (conflictDay != null) dayOnlyQuery = dayOnlyQuery.eq("conflict_day", conflictDay);
    const { data: dayRow } = await dayOnlyQuery.limit(1);
    scenarioRows = (dayRow ?? []) as Record<string, unknown>[];
  }

  const day = conflictDay ?? (scenarioRows?.[0]?.conflict_day as number | undefined) ?? 0;
  const currentRow = scenarioRows?.[0] as Record<string, unknown> | undefined;
  const current = isT1Plus && currentRow ? {
    conflict_day: currentRow.conflict_day,
    scenario_a: currentRow.scenario_a,
    scenario_b: currentRow.scenario_b,
    scenario_c: currentRow.scenario_c,
    scenario_d: currentRow.scenario_d,
    scenario_e: currentRow.scenario_e,
    scenario_b_range: bRange(currentRow),
    updated_at: currentRow.updated_at,
  } : null;
  const historyData = canSeeHistory && scenarioRows && scenarioRows.length > 1
    ? scenarioRows.slice(1).map((r: Record<string, unknown>) => ({
        conflict_day: r.conflict_day,
        scenario_a: r.scenario_a,
        scenario_b: r.scenario_b,
        scenario_c: r.scenario_c,
        scenario_d: r.scenario_d,
        scenario_e: r.scenario_e,
        scenario_b_range: bRange(r),
        updated_at: r.updated_at,
      }))
    : undefined;

  const { data: detected } = await supabase
    .from("detected_scenarios")
    .select("id, conflict_day, label, title, description_en, initial_probability, acting_party_framing, affected_party_framing")
    .eq("status", "approved");

  return jsonResponse({
    current,
    history: historyData,
    detectedScenarios: detected || [],
    conflictDay: day,
    tier: auth.tier,
  }, 200, origin);
});
