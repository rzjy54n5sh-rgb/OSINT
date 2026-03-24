/**
 * Admin users: GET paginated list or single user (with events, notes, audit log);
 * PATCH set_tier, suspend, unsuspend;
 * POST update_status, add_note, update_note, delete_note, bulk_action.
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

      const { data: events } = await supabase
        .from("user_events")
        .select("*")
        .eq("user_id", singleId)
        .order("created_at", { ascending: false })
        .limit(50);

      const { data: notes } = await supabase
        .from("user_notes")
        .select("*")
        .eq("user_id", singleId)
        .order("is_pinned", { ascending: false })
        .order("created_at", { ascending: false });

      const { data: auditLog } = await supabase
        .from("admin_audit_log")
        .select("*")
        .eq("target_id", singleId)
        .order("created_at", { ascending: false })
        .limit(20);

      return jsonResponse(
        {
          user,
          subscriptions: subs ?? [],
          payments: pays ?? [],
          apiKeys,
          events: events ?? [],
          notes: notes ?? [],
          auditLog: auditLog ?? [],
        },
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
    const status = url.searchParams.get("status")?.trim() || "";
    const sortBy = url.searchParams.get("sort_by")?.trim() || "newest";

    let query = supabase.from("users").select("id, email, display_name, tier, tier_source, auth_provider, is_suspended, created_at, status, login_count, last_login_at, total_spent_usd, country_code, tags", { count: "exact" });
    if (search) {
      query = query.or(`email.ilike.%${search}%,display_name.ilike.%${search}%`);
    }
    if (tier) query = query.eq("tier", tier);
    if (provider) query = query.eq("auth_provider", provider);
    if (suspended === "true") query = query.eq("is_suspended", true);
    if (suspended === "false") query = query.eq("is_suspended", false);
    if (status) query = query.eq("status", status);

    // Apply sorting
    if (sortBy === "oldest") {
      query = query.order("created_at", { ascending: true });
    } else if (sortBy === "most_spent") {
      query = query.order("total_spent_usd", { ascending: false, nullsFirst: false });
    } else if (sortBy === "last_active") {
      query = query.order("last_login_at", { ascending: false, nullsFirst: false });
    } else if (sortBy === "email_az") {
      query = query.order("email", { ascending: true });
    } else {
      // "newest" (default)
      query = query.order("created_at", { ascending: false });
    }

    const from = (page - 1) * limit;
    const { data: users, error: listError, count } = await query.range(from, from + limit - 1);
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

  if (req.method === "POST") {
    // Role gate: POST actions require SUPER_ADMIN or USER_MANAGER
    const allowedRoles = ["SUPER_ADMIN", "USER_MANAGER"];

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }

    const action = body.action as string;
    if (!action) return jsonResponse({ error: "action field required" }, 400, origin);

    // ── update_status ──
    if (action === "update_status") {
      if (!allowedRoles.includes(admin.role))
        return jsonResponse({ error: "Insufficient role for update_status" }, 403, origin);

      const userId = body.user_id as string;
      const newStatus = body.status as string;
      const reason = (body.reason as string) || "";
      if (!userId || !newStatus)
        return jsonResponse({ error: "user_id and status required" }, 400, origin);
      if (!["active", "suspended", "banned"].includes(newStatus))
        return jsonResponse({ error: "status must be active, suspended, or banned" }, 400, origin);

      const { data: existing } = await supabase
        .from("users")
        .select("status")
        .eq("id", userId)
        .maybeSingle();
      if (!existing) return jsonResponse({ error: "User not found" }, 404, origin);

      const beforeStatus = (existing as { status: string }).status;

      const { error: updateErr } = await supabase
        .from("users")
        .update({
          status: newStatus,
          status_reason: reason,
          status_changed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500, origin);

      // If banning, revoke all API keys
      if (newStatus === "banned") {
        await supabase
          .from("api_keys")
          .update({ is_revoked: true })
          .eq("user_id", userId);
      }

      // Determine event type
      let eventType = "account_reinstated";
      if (newStatus === "suspended") eventType = "account_suspended";
      else if (newStatus === "banned") eventType = "account_banned";

      await supabase.from("user_events").insert({
        user_id: userId,
        event_type: eventType,
        metadata: { reason, changed_by: admin.adminId },
        created_at: new Date().toISOString(),
      });

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_STATUS_UPDATE",
        actionSummary: `User status ${beforeStatus} → ${newStatus}${reason ? `: ${reason}` : ""}`,
        targetType: "user",
        targetId: userId,
        beforeState: { status: beforeStatus },
        afterState: { status: newStatus, reason },
      });

      return jsonResponse({ success: true, status: newStatus }, 200, origin);
    }

    // ── add_note ──
    if (action === "add_note") {
      if (!allowedRoles.includes(admin.role))
        return jsonResponse({ error: "Insufficient role for add_note" }, 403, origin);

      const userId = body.user_id as string;
      const note = body.note as string;
      const isPinned = !!body.is_pinned;
      if (!userId || !note)
        return jsonResponse({ error: "user_id and note required" }, 400, origin);

      const { data: inserted, error: insertErr } = await supabase
        .from("user_notes")
        .insert({
          user_id: userId,
          admin_id: admin.adminId,
          note,
          is_pinned: isPinned,
          created_at: new Date().toISOString(),
        })
        .select()
        .maybeSingle();
      if (insertErr) return jsonResponse({ error: insertErr.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_NOTE_ADDED",
        actionSummary: `Note added for user ${userId}`,
        targetType: "user",
        targetId: userId,
        afterState: { note_id: inserted?.id, is_pinned: isPinned },
      });

      return jsonResponse({ success: true, note: inserted }, 200, origin);
    }

    // ── update_note ──
    if (action === "update_note") {
      if (!allowedRoles.includes(admin.role))
        return jsonResponse({ error: "Insufficient role for update_note" }, 403, origin);

      const noteId = body.note_id as string;
      if (!noteId) return jsonResponse({ error: "note_id required" }, 400, origin);

      const updates: Record<string, unknown> = {};
      if (body.note !== undefined) updates.note = body.note;
      if (body.is_pinned !== undefined) updates.is_pinned = body.is_pinned;
      updates.updated_at = new Date().toISOString();

      const { error: updateErr } = await supabase
        .from("user_notes")
        .update(updates)
        .eq("id", noteId);
      if (updateErr) return jsonResponse({ error: updateErr.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_NOTE_UPDATED",
        actionSummary: `Note ${noteId} updated`,
        targetType: "user_note",
        targetId: noteId,
        afterState: updates,
      });

      return jsonResponse({ success: true }, 200, origin);
    }

    // ── delete_note ──
    if (action === "delete_note") {
      if (!allowedRoles.includes(admin.role))
        return jsonResponse({ error: "Insufficient role for delete_note" }, 403, origin);

      const noteId = body.note_id as string;
      if (!noteId) return jsonResponse({ error: "note_id required" }, 400, origin);

      const { error: deleteErr } = await supabase
        .from("user_notes")
        .delete()
        .eq("id", noteId);
      if (deleteErr) return jsonResponse({ error: deleteErr.message }, 500, origin);

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "USER_NOTE_DELETED",
        actionSummary: `Note ${noteId} deleted`,
        targetType: "user_note",
        targetId: noteId,
      });

      return jsonResponse({ success: true }, 200, origin);
    }

    // ── bulk_action ──
    if (action === "bulk_action") {
      if (!allowedRoles.includes(admin.role))
        return jsonResponse({ error: "Insufficient role for bulk_action" }, 403, origin);

      const userIds = body.user_ids as string[];
      const bulkAction = body.bulk_action as string;
      const reason = (body.reason as string) || "";
      const tag = (body.tag as string) || "";

      if (!Array.isArray(userIds) || userIds.length === 0)
        return jsonResponse({ error: "user_ids array required" }, 400, origin);
      if (userIds.length > 100)
        return jsonResponse({ error: "Maximum 100 users per bulk action" }, 400, origin);
      if (!bulkAction)
        return jsonResponse({ error: "bulk_action required" }, 400, origin);
      if (!["suspend", "unsuspend", "add_tag", "remove_tag"].includes(bulkAction))
        return jsonResponse({ error: "bulk_action must be suspend, unsuspend, add_tag, or remove_tag" }, 400, origin);

      let successCount = 0;
      const errors: string[] = [];

      for (const uid of userIds) {
        try {
          if (bulkAction === "suspend") {
            const { error } = await supabase
              .from("users")
              .update({
                status: "suspended",
                status_reason: reason,
                status_changed_at: new Date().toISOString(),
                is_suspended: true,
                suspended_at: new Date().toISOString(),
                suspended_reason: reason,
                updated_at: new Date().toISOString(),
              })
              .eq("id", uid);
            if (error) { errors.push(`${uid}: ${error.message}`); continue; }
          } else if (bulkAction === "unsuspend") {
            const { error } = await supabase
              .from("users")
              .update({
                status: "active",
                status_reason: null,
                status_changed_at: new Date().toISOString(),
                is_suspended: false,
                suspended_at: null,
                suspended_reason: null,
                updated_at: new Date().toISOString(),
              })
              .eq("id", uid);
            if (error) { errors.push(`${uid}: ${error.message}`); continue; }
          } else if (bulkAction === "add_tag") {
            if (!tag) { errors.push(`${uid}: tag required for add_tag`); continue; }
            // Fetch current tags, append new one
            const { data: u } = await supabase
              .from("users")
              .select("tags")
              .eq("id", uid)
              .maybeSingle();
            const currentTags: string[] = Array.isArray((u as { tags?: string[] })?.tags) ? (u as { tags: string[] }).tags : [];
            if (!currentTags.includes(tag)) {
              const { error } = await supabase
                .from("users")
                .update({ tags: [...currentTags, tag], updated_at: new Date().toISOString() })
                .eq("id", uid);
              if (error) { errors.push(`${uid}: ${error.message}`); continue; }
            }
          } else if (bulkAction === "remove_tag") {
            if (!tag) { errors.push(`${uid}: tag required for remove_tag`); continue; }
            const { data: u } = await supabase
              .from("users")
              .select("tags")
              .eq("id", uid)
              .maybeSingle();
            const currentTags: string[] = Array.isArray((u as { tags?: string[] })?.tags) ? (u as { tags: string[] }).tags : [];
            const { error } = await supabase
              .from("users")
              .update({ tags: currentTags.filter((t: string) => t !== tag), updated_at: new Date().toISOString() })
              .eq("id", uid);
            if (error) { errors.push(`${uid}: ${error.message}`); continue; }
          }
          successCount++;
        } catch (e) {
          errors.push(`${uid}: ${(e as Error).message}`);
        }
      }

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "BULK_USER_ACTION",
        actionSummary: `Bulk ${bulkAction}: ${successCount}/${userIds.length} users${tag ? `, tag=${tag}` : ""}${reason ? `, reason=${reason}` : ""}`,
        targetType: "user",
        targetId: userIds.join(","),
        afterState: { bulkAction, successCount, totalRequested: userIds.length, errors },
      });

      return jsonResponse({ success: true, successCount, totalRequested: userIds.length, errors }, 200, origin);
    }

    return jsonResponse({ error: "Unknown POST action" }, 400, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
