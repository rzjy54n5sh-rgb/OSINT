import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { dailyDigestTemplate, type DigestData } from "../_shared/digest-template.ts";

type UserTier = "free" | "informed" | "professional";

const COUNTRY_NAMES: Record<string, string> = {
  IR: "Iran",
  US: "United States",
  IL: "Israel",
  SA: "Saudi Arabia",
  AE: "UAE",
  IQ: "Iraq",
  LB: "Lebanon",
  YE: "Yemen",
  JO: "Jordan",
  EG: "Egypt",
  TR: "Türkiye",
  RU: "Russia",
  CN: "China",
  GB: "United Kingdom",
  FR: "France",
  DE: "Germany",
  QA: "Qatar",
  KW: "Kuwait",
  IN: "India",
  PK: "Pakistan",
};

const LEAD_LABELS = [
  "A — Ceasefire",
  "B — Prolonged War",
  "C — Cascade / Dual Closure",
  "D — Escalation Spiral",
];

function getSupabaseUrl(): string {
  const u = Deno.env.get("SUPABASE_URL");
  if (!u) throw new Error("SUPABASE_URL not set");
  return u;
}

function getServiceKey(): string {
  const k = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!k) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");
  return k;
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function verifyServiceRole(req: Request): boolean {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  const serviceKey = getServiceKey();
  return token.length > 0 && token === serviceKey;
}

function normalizeTier(t: string | null | undefined): UserTier {
  if (t === "informed" || t === "professional") return t;
  return "free";
}

function pct(n: unknown): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x);
}

