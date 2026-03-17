import { handleCors, jsonResponse, authenticate, serviceClient, getFeatureFlags, tierHasFeature } from "../_shared/middleware.ts";

const T1_FULL_COUNTRIES = ["EGY", "ARE", "UAE"];

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code") || "";
  const dayParam = url.searchParams.get("day");
  const conflictDay = dayParam ? parseInt(dayParam, 10) : null;

  const auth = await authenticate(req);
  const flags = await getFeatureFlags();
  const tier = auth.tier;
  const isPro = tier === "professional";
  const isInformed = tier === "informed" || isPro;

  const supabase = serviceClient();
  let query = supabase.from("country_reports").select("country_code, country_name, nai_score, nai_category, conflict_day, content_json, updated_at");
  if (conflictDay != null) query = query.eq("conflict_day", conflictDay);
  if (code) query = query.eq("country_code", code);
  query = query.order("conflict_day", { ascending: false });

  const { data: rows, error } = await query;
  if (error) {
    return jsonResponse({ error: error.message }, 500, origin);
  }

  const day = conflictDay ?? (rows?.[0]?.conflict_day as number | undefined) ?? 0;
  const data = (rows || []).map((r: Record<string, unknown>) => {
    const countryCode = (r.country_code as string) || "";
    const allowContent = isPro || (isInformed && T1_FULL_COUNTRIES.includes(countryCode));
    return {
      country_code: r.country_code,
      country_name: r.country_name,
      nai_score: r.nai_score,
      nai_category: r.nai_category,
      conflict_day: r.conflict_day,
      content_json: allowContent ? r.content_json : null,
      updated_at: r.updated_at,
      _tier_note: allowContent ? undefined : (T1_FULL_COUNTRIES.includes(countryCode) ? "Upgrade to Informed for this report." : "Upgrade to Pro for all country reports."),
    };
  });

  const single = code && data.length === 1 ? data[0] : undefined;
  return jsonResponse({
    data: single ?? data,
    conflictDay: day,
    tier,
  }, 200, origin);
});
