/**
 * Admin sources: GET list + health summary; POST add; POST /test (no DB); PATCH edit; DELETE.
 * Roles: SUPER_ADMIN, INTEL_ANALYST.
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

  const url = new URL(req.url);
  const pathname = url.pathname;
  const isTestRoute = pathname.endsWith("/test");

  if (isTestRoute && req.method === "POST") {
    const admin = await authenticateAdmin(req);
    if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);
    if (!adminCanAccess(admin, "sources")) return adminForbidden(origin);

    let body: { rss_url: string; use_google_news_proxy?: boolean };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }
    const rssUrl = body.rss_url?.trim();
    if (!rssUrl) return jsonResponse({ error: "rss_url required" }, 400, origin);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let success = false;
    let status = 0;
    let contentType = "";
    let isValidFeed = false;
    let message = "";
    let suggestion: string | undefined;

    try {
      const res = await fetch(rssUrl, {
        signal: controller.signal,
        headers: { "User-Agent": "MENA-Intel-Desk-Source-Test/1.0" },
      });
      status = res.status;
      contentType = res.headers.get("content-type") || "";
      success = res.ok;
      const text = await res.text();
      isValidFeed = text.includes("<rss") || text.includes("<feed") || text.includes("<?xml");
      if (!res.ok) message = `HTTP ${res.status}`;
      else if (!isValidFeed) {
        message = "Response does not look like RSS/Atom";
        suggestion = "Check URL and content-type.";
      } else message = "OK";
    } catch (e) {
      message = e instanceof Error ? e.message : "Request failed";
      if (message.includes("abort")) suggestion = "Timeout (10s). Try a faster source or proxy.";
    } finally {
      clearTimeout(timeout);
    }

    return jsonResponse(
      { success, status, isValidFeed, contentType, message, suggestion },
      200,
      origin
    );
  }

  const admin = await authenticateAdmin(req);
  if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);
  if (!adminCanAccess(admin, "sources")) return adminForbidden(origin);

  const supabase = serviceClient();

  if (req.method === "GET") {
    const language = url.searchParams.get("language")?.trim() || "";
    const category = url.searchParams.get("category")?.trim() || "";
    const health = url.searchParams.get("health")?.trim() || "";
    const partySource = url.searchParams.get("party_source")?.trim() || "";
    const search = url.searchParams.get("search")?.trim() || "";

    let query = supabase.from("article_sources").select("*");
    if (language) query = query.eq("language", language);
    if (category) query = query.eq("category", category);
    if (health) query = query.eq("health_status", health);
    if (partySource === "true") query = query.eq("is_party_source", true);
    if (partySource === "false") query = query.eq("is_party_source", false);
    if (search) query = query.or(`name.ilike.%${search}%,display_name.ilike.%${search}%`);

    const { data: sources, error } = await query.order("name");
    if (error) return jsonResponse({ error: error.message }, 500, origin);

    const healthCounts: Record<string, number> = {};
    const languageCounts: Record<string, number> = {};
    let partyCount = 0;
    for (const s of sources ?? []) {
      const h = (s as { health_status: string }).health_status;
      healthCounts[h] = (healthCounts[h] || 0) + 1;
      const lang = (s as { language: string }).language;
      languageCounts[lang] = (languageCounts[lang] || 0) + 1;
      if ((s as { is_party_source: boolean }).is_party_source) partyCount++;
    }

    return jsonResponse(
      {
        sources: sources ?? [],
        healthSummary: healthCounts,
        languageBreakdown: languageCounts,
        partySourceCount: partyCount,
      },
      200,
      origin
    );
  }

  if (req.method === "POST") {
    let body: { name: string; display_name: string; url: string; language?: string; category?: string; rss_url?: string; is_party_source?: boolean; [k: string]: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }
    const { name, display_name, url } = body;
    if (!name?.trim() || !display_name?.trim() || !url?.trim()) {
      return jsonResponse({ error: "name, display_name, url required" }, 400, origin);
    }

    const { data: inserted, error: insertError } = await supabase
      .from("article_sources")
      .insert({
        name: name.trim(),
        display_name: display_name.trim(),
        url: url.trim(),
        rss_url: body.rss_url?.trim() || url.trim(),
        language: body.language || "en",
        category: body.category || "general",
        is_party_source: !!body.is_party_source,
        is_active: true,
        health_status: "active",
        added_by: admin.adminId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError) return jsonResponse({ error: insertError.message }, 500, origin);

    await writeAuditLog({
      adminId: admin.adminId,
      adminRole: admin.role,
      adminEmail: admin.email,
      actionType: "RSS_SOURCE_ADD",
      actionSummary: `Added source: ${name}`,
      targetType: "article_source",
      targetId: (inserted as { id: string })?.id,
      afterState: inserted as unknown as Record<string, unknown>,
    });
    return jsonResponse({ success: true, source: inserted }, 200, origin);
  }

  if (req.method === "PATCH") {
    let body: { sourceId: string; is_active?: boolean; [k: string]: unknown };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }
    const { sourceId, ...fields } = body;
    if (!sourceId) return jsonResponse({ error: "sourceId required" }, 400, origin);

    const { data: before } = await supabase.from("article_sources").select("*").eq("id", sourceId).maybeSingle();
    if (!before) return jsonResponse({ error: "Source not found" }, 404, origin);

    const updatePayload: Record<string, unknown> = { ...fields, updated_at: new Date().toISOString() };
    const { error: updateError } = await supabase.from("article_sources").update(updatePayload).eq("id", sourceId);
    if (updateError) return jsonResponse({ error: updateError.message }, 500, origin);

    const activeChanged = typeof body.is_active === "boolean" && (before as { is_active: boolean }).is_active !== body.is_active;
    const actionType = activeChanged ? "RSS_SOURCE_TOGGLE" : "RSS_SOURCE_EDIT";
    await writeAuditLog({
      adminId: admin.adminId,
      adminRole: admin.role,
      adminEmail: admin.email,
      actionType,
      actionSummary: activeChanged ? `Source is_active → ${body.is_active}` : "Source updated",
      targetType: "article_source",
      targetId: sourceId,
      beforeState: before as unknown as Record<string, unknown>,
      afterState: updatePayload,
    });
    return jsonResponse({ success: true }, 200, origin);
  }

  if (req.method === "DELETE") {
    const id = url.searchParams.get("id");
    if (!id) return jsonResponse({ error: "id query parameter required" }, 400, origin);

    const { data: before } = await supabase.from("article_sources").select("*").eq("id", id).maybeSingle();
    if (!before) return jsonResponse({ error: "Source not found" }, 404, origin);

    const { error: deleteError } = await supabase.from("article_sources").delete().eq("id", id);
    if (deleteError) return jsonResponse({ error: deleteError.message }, 500, origin);

    await writeAuditLog({
      adminId: admin.adminId,
      adminRole: admin.role,
      adminEmail: admin.email,
      actionType: "RSS_SOURCE_DELETE",
      actionSummary: `Deleted source: ${(before as { name: string }).name}`,
      targetType: "article_source",
      targetId: id,
      beforeState: before as unknown as Record<string, unknown>,
    });
    return jsonResponse({ success: true }, 200, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
