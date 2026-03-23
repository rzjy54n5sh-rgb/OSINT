#!/usr/bin/env python3
"""
Stage 4 — Briefing Generation for MENA Intel Desk.

Generates daily_briefings rows for the given conflict day using Claude.
Reads articles + nai_scores + country_reports + scenario_probabilities from Supabase,
then generates 5 briefing types: general, egypt, uae, eschatology, business.

RULES:
  - Every claim must be grounded in DB articles. No fabrication.
  - If no articles exist for a day, say so explicitly.
  - Structural neutrality: Iranian framing alongside US/Western in general brief.
  - Civilian harm in Iran mandatory in general brief.
  - Egypt sentiment: Anti-US-Intervention | Neutral | Pro-US (NOT Pro/Anti-Iran).
  - All party codenames: Epic Fury (US) / Roaring Lion (Israel) / True Promise IV (Iran).
"""

import argparse
import datetime
import json
import os
import sys
import urllib.request
import urllib.error

import anthropic

# ── CONFIG ────────────────────────────────────────────────────────────────────
CONFLICT_START = datetime.date(2026, 2, 28)
MODEL = os.environ.get("PIPELINE_MODEL", "claude-sonnet-4-6")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

if not all([SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_KEY]):
    print("Missing env: SUPABASE_URL, SUPABASE_SERVICE_KEY, or ANTHROPIC_API_KEY")
    sys.exit(1)

client = anthropic.Anthropic(api_key=ANTHROPIC_KEY)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

REPORT_TYPES = [
    ("general", "General Intelligence Brief"),
    ("egypt", "Egypt Country Brief"),
    ("uae", "UAE Country Brief"),
    ("eschatology", "Eschatology & Geopolitics Analysis"),
    ("business", "Business Opportunities — UAE & Egypt"),
]


# ── SUPABASE HELPERS ──────────────────────────────────────────────────────────
def sb_get(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read())


