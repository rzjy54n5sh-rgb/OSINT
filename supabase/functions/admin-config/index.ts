/**
 * Admin config: GET/PATCH all config, or /pricing (SUPER_ADMIN + FINANCE_MANAGER), or /features (SUPER_ADMIN only).
 */
import { handleCors, jsonResponse } from "../_shared/middleware.ts";
import {
  authenticateAdmin,
  adminCanAccess,
  adminUnauthorized,
  adminForbidden,
  writeAuditLog,
  serviceClient,
} from "../_shared/admin-middleware.ts";

const PRICING_KEYS_PREFIX = ["price_", "stripe_price_id_", "trial_days", "stripe_mode"];

function isPricingKey(key: string): boolean {
  return PRICING_KEYS_PREFIX.some((p) => key.startsWith(p)) || key === "trial_days" || key === "stripe_mode";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  const admin = await authenticateAdmin(req);
  if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);

  const url = new URL(req.url);
  const pathname = url.pathname;
  const isPricingRoute = pathname.endsWith("/pricing");
  const isFeaturesRoute = pathname.endsWith("/features");

  if (isFeaturesRoute) {
    if (!adminCanAccess(admin, "tier-features")) return adminForbidden(origin, "SUPER_ADMIN");
  } else if (isPricingRoute) {
    if (!adminCanAccess(admin, "pricing") && !adminCanAccess(admin, "config")) return adminForbidden(origin);
  } else {
    if (!adminCanAccess(admin, "config")) return adminForbidden(origin);
  }

  const supabase = serviceClient();

  if (req.method === "GET") {
    if (isFeaturesRoute) {
      const { data: rows, error } = await supabase
        .from("tier_features")
        .select("feature_key, description, free_access, informed_access, pro_access, updated_at");
      if (error) return jsonResponse({ error: error.message }, 500, origin);
      return jsonResponse({ features: rows ?? [] }, 200, origin);
    }

    const { data: rows, error } = await supabase
      .from("platform_config")
      .select("key, value, description, is_sensitive");
    if (error) return jsonResponse({ error: error.message }, 500, origin);

    let list = (rows ?? []).map((r: Record<string, unknown>) => ({
      key: r.key,
      value: r.is_sensitive ? "••••••••" : r.value,
      description: r.description,
      is_sensitive: r.is_sensitive,
    }));

    if (isPricingRoute) {
      list = list.filter((r: { key: string }) => isPricingKey(r.key));
    }

    return jsonResponse({ config: list }, 200, origin);
  }

  if (req.method === "PATCH") {
    let body: { key?: string; value?: unknown; featureKey?: string; tier?: string; enabled?: boolean };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }

    if (isFeaturesRoute) {
      const { featureKey, tier, enabled } = body;
      if (!featureKey || !tier) return jsonResponse({ error: "featureKey and tier required" }, 400, origin);
      const col = tier === "free" ? "free_access" : tier === "informed" ? "informed_access" : "pro_access";
      const { data: before } = await supabase.from("tier_features").select(col).eq("feature_key", featureKey).maybeSingle();
      const { error: updateError } = await supabase
        .from("tier_features")
        .update({ [col]: !!enabled, updated_at: new Date().toISOString(), updated_by: admin.adminId })
        .eq("feature_key", featureKey);
      if (updateError) return jsonResponse({ error: updateError.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "TIER_FEATURE_TOGGLE",
        actionSummary: `Tier feature ${featureKey} ${col}=${!!enabled}`,
        targetType: "tier_feature",
        targetId: featureKey,
        beforeState: before ? { [col]: (before as Record<string, boolean>)[col] } : undefined,
        afterState: { [col]: !!enabled },
      });
      return jsonResponse({ success: true }, 200, origin);
    }

    const key = body.key?.trim();
    if (!key) return jsonResponse({ error: "key required" }, 400, origin);

    if (isPricingRoute && !isPricingKey(key)) {
      return jsonResponse({ error: "Not a pricing key" }, 400, origin);
    }

    const value = body.value;
    const { data: oldRow } = await supabase.from("platform_config").select("value").eq("key", key).maybeSingle();
    const beforeVal = oldRow?.value;

    if (value === undefined || value === null) return jsonResponse({ error: "value required" }, 400, origin);

    const { error: updateError } = await supabase
      .from("platform_config")
      .update({
        value,
        updated_at: new Date().toISOString(),
        updated_by: admin.adminId,
      })
      .eq("key", key);

    if (updateError) return jsonResponse({ error: updateError.message }, 500, origin);

    const actionType = isPricingRoute ? "PRICING_CONFIG_CHANGE" : "PLATFORM_CONFIG_CHANGE";
    await writeAuditLog({
      adminId: admin.adminId,
      adminRole: admin.role,
      adminEmail: admin.email,
      actionType,
      actionSummary: `Config ${key} updated`,
      targetType: "platform_config",
      targetId: key,
      beforeState: { [key]: beforeVal },
      afterState: { [key]: value },
    });
    return jsonResponse({ success: true }, 200, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
