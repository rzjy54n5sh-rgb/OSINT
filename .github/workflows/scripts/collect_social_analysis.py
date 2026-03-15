"""
collect_social_analysis.py
Call 3: Social & Public Opinion Deep Dive
Schedule: Daily 08:00 UTC
Tier: INFORMED + PROFESSIONAL
Cost: ~$1.89/month
"""
import os
import json
import requests
import datetime
import time

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

if not all([SUPABASE_URL, SUPABASE_KEY, ANTHROPIC_KEY]):
    missing = [
        k
        for k, v in {
            "SUPABASE_URL": SUPABASE_URL,
            "SUPABASE_SERVICE_KEY": SUPABASE_KEY,
            "ANTHROPIC_API_KEY": ANTHROPIC_KEY,
        }.items()
        if not v
    ]
    print(f"[social] SKIPPING — missing: {missing}")
    exit(0)

CONFLICT_START = datetime.date(2026, 2, 28)
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}
ARABIC_IRANIAN_SOURCES = {
    "Al Jazeera",
    "PressTV",
    "Tasnim News",
    "Mehr News",
    "IRNA",
    "Fars News",
    "Al-Manar",
    "Al-Masirah TV",
    "IFP News",
    "IRIB World",
    "Iran International",
    "Al-Monitor",
    "Middle East Eye",
}
FOCUS_COUNTRIES = ["IR", "US", "IL", "EG", "AE", "SA", "LB", "YE", "IQ", "TR", "PK", "JO"]


def get_conflict_day():
    return (datetime.date.today() - CONFLICT_START).days + 1


def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()


def batch_and_wait(custom_id, model, system_prompt, user_prompt, max_tokens):
    headers = {
        "x-api-key": ANTHROPIC_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
        "anthropic-beta": "message-batches-2024-09-24",
    }
    resp = requests.post(
        "https://api.anthropic.com/v1/messages/batches",
        headers=headers,
        json={
            "requests": [
                {
                    "custom_id": custom_id,
                    "params": {
                        "model": model,
                        "max_tokens": max_tokens,
                        "system": system_prompt,
                        "messages": [{"role": "user", "content": user_prompt}],
                    },
                }
            ]
        },
        timeout=30,
    )
    resp.raise_for_status()
    batch_id = resp.json()["id"]
    print(f"  Batch submitted: {batch_id}")
    for i in range(120):
        time.sleep(15)
        status_resp = requests.get(
            f"https://api.anthropic.com/v1/messages/batches/{batch_id}",
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01"},
            timeout=15,
        )
        status_resp.raise_for_status()
        status = status_resp.json()
        processing = status.get("processing_status", "")
        counts = status.get("request_counts", {})
        print(f"  [{(i+1)*15}s] {processing} — succeeded={counts.get('succeeded',0)}")
        if processing == "ended":
            break
    else:
        raise RuntimeError(f"Batch {batch_id} timed out")
    results_url = status.get("results_url")
    if not results_url:
        raise RuntimeError(f"No results_url for batch {batch_id}")

    results_resp = requests.get(results_url, timeout=60)
    results_resp.raise_for_status()
    results = results_resp.text
    print(f"    Results: {len(results)} chars, {results.count(chr(10))+1} lines")

    if not results.strip():
        raise RuntimeError(f"Empty results from results_url for batch {batch_id}")

    matched_line = None
    for line in results.strip().split("\n"):
        if not line:
            continue
        try:
            row = json.loads(line)
        except json.JSONDecodeError:
            continue
        # Accept exact match OR first available result (we submit 1 request per batch)
        if row.get("custom_id") == custom_id or matched_line is None:
            matched_line = row

    if matched_line is None:
        raise RuntimeError(f"No results found in JSONL for batch {batch_id}")

    row = matched_line
    result = row.get("result", {})
    result_type = result.get("type", "")
    if result_type == "errored":
        raise RuntimeError(f"Batch request errored: {result.get('error', {})}")
    if result_type != "succeeded":
        raise RuntimeError(f"Unexpected result type: {result_type}")

    content = result.get("message", {}).get("content", [])
    if not content:
        raise RuntimeError(f"Empty content in batch result for {custom_id}")
    if content[0].get("type") != "text":
        raise RuntimeError(f"Unexpected content type: {content[0].get('type')}")

    text = content[0]["text"].strip()
    if text.startswith("```"):
        text = text.split("\n", 1)[1]
        text = text.rsplit("```", 1)[0]
    return text.strip()


