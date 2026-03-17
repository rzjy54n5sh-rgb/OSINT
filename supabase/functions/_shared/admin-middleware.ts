/**
 * Admin RBAC: authenticate admin, check page access, write audit log.
 * Every admin function must use authenticateAdmin and writeAuditLog for writes.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "./cors.ts";
import { jsonResponse } from "./middleware.ts";

export type AdminRole =
  | "SUPER_ADMIN"
  | "INTEL_ANALYST"
  | "USER_MANAGER"
  | "FINANCE_MANAGER"
  | "CONTENT_REVIEWER";

export type AdminContext = {
  adminId: string;
  userId: string;
  email: string;
  displayName: string;
  role: AdminRole;
  isAuthenticated: boolean;
};

export type AuditLogEntry = {
  adminId: string;
  adminRole: AdminRole;
  adminEmail: string;
  actionType: string;
  actionSummary: string;
  targetType?: string;
  targetId?: string;
  targetLabel?: string;
  beforeState?: unknown;
  afterState?: unknown;
  isAiRequest?: boolean;
  aiPrompt?: string;
  aiProposal?: string;
  confirmedBy?: string;
};

export const PAGE_PERMISSIONS: Record<string, AdminRole[]> = {
  dashboard: ["SUPER_ADMIN", "INTEL_ANALYST", "USER_MANAGER", "FINANCE_MANAGER", "CONTENT_REVIEWER"],
  feed: ["SUPER_ADMIN", "INTEL_ANALYST", "CONTENT_REVIEWER"],
  alerts: ["SUPER_ADMIN", "INTEL_ANALYST"],
  pipeline: ["SUPER_ADMIN", "INTEL_ANALYST"],
  nai: ["SUPER_ADMIN", "INTEL_ANALYST"],
  reports: ["SUPER_ADMIN", "INTEL_ANALYST", "CONTENT_REVIEWER"],
  sources: ["SUPER_ADMIN", "INTEL_ANALYST"],
  admins: ["SUPER_ADMIN"],
  users: ["SUPER_ADMIN", "USER_MANAGER"],
  subscriptions: ["SUPER_ADMIN", "USER_MANAGER", "FINANCE_MANAGER"],
  "api-keys": ["SUPER_ADMIN", "USER_MANAGER"],
  disputes: ["SUPER_ADMIN", "USER_MANAGER"],
  payments: ["SUPER_ADMIN", "FINANCE_MANAGER"],
  pricing: ["SUPER_ADMIN", "FINANCE_MANAGER"],
  "tier-features": ["SUPER_ADMIN"],
  config: ["SUPER_ADMIN"],
  audit: ["SUPER_ADMIN", "INTEL_ANALYST", "USER_MANAGER", "FINANCE_MANAGER", "CONTENT_REVIEWER"],
};

function getSupabaseUrl(): string {
  const u = Deno.env.get("SUPABASE_URL");
  if (!u) throw new Error("SUPABASE_URL not set");
  return u;
}

function getAnonKey(): string {
  const k = Deno.env.get("SUPABASE_ANON_KEY");
  if (!k) throw new Error("SUPABASE_ANON_KEY not set");
  return k;
}

function getServiceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return k;
}

export function serviceClient(): SupabaseClient {
  return createClient(getSupabaseUrl(), getServiceKey());
}

export async function authenticateAdmin(req: Request): Promise<AdminContext | null> {
  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return null;

  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) return null;

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id, user_id, email, display_name, role, is_active")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .maybeSingle();

  if (!adminRow) return null;

  return {
    adminId: adminRow.id as string,
    userId: adminRow.user_id as string,
    email: (adminRow.email as string) || user.email || "",
    displayName: (adminRow.display_name as string) || "",
    role: adminRow.role as AdminRole,
    isAuthenticated: true,
  };
}

export function adminCanAccess(admin: AdminContext, page: string): boolean {
  const roles = PAGE_PERMISSIONS[page];
  if (!roles) return false;
  return roles.includes(admin.role);
}

export async function writeAuditLog(entry: AuditLogEntry): Promise<void> {
  const supabase = serviceClient();
  await supabase.from("admin_audit_log").insert({
    admin_id: entry.adminId,
    admin_role: entry.adminRole,
    admin_email: entry.adminEmail,
    action_type: entry.actionType,
    action_summary: entry.actionSummary,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    target_label: entry.targetLabel ?? null,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
    is_ai_request: entry.isAiRequest ?? false,
    ai_prompt: entry.aiPrompt ?? null,
    ai_proposal: entry.aiProposal ?? null,
    confirmed_by: entry.confirmedBy ?? null,
  });
}

export function adminUnauthorized(origin: string): Response {
  return jsonResponse({ error: "Unauthorized" }, 401, origin);
}

export function adminForbidden(origin: string, role?: string): Response {
  return jsonResponse(
    { error: "Forbidden", message: role ? `Requires role: ${role}` : "Insufficient permissions" },
    403,
    origin
  );
}
