/**
 * Admin AI agent: POST message (with optional confirmedAction). Claude API; audit every request.
 * Roles: all (scoped by ROLE_CAPABILITIES). Never suggest scenario or disinfo changes.
 */
import { handleCors, jsonResponse } from "../_shared/middleware.ts";
import {
  authenticateAdmin,
  adminCanAccess,
  adminUnauthorized,
  adminForbidden,
  writeAuditLog,
  serviceClient,
  type AdminRole,
} from "../_shared/admin-middleware.ts";

const ROLE_CAPABILITIES: Record<AdminRole, string[]> = {
  SUPER_ADMIN: [
    "dashboard", "feed", "alerts", "pipeline", "nai", "reports", "sources", "admins", "users",
    "subscriptions", "api-keys", "disputes", "payments", "pricing", "tier-features", "config", "audit",
  ],
  INTEL_ANALYST: ["pipeline", "nai", "reports", "sources", "alerts", "dashboard", "audit"],
  USER_MANAGER: ["users", "subscriptions", "api-keys", "disputes", "dashboard", "audit"],
  FINANCE_MANAGER: ["payments", "pricing", "subscriptions", "dashboard", "audit"],
  CONTENT_REVIEWER: ["reports", "feed", "dashboard", "audit"],
};

const HARD_RULES = `
1. PROPOSE ONLY — end every action suggestion with "Confirm?" Never say "I did X".
2. If the requested action is outside your role capabilities, say which role can do it.
3. NEVER suggest changes to scenario probabilities (public platform, not admin).
4. NEVER suggest changes to disinformation tracker entries (public platform, not admin).
5. Structural neutrality — never suggest content changes that favor one party.
6. For multi-step tasks: guide one step at a time.
7. Be direct and brief — this is an ops tool, not a chatbot.`;

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405, origin);

  const admin = await authenticateAdmin(req);
  if (!admin || !admin.isAuthenticated) return adminUnauthorized(origin);

  let body: {
    message?: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    currentPage?: string;
    confirmedAction?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON" }, 400, origin);
  }

  if (body.confirmedAction != null) {
    await writeAuditLog({
      adminId: admin.adminId,
      adminRole: admin.role,
      adminEmail: admin.email,
      actionType: "AI_AGENT_CONFIRMED",
      actionSummary: "Admin confirmed an AI-suggested action",
      afterState: body.confirmedAction as Record<string, unknown>,
      isAiRequest: true,
      aiProposal: JSON.stringify(body.confirmedAction),
      confirmedBy: admin.adminId,
    });
    return jsonResponse({ success: true }, 200, origin);
  }

  const message = body.message?.trim() ?? "";
  const currentPage = (body.currentPage as string) || "dashboard";
  const capabilities = ROLE_CAPABILITIES[admin.role] ?? [];
  if (!message) return jsonResponse({ error: "message required" }, 400, origin);

  const supabase = serviceClient();
  const { data: conflictDayRow } = await supabase.rpc("get_current_conflict_day");
  const currentConflictDay = Array.isArray(conflictDayRow) ? conflictDayRow[0] : conflictDayRow ?? 0;
  const today = new Date().toISOString().slice(0, 10);

  let pageContext = "";
  if (currentPage === "pipeline") {
    const { data: lastRun } = await supabase
      .from("pipeline_runs")
      .select("id, status, stage, started_at, error_message")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    pageContext = lastRun
      ? `Last pipeline run: status=${(lastRun as { status: string }).status}, stage=${(lastRun as { stage: string }).stage}, started=${(lastRun as { started_at: string }).started_at}. ${(lastRun as { error_message?: string }).error_message ? `Error: ${(lastRun as { error_message: string }).error_message}` : ""}`
      : "No pipeline runs yet.";
  } else if (currentPage === "sources") {
    const { count } = await supabase
      .from("article_sources")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true)
      .in("health_status", ["failing", "timeout", "blocked"]);
    pageContext = `Failing sources count: ${count ?? 0}.`;
  } else if (currentPage === "users") {
    const { count } = await supabase
      .from("users")
      .select("id", { count: "exact", head: true })
      .eq("is_suspended", true);
    pageContext = `Suspended users count: ${count ?? 0}.`;
  } else if (currentPage === "payments") {
    const { count } = await supabase
      .from("payments")
      .select("id", { count: "exact", head: true })
      .eq("status", "failed");
    pageContext = `Failed payments count: ${count ?? 0}.`;
  }

  const adminName = admin.displayName || admin.email;
  const systemPrompt = `You are the MENA Intel Desk admin assistant.

Admin: ${adminName} (${admin.email}), role: ${admin.role}. Current page: ${currentPage}.
Today's date: ${today}. Conflict day: ${currentConflictDay}.

Your capabilities for THIS role (do not suggest actions outside these): ${capabilities.join(", ")}.

HARD RULES:
${HARD_RULES}

NEUTRALITY: When discussing intel or content, maintain structural neutrality. Never suggest content changes that favor one party.

Current page context: ${pageContext}

Be direct and brief. For any action (tier change, suspend, config, etc.), PROPOSE it and end with "Confirm?" — never say "I did X". The admin confirms in the UI.`;

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return jsonResponse({ error: "AI not configured" }, 503, origin);
  }

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [];
  const history = Array.isArray(body.conversationHistory) ? body.conversationHistory.slice(-10) : [];
  for (const m of history) {
    const role = m.role === "assistant" ? "assistant" : "user";
    messages.push({ role, content: typeof m.content === "string" ? m.content : "" });
  }
  if (message) messages.push({ role: "user", content: message });

  let responseText = "I can only propose actions; confirm in the UI to apply them.";
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        system: systemPrompt,
        messages,
      }),
    });
    if (!res.ok) {
      const err = await res.text();
      responseText = `API error: ${res.status} ${err}`;
    } else {
      const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
      const block = data.content?.find((c) => c.type === "text");
      responseText = block?.text ?? responseText;
    }
  } catch (e) {
    responseText = e instanceof Error ? e.message : "Request failed";
  }

  await writeAuditLog({
    adminId: admin.adminId,
    adminRole: admin.role,
    adminEmail: admin.email,
    actionType: "AI_AGENT_REQUEST",
    actionSummary: `Agent message on page ${currentPage}`,
    isAiRequest: true,
    aiPrompt: message ?? undefined,
    aiProposal: responseText.slice(0, 2000),
  });

  return jsonResponse(
    {
      response: responseText,
      role: admin.role,
      capabilities,
      currentPage,
    },
    200,
    origin
  );
});