def sb_post(table, rows, upsert_cols=None):
    headers = dict(SB_HEADERS)
    if upsert_cols:
        headers["Prefer"] = f"resolution=merge-duplicates,return=minimal"
    d = json.dumps(rows if isinstance(rows, list) else [rows]).encode()
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    if upsert_cols:
        url += f"?on_conflict={upsert_cols}"
    req = urllib.request.Request(url, data=d, headers=headers, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status
    except urllib.error.HTTPError as e:
        return f"ERR {e.code}: {e.read().decode()[:200]}"


# ── DATA FETCH ────────────────────────────────────────────────────────────────
def fetch_day_data(day):
    """Fetch all source data for the given conflict day."""
    articles = sb_get(
        f"articles?conflict_day=eq.{day}&select=id,title,summary,source_name,region,country,sentiment&order=published_at.desc&limit=50"
    )
    nai_scores = sb_get(
        f"nai_scores?conflict_day=eq.{day}&select=country_code,expressed_score,latent_score,gap_size,category&order=expressed_score.desc"
    )
    scenarios = sb_get(
        f"scenario_probabilities?conflict_day=eq.{day}&select=scenario_a,scenario_b,scenario_c,scenario_d,scenario_e&limit=1"
    )
    country_reports = sb_get(
        f"country_reports?conflict_day=eq.{day}&select=country_code,country_name,nai_score,nai_category,content_json"
    )
    market_data = sb_get(
        f"market_data?conflict_day=eq.{day}&select=indicator,value,change_pct,unit&order=conflict_day.desc&limit=20"
    )
    return {
        "articles": articles,
        "nai_scores": nai_scores,
        "scenarios": scenarios[0] if scenarios else {},
        "country_reports": country_reports,
        "market_data": market_data,
    }


def build_context_block(data, day):
    """Build a text block summarizing all available data for the day."""
    parts = [f"=== CONFLICT DAY {day} DATA ===\n"]

    # Articles
    articles = data["articles"]
    if articles:
        parts.append(f"ARTICLES ({len(articles)} available):")
        for a in articles:
            parts.append(
                f"  [{a.get('source_name','?')}] {a.get('title','')} "
                f"| {a.get('region','?')} | {a.get('country','?')} | sentiment={a.get('sentiment','?')}"
            )
            if a.get("summary"):
                parts.append(f"    Summary: {a['summary'][:200]}")
    else:
        parts.append("ARTICLES: NONE available for this day.")

    # NAI Scores
    nai = data["nai_scores"]
    if nai:
        parts.append(f"\nNAI SCORES ({len(nai)} countries):")
        for n in nai:
            parts.append(
                f"  {n['country_code']}: E={n['expressed_score']} L={n['latent_score']} "
                f"GAP={n['gap_size']} {n['category']}"
            )

    # Scenarios
    sc = data["scenarios"]
    if sc:
        parts.append(
            f"\nSCENARIO PROBABILITIES: "
            f"A(Ceasefire)={sc.get('scenario_a','?')}% "
            f"B(Prolonged)={sc.get('scenario_b','?')}% "
            f"C(Cascade)={sc.get('scenario_c','?')}% "
            f"D(Escalation)={sc.get('scenario_d','?')}% "
            f"E(UAE Strike)={sc.get('scenario_e','?')}%"
        )

    # Market Data
    mkt = data["market_data"]
    if mkt:
        parts.append(f"\nMARKET DATA ({len(mkt)} indicators):")
        for m in mkt:
            parts.append(
                f"  {m['indicator']}: {m['value']} ({m.get('change_pct','')}%) [{m.get('unit','')}]"
            )

    # Country Reports
    cr = data["country_reports"]
    if cr:
        parts.append(f"\nCOUNTRY REPORTS ({len(cr)} countries):")
        for c in cr:
            cj = c.get("content_json") or {}
            risks = cj.get("key_risks", [])
            assessment = cj.get("assessment", "")
            parts.append(f"  {c['country_code']} ({c.get('country_name','?')}): {c.get('nai_category','?')}")
            if assessment:
                parts.append(f"    Assessment: {assessment[:200]}")
            if risks:
                parts.append(f"    Key risks: {'; '.join(str(r) for r in risks[:3])}")

    return "\n".join(parts)


# ── BRIEFING PROMPTS ──────────────────────────────────────────────────────────
def get_system_prompt(report_type, day):
    base = f"""You are the MENA Intel Desk intelligence analyst generating a Day {day} briefing.

ABSOLUTE RULES:
- Every factual claim MUST be grounded in the source data provided. Cite the source name.
- If no data exists for a topic, say "No sourced data available for Day {day}."
- NEVER fabricate events, casualties, prices, or quotes.
- Structural neutrality: present Iranian/IRGC framing alongside US/Western framing.
- Party codenames: Epic Fury (US), Roaring Lion (Israel), True Promise IV (Iran).
- CENTCOM/IRGC/IDF are party sources — flag them as such.

Output VALID JSON matching the schema exactly. No markdown, no code fences."""

    type_specific = {
        "general": """
This is the GENERAL INTELLIGENCE BRIEF — the flagship daily assessment.
Cover: direct combatants (US/Iran/Israel), Gulf states impact, NAI shifts, scenario changes.
MANDATORY: Include Iranian civilian impact section. Include both US and Iranian framing of events.
Structure with 3-4 sections, each with subsections per country/topic.""",
        "egypt": """
This is the EGYPT COUNTRY BRIEF.
Focus: EGP/USD, energy costs, Suez revenue, street sentiment, elite positioning.
Sentiment framing: Anti-US-Intervention | Neutral | Pro-US (NOT Pro/Anti-Iran).
Cover: PM Madbouly economic policy, military posture, Muslim Brotherhood angle if relevant.""",
        "uae": """
This is the UAE COUNTRY BRIEF.
Focus: DIFC/financial hub status, defense posture, Scenario E (UAE Direct Strike),
diplomatic positioning, sovereign wealth fund moves, expatriate sentiment.""",
        "eschatology": """
This is the ESCHATOLOGY & GEOPOLITICS ANALYSIS.
Focus: religious/prophetic framing of the conflict across all three Abrahamic faiths.
Cover: Shia Mahdist discourse, evangelical Christian prophecy, Israeli religious nationalism.
This is an operational variable — analyze how it constrains diplomatic options.""",
        "business": """
This is the BUSINESS OPPORTUNITIES brief for UAE & Egypt professionals.
Focus: war-economy opportunities, reconstruction positioning, SWF moves,
currency plays, energy arbitrage, defense contracts. Include risks.""",
    }
    return base + type_specific.get(report_type, "")


BRIEFING_SCHEMA = {
    "type": "object",
    "properties": {
        "title": {"type": "string"},
        "lead": {"type": "string"},
        "sections": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "id": {"type": "string"},
                    "heading": {"type": "string"},
                    "type": {"type": "string"},
                    "subsections": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "id": {"type": "string"},
                                "heading": {"type": "string"},
                                "paragraphs": {
                                    "type": "array",
                                    "items": {
                                        "type": "object",
                                        "properties": {
                                            "text": {"type": "string"},
                                            "perspective": {"type": "string"},
                                        },
                                        "required": ["text"],
                                        "additionalProperties": False,
                                    },
                                },
                            },
                            "required": ["id", "heading", "paragraphs"],
                            "additionalProperties": False,
                        },
                    },
                },
                "required": ["id", "heading", "type", "subsections"],
                "additionalProperties": False,
            },
        },
    },
    "required": ["title", "lead", "sections"],
    "additionalProperties": False,
}


