import { handleCors, jsonResponse, authenticate, serviceClient } from "../_shared/middleware.ts";

const KEY_PREFIX = "mena_sk_";
const KEY_RANDOM_LEN = 32;
const KEY_PREFIX_DISPLAY_LEN = 12;

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

function generateRawKey(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const arr = new Uint8Array(KEY_RANDOM_LEN);
  crypto.getRandomValues(arr);
  let s = KEY_PREFIX;
  for (let i = 0; i < KEY_RANDOM_LEN; i++) s += chars[arr[i]! % chars.length];
  return s;
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  const auth = await authenticate(req);
  if (!auth.isAuthenticated || !auth.userId) {
    return jsonResponse({ error: "Unauthorized" }, 401, origin);
  }
  if (auth.tier !== "professional") {
    return jsonResponse({ error: "API keys require professional tier" }, 403, origin);
  }

  const supabase = serviceClient();

  if (req.method === "GET") {
    const { data: rows } = await supabase
      .from("api_keys")
      .select("id, key_prefix, name, description, last_used_at, request_count, rate_limit_per_hour, is_revoked, revoked_at, expires_at, created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false });
    return jsonResponse({ keys: rows || [] }, 200, origin);
  }

  if (req.method === "POST") {
    const { data: config } = await supabase.from("platform_config").select("value").eq("key", "max_api_keys_per_user").maybeSingle();
    const maxKeys = (config?.value as number) ?? 5;
    const { count } = await supabase.from("api_keys").select("id", { count: "exact", head: true }).eq("user_id", auth.userId).eq("is_revoked", false);
    if ((count ?? 0) >= maxKeys) {
      return jsonResponse({ error: `Maximum ${maxKeys} API keys per user` }, 400, origin);
    }

    const rawKey = generateRawKey();
    const key_hash = await hashApiKey(rawKey);
    const key_prefix = rawKey.slice(0, KEY_PREFIX_DISPLAY_LEN);

    const { data: row, error } = await supabase
      .from("api_keys")
      .insert({
        user_id: auth.userId,
        key_hash,
        key_prefix,
        name: "Default Key",
        rate_limit_per_hour: 500,
        is_revoked: false,
        request_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      return jsonResponse({ error: error.message }, 500, origin);
    }
    return jsonResponse({
      key: rawKey,
      keyId: (row as { id: string })?.id,
      keyPrefix: key_prefix,
      warning: "Store this key. Not shown again.",
    }, 200, origin);
  }

  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      return jsonResponse({ error: "id query parameter required" }, 400, origin);
    }
    const { data: existing } = await supabase.from("api_keys").select("id").eq("id", id).eq("user_id", auth.userId).maybeSingle();
    if (!existing) {
      return jsonResponse({ error: "Key not found or access denied" }, 404, origin);
    }
    await supabase.from("api_keys").update({
      is_revoked: true,
      revoked_at: new Date().toISOString(),
      revoke_reason: "Revoked by user",
      updated_at: new Date().toISOString(),
    }).eq("id", id).eq("user_id", auth.userId);
    return jsonResponse({ success: true }, 200, origin);
  }

  return jsonResponse({ error: "Method not allowed" }, 405, origin);
});
