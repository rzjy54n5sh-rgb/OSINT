/**
 * Admin pipeline: GET last runs + failing sources + conflict day; POST trigger or schedule.
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

  const admin = await authenticateAdmin(req);
  if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);
  if (!adminCanAccess(admin, "pipeline")) return adminForbidden(origin);

  const url = new URL(req.url);
  const pathParts = url.pathname.split("/").filter(Boolean);
  const lastPart = pathParts[pathParts.length - 1];

  if (req.method === "GET") {
    const supabase = serviceClient();
    const { data: conflictDayRow } = await supabase.rpc("get_current_conflict_day");
    const currentConflictDay = Array.isArray(conflictDayRow) ? conflictDayRow[0] : conflictDayRow ?? null;

    const { data: runs } = await supabase
      .from("pipeline_runs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    const { data: failingSources } = await supabase
      .from("article_sources")
      .select("id, name, display_name, health_status, last_error, consecutive_failures")
      .eq("is_active", true)
      .in("health_status", ["failing", "timeout", "blocked"]);

    return jsonResponse(
      {
        pipelineRuns: runs ?? [],
        failingSources: failingSources ?? [],
        currentConflictDay: currentConflictDay ?? 0,
      },
      200,
      origin
    );
  }

  if (req.method === "POST") {
    let body: {
      action?: string;
      stage?: string;
      conflictDay?: number;
      isAiRequest?: boolean;
      aiPrompt?: string;
      aiProposal?: string;
      cron?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON" }, 400, origin);
    }

    const action = body.action === "schedule" ? "schedule" : "trigger";

    if (action === "trigger") {
      const stage = (body.stage as string) || "full";
      const conflictDay = body.conflictDay ?? null;
      const supabase = serviceClient();

      const runDate = new Date().toISOString().slice(0, 10);
      const { data: conflictDayRow } = await supabase.rpc("get_current_conflict_day");
      const currentDay = Array.isArray(conflictDayRow) ? conflictDayRow[0] : conflictDayRow;
      const cd = conflictDay ?? currentDay ?? 1;

      const { data: runRow, error: runError } = await supabase
        .from("pipeline_runs")
        .insert({
          run_date: runDate,
          conflict_day: cd,
          stage,
          status: "running",
          triggered_by: "manual_admin",
          triggered_by_user: admin.adminId,
          started_at: new Date().toISOString(),
        })
        .select("id")
        .single();

      if (runError) {
        return jsonResponse({ error: runError.message }, 500, origin);
      }

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "PIPELINE_TRIGGER",
        actionSummary: `Manual pipeline trigger: stage=${stage}, conflict_day=${cd}`,
        targetType: "pipeline_run",
        targetId: (runRow as { id: string })?.id,
        afterState: { stage, conflictDay: cd, runId: (runRow as { id: string })?.id },
        isAiRequest: !!body.isAiRequest,
        aiPrompt: body.aiPrompt ?? undefined,
        aiProposal: body.aiProposal ?? undefined,
      });

      return jsonResponse(
        {
          runId: (runRow as { id: string })?.id,
          stage,
          message:
            "Pipeline run created. Execution is triggered by GitHub Actions when it polls for manual_admin runs.",
        },
        200,
        origin
      );
    }

    if (action === "schedule") {
      const cron = typeof body.cron === "string" ? body.cron.trim() : "";
      const parts = cron.split(/\s+/).filter(Boolean);
      if (parts.length !== 5) {
        return jsonResponse(
          { error: "Invalid cron: must have exactly 5 space-separated fields" },
          400,
          origin
        );
      }

      const supabase = serviceClient();
      const { data: oldRow } = await supabase
        .from("platform_config")
        .select("value")
        .eq("key", "pipeline_cron")
        .maybeSingle();
      const beforeCron = (oldRow?.value as string) ?? "";

      const { error: updateError } = await supabase
        .from("platform_config")
        .update({ value: JSON.stringify(cron), updated_at: new Date().toISOString() })
        .eq("key", "pipeline_cron");

      if (updateError) {
        return jsonResponse({ error: updateError.message }, 500, origin);
      }

      await writeAuditLog({
        adminId: admin.adminId,
        adminRole: admin.role,
        adminEmail: admin.email,
        actionType: "PIPELINE_SCHEDULE_CHANGE",
        actionSummary: `Pipeline cron changed: ${beforeCron} → ${cron}`,
        targetType: "platform_config",
        targetId: "pipeline_cron",
        beforeState: { pipeline_cron: beforeCron },
        afterState: { pipeline_cron: cron },
      });

      return jsonResponse({ success: true, newCron: cron }, 200, origin);
    }

    return jsonResponse({ error: "Unknown action" }, 400, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
