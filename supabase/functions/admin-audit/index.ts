/**
 * Admin audit: GET log entries. SUPER_ADMIN sees all; others see own entries only.
 * SUPER_ADMIN only: action_type breakdown for last 7 days.
 */
import { handleCors, jsonResponse } from "../_shared/middleware.ts";
import {
  authenticateAdmin,
  adminCanAccess,
  adminUnauthorized,
  adminForbidden,
  serviceClient,
} from "../_shared/admin-middleware.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  const admin = await authenticateAdmin(req);
  if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);
  if (!adminCanAccess(admin, "audit")) return adminForbidden(origin);

  const url = new URL(req.url);
  const action_type = url.searchParams.get("action_type")?.trim() || "";
  const target_type = url.searchParams.get("target_type")?.trim() || "";
  const since = url.searchParams.get("since")?.trim() || "";
  const until = url.searchParams.get("until")?.trim() || "";
  const ai_only = url.searchParams.get("ai_only") === "true";
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const limit = Math.min(200, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));

  const supabase = serviceClient();
  const from = (page - 1) * limit;

  let query = supabase
    .from("admin_audit_log")
    .select("id, admin_id, admin_role, admin_email, action_type, action_summary, target_type, target_id, target_label, before_state, after_state, is_ai_request, created_at", { count: "exact" });

  if (admin.role !== "SUPER_ADMIN") {
    query = query.eq("admin_id", admin.adminId);
  }
  if (action_type) query = query.eq("action_type", action_type);
  if (target_type) query = query.eq("target_type", target_type);
  if (since) query = query.gte("created_at", since);
  if (until) query = query.lte("created_at", until);
  if (ai_only) query = query.eq("is_ai_request", true);

  const { data: entries, error, count } = await query.order("created_at", { ascending: false }).range(from, from + limit - 1);
  if (error) return jsonResponse({ error: error.message }, 500, origin);

  let actionTypeBreakdown: Record<string, number> | undefined;
  if (admin.role === "SUPER_ADMIN") {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const since7 = sevenDaysAgo.toISOString();
    const { data: breakdownRows } = await supabase
      .from("admin_audit_log")
      .select("action_type")
      .gte("created_at", since7);
    actionTypeBreakdown = {};
    for (const r of breakdownRows ?? []) {
      const t = (r as { action_type: string }).action_type;
      actionTypeBreakdown[t] = (actionTypeBreakdown[t] || 0) + 1;
    }
  }

  const out: Record<string, unknown> = {
    entries: entries ?? [],
    total: count ?? 0,
    page,
    limit,
  };
  if (actionTypeBreakdown) out.actionTypeBreakdownLast7Days = actionTypeBreakdown;

  return jsonResponse(out, 200, origin);
});
