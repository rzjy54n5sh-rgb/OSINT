import { handleCors, jsonResponse, serviceClient } from "../_shared/middleware.ts";

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("Origin") || "";
  const preflight = handleCors(req, origin);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, origin);
  }

  let body: { article_id?: string; article_url?: string; claim_text?: string; source_url?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ success: false, error: "Invalid JSON" }, 400, origin);
  }

  const article_id = body.article_id?.trim();
  const claim_text = body.claim_text?.trim();
  const source_url = body.source_url?.trim();
  if (!article_id || !claim_text || !source_url) {
    return jsonResponse({ success: false, error: "article_id, claim_text, and source_url are required" }, 400, origin);
  }

  const supabase = serviceClient();
  const { data: row, error } = await supabase.from("disputes").insert({
    article_id,
    article_url: body.article_url?.trim() || null,
    claim_text,
    source_url,
  }).select("id").single();

  if (error) {
    return jsonResponse({ success: false, error: error.message }, 500, origin);
  }

  return jsonResponse({
    success: true,
    disputeId: (row as { id: string })?.id ?? "",
    message: "Dispute submitted successfully.",
  }, 200, origin);
});