async function sendResendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ ok: boolean; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "noreply@example.com";
  const fromName = Deno.env.get("RESEND_FROM_NAME") || "MENA Intel Desk";
  if (!apiKey) {
    return { ok: false, error: "RESEND_API_KEY not set" };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [to],
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    return { ok: false, error: t.slice(0, 500) };
  }
  return { ok: true };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!verifyServiceRole(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const supabase = createClient(getSupabaseUrl(), getServiceKey());

  try {
    const { data: scenarioRow, error: scErr } = await supabase
      .from("scenario_probabilities")
      .select("conflict_day, scenario_a, scenario_b, scenario_c, scenario_d")
      .order("conflict_day", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scErr) {
      return jsonResponse({ error: scErr.message }, 500);
    }

    let conflictDay = (scenarioRow?.conflict_day as number | undefined) ?? 0;
    if (!conflictDay || conflictDay < 1) {
      const { data: latestNai } = await supabase
        .from("nai_scores")
        .select("conflict_day")
        .order("conflict_day", { ascending: false })
        .limit(1)
        .maybeSingle();
      conflictDay = (latestNai?.conflict_day as number | undefined) ?? 1;
    }

    let scRow = scenarioRow;
    if (!scRow || (scRow.conflict_day as number) !== conflictDay) {
      const { data: dayMatch } = await supabase
        .from("scenario_probabilities")
        .select("conflict_day, scenario_a, scenario_b, scenario_c, scenario_d")
        .eq("conflict_day", conflictDay)
        .maybeSingle();
      if (dayMatch) scRow = dayMatch;
    }

    const scenarioA = pct(scRow?.scenario_a);
    const scenarioB = pct(scRow?.scenario_b);
    const scenarioC = pct(scRow?.scenario_c);
    const scenarioD = pct(scRow?.scenario_d);
    const vals = [scenarioA, scenarioB, scenarioC, scenarioD];
    const maxIdx = vals.indexOf(Math.max(...vals));
    const leadScenario = LEAD_LABELS[maxIdx] ?? "A — Ceasefire";

    const prevDay = conflictDay > 1 ? conflictDay - 1 : null;
    let biggestMove: DigestData["biggestMove"] = null;
    if (prevDay != null && conflictDay > 0) {
      const { data: naiRows, error: naiErr } = await supabase
        .from("nai_scores")
        .select("country_code, conflict_day, expressed_score, category")
        .in("conflict_day", [conflictDay, prevDay]);
      if (!naiErr && naiRows?.length) {
        const yesterdayMap = new Map<string, { score: number; category: string }>();
        for (const r of naiRows) {
          if (r.conflict_day === prevDay) {
            yesterdayMap.set(r.country_code as string, {
              score: Number(r.expressed_score),
              category: String(r.category ?? "STABLE"),
            });
          }
        }
        let best: { code: string; delta: number; newScore: number; category: string } | null = null;
        for (const r of naiRows) {
          if (r.conflict_day !== conflictDay) continue;
          const code = r.country_code as string;
          const newScore = Number(r.expressed_score);
          const prev = yesterdayMap.get(code);
          if (prev === undefined) continue;
          const delta = Math.round((newScore - prev.score) * 10) / 10;
          const abs = Math.abs(delta);
          if (best == null || abs > Math.abs(best.delta)) {
            best = {
              code,
              delta,
              newScore: Math.round(newScore),
              category: String(r.category ?? prev.category ?? "STABLE"),
            };
          }
        }
        if (best) {
          biggestMove = {
            countryCode: best.code,
            countryName: COUNTRY_NAMES[best.code] ?? best.code,
            delta: best.delta,
            newScore: best.newScore,
            category: best.category,
          };
        }
      }
    }

    let brentPrice = 0;
    const { data: brentRows } = await supabase
      .from("market_data")
      .select("value, indicator")
      .eq("conflict_day", conflictDay)
      .order("created_at", { ascending: false })
      .limit(40);
    const brent = brentRows?.find(
      (r) =>
        String(r.indicator).toLowerCase().includes("brent")
    );
    if (brent?.value != null) {
      brentPrice = Math.round(Number(brent.value) * 100) / 100;
    }

    const { data: headlineRows } = await supabase
      .from("articles")
      .select("title, source_name")
      .eq("conflict_day", conflictDay)
      .order("published_at", { ascending: false })
      .limit(3);

    const topHeadlines = (headlineRows ?? []).map((a) => ({
      title: String(a.title ?? "").slice(0, 200),
      source: String(a.source_name ?? "Source").slice(0, 80),
    }));

    const digestDate = new Date();
    const dateStr = digestDate.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    });

    const baseDigest: Omit<DigestData, "tier"> = {
      conflictDay: conflictDay || 1,
      date: dateStr,
      scenarioA,
      scenarioB,
      scenarioC,
      scenarioD,
      leadScenario,
      biggestMove,
      brentPrice,
      topHeadlines,
    };

    const { data: subRows, error: subErr } = await supabase
      .from("subscribers")
      .select("email")
      .eq("active", true);
    if (subErr) {
      return jsonResponse({ error: subErr.message }, 500);
    }

    const { data: userRows, error: userErr } = await supabase
      .from("users")
      .select("email, tier")
      .eq("email_digest", true);
    if (userErr) {
      return jsonResponse({ error: userErr.message }, 500);
    }

    const tierByEmail = new Map<string, UserTier>();
    for (const s of subRows ?? []) {
      const e = (s.email as string)?.trim().toLowerCase();
      if (e) tierByEmail.set(e, "free");
    }
    for (const u of userRows ?? []) {
      const e = (u.email as string)?.trim().toLowerCase();
      if (e) tierByEmail.set(e, normalizeTier(u.tier as string));
    }

    const recipients = [...tierByEmail.entries()].map(([email, tier]) => ({
      email,
      tier,
    }));

    let successCount = 0;
    let errorCount = 0;
    const BATCH = 50;

    for (let i = 0; i < recipients.length; i += BATCH) {
      const batch = recipients.slice(i, i + BATCH);
      const results = await Promise.all(
        batch.map(async ({ email, tier }) => {
          const data: DigestData = { ...baseDigest, tier };
          const { subject, html } = dailyDigestTemplate(data);
          return sendResendEmail(email, subject, html);
        })
      );
      for (const r of results) {
        if (r.ok) successCount++;
        else {
          errorCount++;
          console.error("[send-digest]", r.error);
        }
      }
      if (i + BATCH < recipients.length) {
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    const { error: logErr } = await supabase.from("digest_sends").insert({
      conflict_day: conflictDay || null,
      recipient_count: recipients.length,
      success_count: successCount,
      error_count: errorCount,
      trigger: "pipeline",
    });
    if (logErr) {
      console.error("[send-digest] digest_sends log:", logErr.message);
    }

    return jsonResponse({
      ok: true,
      conflictDay,
      recipients: recipients.length,
      successCount,
      errorCount,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[send-digest]", msg);
    return jsonResponse({ error: msg }, 500);
  }
});