# ── GENERATE BRIEFING ─────────────────────────────────────────────────────────
def generate_briefing(report_type, report_title, day, context_block):
    """Call Claude to generate a single briefing."""
    system = get_system_prompt(report_type, day)
    user_prompt = f"""Generate the {report_title} for Conflict Day {day}.

{context_block}

Return a JSON object with:
- "title": "{report_title} — Day {day}"
- "lead": 2-3 sentence executive summary (most critical development first)
- "sections": array of 3-4 sections, each with id, heading, type, and subsections
  Each subsection has id, heading, and paragraphs (array of {{"text": "...", "perspective": "us_israel|iran_irgc|gulf|neutral|both"}})

Ground EVERY claim in the source data above. If no data exists for a topic, state that explicitly."""

    response = client.messages.create(
        model=MODEL,
        max_tokens=8000,
        system=system,
        messages=[{"role": "user", "content": user_prompt}],
        output_config={"format": {"type": "json_schema", "schema": BRIEFING_SCHEMA}},
    )
    # Extract text from response
    for b in reversed(response.content):
        if hasattr(b, "text") and b.text:
            return json.loads(b.text)
    raise RuntimeError(f"No text in Claude response for {report_type}")


# ── MAIN ──────────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    args = ap.parse_args()
    day = args.day

    print(f"Stage 4 — Briefing Generation for Day {day}")
    print(f"  Model: {MODEL}")

    # Check existing briefings
    existing = sb_get(
        f"daily_briefings?conflict_day=eq.{day}&select=report_type"
    )
    existing_types = {r["report_type"] for r in existing}
    if len(existing_types) >= 5:
        print(f"  All 5 briefings already exist for Day {day} — skipping.")
        return

    # Fetch source data
    data = fetch_day_data(day)
    article_count = len(data["articles"])
    nai_count = len(data["nai_scores"])
    print(f"  Source data: {article_count} articles, {nai_count} NAI scores, "
          f"{len(data['market_data'])} market rows, {len(data['country_reports'])} country reports")

    if article_count == 0 and nai_count == 0:
        print(f"  No articles AND no NAI scores for Day {day}. Cannot generate briefings without data.")
        print(f"  Skipping Day {day} — would require fabrication.")
        return

    context_block = build_context_block(data, day)
    now_ts = datetime.datetime.now(datetime.UTC).strftime("%Y-%m-%dT%H:%M:%S+00:00")

    generated = 0
    for report_type, report_title in REPORT_TYPES:
        if report_type in existing_types:
            print(f"  SKIP {report_type} — already exists for Day {day}")
            continue

        print(f"  Generating {report_type}...")
        try:
            result = generate_briefing(report_type, report_title, day, context_block)
        except Exception as e:
            print(f"  FAIL {report_type}: {e}")
            continue

        row = {
            "conflict_day": day,
            "report_type": report_type,
            "title": result.get("title", f"{report_title} — Day {day}"),
            "lead": result.get("lead", ""),
            "sections": result.get("sections", []),
            "cover_stats": None,
            "source_ids": None,
            "source": "platform",
            "quality": "full" if article_count >= 5 else "limited",
            "generated_at": now_ts,
        }

        status = sb_post("daily_briefings", row)
        if isinstance(status, int) and status < 300:
            print(f"  ✅ {report_type} written")
            generated += 1
        else:
            print(f"  ⚠️ {report_type} write failed: {status}")

    print(f"\nStage 4 complete: {generated} briefings generated for Day {day}")

    # Write report files for artifact upload
    d = "/tmp/reports"
    os.makedirs(d, exist_ok=True)
    with open(os.path.join(d, f"day_{day}.txt"), "w") as f:
        f.write(f"Day {day}: {generated} briefings generated at {now_ts}\n")


if __name__ == "__main__":
    main()