def main():
    conflict_day = get_conflict_day()
    print(f"📱 Social Analysis — Day {conflict_day}")
    try:
        existing = sb_get(f"social_analysis?conflict_day=eq.{conflict_day}&select=country_code")
        existing_codes = {r["country_code"] for r in existing}
    except Exception:
        existing_codes = set()
    to_analyze = [c for c in FOCUS_COUNTRIES if c not in existing_codes]
    if not to_analyze:
        print(f"  ✓ All social analysis exists for Day {conflict_day}")
        return
    print(f"  Analyzing: {to_analyze}")

    since = (datetime.datetime.utcnow() - datetime.timedelta(hours=24)).isoformat() + "Z"
    articles = sb_get(
        f"articles?select=title,source_name,country,sentiment,tags&published_at=gte.{since}&order=published_at.desc&limit=50"
    )
    social = sb_get(f"social_trends?conflict_day=eq.{conflict_day}&order=created_at.desc")

    social_articles = [
        a
        for a in articles
        if any(
            kw in (a.get("title", "") + str(a.get("tags", ""))).lower()
            for kw in [
                "protest",
                "rally",
                "sentiment",
                "public",
                "opinion",
                "street",
                "hashtag",
                "social",
                "civilians",
                "population",
                "people",
                "march",
                "demonstration",
                "backlash",
                "outrage",
                "support",
            ]
        )
    ] or articles[:30]

    articles_text = "\n".join(
        f"[{a.get('country','?')}][{'AR/IR' if a.get('source_name','') in ARABIC_IRANIAN_SOURCES else 'EN'}] {a.get('source_name','')}: {a.get('title','')}"
        for a in social_articles
    )
    social_text = (
        "\n".join(
            f"{s.get('country','')}/{s.get('platform','')}: [{s.get('sentiment','')}] {s.get('trend','')[:150]}"
            for s in social
        )
        or "No structured social data — infer from articles."
    )

    system = (
        "You are a social intelligence analyst specializing in public opinion during conflict. "
        "Apply STRUCTURAL NEUTRALITY. "
        "CRITICAL: Anti-US-intervention sentiment is NOT the same as pro-Iran loyalty — always distinguish. "
        "Distinguish genuine organic sentiment from coordinated amplification. "
        "Output ONLY valid JSON. No markdown. No preamble."
    )
    user = f"""CONFLICT DAY {conflict_day} — SOCIAL & PUBLIC OPINION DEEP DIVE

FOCUS COUNTRIES: {', '.join(to_analyze)}

SOCIAL TRENDS:
{social_text}

ARTICLES:
{articles_text}

NEUTRALITY RULES:
- Egypt/Jordan/Turkey/Pakistan: sentiment_bar = anti_us_intervention | neutral | pro_us_position
  NOT pro_iran — anti-US-intervention is NOT the same as pro-Iran loyalty
- Iran: include BOTH regime-supporting AND opposition/diaspora signals
- US: include BOTH pro-war AND anti-war domestic signals

Output this JSON for each focus country:
{{
  "social_analysis": [
    {{
      "country_code": "EG",
      "country_name": "Egypt",
      "conflict_day": {conflict_day},
      "sentiment_bar": {{"anti_us_intervention": 68, "neutral": 22, "pro_us_position": 10}},
      "dominant_narrative": "2 sentences — what most people believe right now in their own framing.",
      "counter_narrative": "1 sentence — what the minority/opposition believes.",
      "platform_breakdown": {{
        "twitter_x": {{"tone": "angry/cautious/divided", "top_hashtags": ["#tag1","#tag2","#tag3"], "volume_signal": "HIGH/MEDIUM/LOW"}},
        "facebook": {{"tone": "...", "dominant_content_type": "news shares/memes/personal opinions"}},
        "tiktok": {{"tone": "...", "virality_signal": "HIGH/MEDIUM/LOW", "dominant_format": "commentary/humor/news clips"}},
        "telegram": {{"channels_active": "description", "tone": "..."}},
        "local_platforms": {{"name": "platform name if relevant", "signal": "what is being said"}}
      }},
      "generational_split": "1-2 sentences — how youth vs older generation differ.",
      "diaspora_signal": "1-2 sentences — diaspora abroad vs domestic divergence.",
      "coordination_flags": ["any detected coordinated behavior or state amplification"],
      "nai_alignment_note": "1 sentence — how this aligns/conflicts with the NAI gap score.",
      "analyst_note": "2 sentences — most important public opinion dynamic and why it matters."
    }}
  ]
}}

All {len(to_analyze)} countries required. sentiment_bar values must sum to 100.
Be specific — name actual hashtags trending in each country."""

    print("  Calling Claude — social analysis (Batch)...")
    raw = batch_and_wait(f"social-day{conflict_day}", "claude-sonnet-4-6", system, user, 10000)
    result = json.loads(raw)

    now = datetime.datetime.utcnow().isoformat() + "+00:00"
    rows = [
        {
            "country_code": s["country_code"],
            "conflict_day": conflict_day,
            "sentiment_bar": s.get("sentiment_bar"),
            "dominant_narrative": s.get("dominant_narrative"),
            "counter_narrative": s.get("counter_narrative"),
            "platform_breakdown": s.get("platform_breakdown"),
            "generational_split": s.get("generational_split"),
            "diaspora_signal": s.get("diaspora_signal"),
            "coordination_flags": s.get("coordination_flags", []),
            "nai_alignment_note": s.get("nai_alignment_note"),
            "analyst_note": s.get("analyst_note"),
            "updated_at": now,
        }
        for s in result.get("social_analysis", [])
    ]

    if rows:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/social_analysis?on_conflict=country_code,conflict_day",
            headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=rows,
            timeout=15,
        )
        if resp.status_code in (200, 201, 204):
            print(f"  ✅ {len(rows)} countries written")
        else:
            print(f"  ⚠️ Write failed: {resp.status_code} {resp.text[:200]}")
    print("✅ Social analysis complete.")


if __name__ == "__main__":
    main()
