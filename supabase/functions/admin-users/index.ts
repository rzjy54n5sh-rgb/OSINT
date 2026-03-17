/**
 * Admin users: GET paginated list or single user; PATCH set_tier, suspend, unsuspend.
 * Roles: SUPER_ADMIN, USER_MANAGER.
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

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  const admin = await authenticateAdmin(req);
  if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);
  if (!adminCanAccess(admin, "users")) return adminForbidden(origin);

  const url = new URL(req.url);
  const supabase = serviceClient();

  if (req.method === "GET") {
    const singleId = url.searchParams.get("id");
    if (singleId) {
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("id", singleId)
        .maybeSingle();
      if (userError) return jsonResponse({ error: userError.message }, 500, origin);
      if (!user) return jsonResponse({ error: "User not found" }, 404, origin);

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("*")
        .eq("user_id", singleId)
        .order("created_at", { ascending: false })
        .limit(10);
      const { data: pays } = await supabase
        .from("payments")
        .select("*")
        .eq("user_id", singleId)
        .order("created_at", { ascending: false })
        .limit(10);
      let apiKeys: unknown[] = [];
      if ((user as { tier?: string }).tier === "professional") {
        const { data: keys } = await supabase
          .from("api_keys")
          .select("id, key_prefix, name, last_used_at, request_count, is_revoked, created_at")
          .eq("user_id", singleId);
        apiKeys = keys ?? [];
      }
      return jsonResponse(
        { user, subscriptions: subs ?? [], payments: pays ?? [], apiKeys },
        200,
        origin
      );
    }

    const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get("limit") || "50", 10)));
    const search = url.searchParams.get("search")?.trim() || "";
    const tier = url.searchParams.get("tier")?.trim() || "";
    const provider = url.searchParams.get("provider")?.trim() || "";
    const suspended = url.searchParams.get("suspended")?.trim() || "";

    let query = supabase.from("users").select("id, email, display_name, tier, tier_source, auth_provider, is_suspended, created_at", { count: "exact" });
    if (search) {
      query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
    }
    if (tier) query = query.eq("tier", tier);
    if (provider) query = query.eq("auth_provider", provider);
    if (suspended === "true") query = query.eq("is_suspended", true);
    if (suspended === "false") query = query.eq("is_suspended", false);

    const from = (page - 1) * limit;
    const { data: users, error: listError, count } = await query.order("created_at", { ascending: false }).range(from, from + limit - 1);
    if (listError) return jsonResponse({ error: listError.message }, 500, origin);

    const { data: tierCounts } = await supabase.from("users").select("tier").eq("is_suspended", false);
    const breakdown: Record<string, number> = { free: 0, informed: 0, professional: 0 };
    for (const r of tierCounts ?? []) {
      const t = (r as { tier: string }).tier;
      if (t in breakdown) breakdown[t]++;
    }

    return jsonResponse(
      { users: users ?? [], total: count ?? 0, page, limit, tierBreakdown: breakdown },
      200,
      origin
    );
  }

  if (req.method === "PATCH") {
    let body: {
      userId: string;
      action: string;
      tier?: string;
      suspended_reason?: string;
      isAiRequest?: boolean;
      aiPrompt?: string;
      aiProposal?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }

    const { userId, action } = body;
    if (!userId) return jsonResponse({ error: "userId required" }, 400, origin);

    const { data: existing } = await supabase.from("users").select("tier, is_suspended").eq("id", userId).maybeSingle();
    if (!existing) return jsonResponse({ error: "User not found" }, 404, origin);

    const aiMeta = {
      isAiRequest: !!body.isAiRequest,
      aiPrompt: body.aiPrompt,
      aiProposal: body.aiProposal,
    };

    if (action === "set_tier") {
      const newTier = body.tier === "professional" ? "professional" : body.tier === "informed" ? "informed" : "free";
      const beforeTier = (existing as { tier: string }).tier;
      const { error: updateError } = await supabase
        .from("users")
        .update({
          tier: newTier,
          tier_source: "manual_override",
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (updateError) return jsonResponse({ error: updateError.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_TIER_OVERRIDE",
        actionSummary: `User tier ${beforeTier} → ${newTier}`,
        targetType: "user",
        targetId: userId,
        beforeState: { tier: beforeTier },
        afterState: { tier: newTier },
        ...aiMeta,
      });
      return jsonResponse({ success: true, tier: newTier }, 200, origin);
    }

    if (action === "suspend") {
      const reason = body.suspended_reason?.trim();
      if (!reason) return jsonResponse({ error: "suspended_reason required" }, 400, origin);
      const { error: updateError } = await supabase
        .from("users")
        .update({
          is_suspended: true,
          suspended_at: new Date().toISOString(),
          suspended_reason: reason,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (updateError) return jsonResponse({ error: updateError.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_SUSPEND",
        actionSummary: `User suspended: ${reason}`,
        targetType: "user",
        targetId: userId,
        afterState: { suspended_reason: reason },
        ...aiMeta,
      });
      return jsonResponse({ success: true }, 200, origin);
    }

    if (action === "unsuspend") {
      const { error: updateError } = await supabase
        .from("users")
        .update({
          is_suspended: false,
          suspended_at: null,
          suspended_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (updateError) return jsonResponse({ error: updateError.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_UNSUSPEND",
        actionSummary: "User unsuspended",
        targetType: "user",
        targetId: userId,
        ...aiMeta,
      });
      return jsonResponse({ success: true }, 200, origin);
    }

    return jsonResponse({ error: "Unknown action" }, 400, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
