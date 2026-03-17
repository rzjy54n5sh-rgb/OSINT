import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type UserTier = "free" | "informed" | "professional";

export type AuthContext = {
  userId: string | null;
  tier: UserTier;
  isAuthenticated: boolean;
};

export type FeatureFlagsMap = Record<
  string,
  { free_access: boolean; informed_access: boolean; pro_access: boolean }
>;

let featureFlagsCache: { data: FeatureFlagsMap; expires: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

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

async function hashApiKey(rawKey: string): Promise<string> {
  const secret = Deno.env.get("API_KEY_SECRET");
  if (!secret) return "";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(rawKey));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function authenticate(req: Request): Promise<AuthContext> {
  const apiKey = req.headers.get("X-MENA-API-Key")?.trim();
  if (apiKey) {
    const supabase = serviceClient();
    const keyHash = await hashApiKey(apiKey);
    if (!keyHash) return { userId: null, tier: "free", isAuthenticated: false };
    const { data: row } = await supabase
      .from("api_keys")
      .select("user_id")
      .eq("key_hash", keyHash)
      .eq("is_revoked", false)
      .maybeSingle();
    if (row?.user_id) {
      return {
        userId: row.user_id,
        tier: "professional",
        isAuthenticated: true,
      };
    }
  }

  const authHeader = req.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
  if (!token) return { userId: null, tier: "free", isAuthenticated: false };

  const supabase = createClient(getSupabaseUrl(), getAnonKey(), {
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(token);
  if (userError || !user) return { userId: null, tier: "free", isAuthenticated: false };

  const { data: profile } = await supabase
    .from("users")
    .select("tier, is_suspended")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.is_suspended)
    return { userId: user.id, tier: "free", isAuthenticated: false };

  const tier = (profile?.tier as UserTier) ?? "free";
  return { userId: user.id, tier, isAuthenticated: true };
}

export async function getFeatureFlags(): Promise<FeatureFlagsMap> {
  const now = Date.now();
  if (featureFlagsCache && featureFlagsCache.expires > now)
    return featureFlagsCache.data;
  const supabase = serviceClient();
  const { data: rows } = await supabase
    .from("tier_features")
    .select("feature_key, free_access, informed_access, pro_access");
  const map: FeatureFlagsMap = {};
  for (const r of rows ?? []) {
    map[r.feature_key] = {
      free_access: !!r.free_access,
      informed_access: !!r.informed_access,
      pro_access: !!r.pro_access,
    };
  }
  featureFlagsCache = { data: map, expires: now + CACHE_TTL_MS };
  return map;
}

export function tierHasFeature(
  tier: UserTier,
  featureKey: string,
  flags: FeatureFlagsMap
): boolean {
  const f = flags[featureKey];
  if (!f) return false;
  if (tier === "free") return f.free_access;
  if (tier === "informed") return f.informed_access;
  return f.pro_access;
}

import { corsHeaders as getCorsHeaders } from "./cors.ts";

export function jsonResponse(
  data: unknown,
  status = 200,
  origin = ""
): Response {
  const cors = getCorsHeaders(origin);
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...cors,
    },
  });
}

export { corsHeaders, handleCors } from "./cors.ts";
