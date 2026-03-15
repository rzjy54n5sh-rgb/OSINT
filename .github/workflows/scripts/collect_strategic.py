"""
collect_strategic.py
Call 4: Strategic Deep Dive
Schedule: Mon/Wed/Fri 09:00 UTC
Tier: PROFESSIONAL only
Cost: ~$1.17/month (12 calls)
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
    print(f"[strategic] SKIPPING — missing: {missing}")
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
        raise RuntimeError("Batch timed out")
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
    run_date = datetime.date.today().isoformat()
    print(f"🎯 Strategic Analysis — Day {conflict_day} — {run_date}")

    try:
        existing = sb_get(
            f"strategic_assessments?conflict_day=eq.{conflict_day}&run_date=eq.{run_date}&select=id"
        )
        if existing:
            print(f"  ✓ Already exists for Day {conflict_day} / {run_date}")
            return
    except Exception:
        pass

    since = (datetime.datetime.utcnow() - datetime.timedelta(hours=72)).isoformat() + "Z"
    articles = sb_get(
        f"articles?select=title,source_name,country,sentiment,tags&published_at=gte.{since}&order=published_at.desc&limit=60"
    )
    markets = sb_get(f"market_data?conflict_day=eq.{conflict_day}&order=created_at.desc&limit=20")
    prev_scenarios = sb_get(f"scenario_probabilities?order=conflict_day.desc&limit=3")
    current_nai = sb_get(f"nai_scores?conflict_day=eq.{conflict_day}&order=expressed_score.desc")

    articles_text = "\n".join(
        f"[{a.get('country','?')}][{'AR/IR' if a.get('source_name','') in ARABIC_IRANIAN_SOURCES else 'EN'}] {a.get('source_name','')}: {a.get('title','')}"
        for a in articles
    )
    markets_text = "\n".join(
        f"{m['indicator']}: {m['value']} {m['unit']} ({m['change_pct']:+.1f}%)" for m in markets
    )
    scenario_history = "\n".join(
        f"Day {s['conflict_day']}: A={s['scenario_a']}% B={s['scenario_b']}% C={s['scenario_c']}% D={s['scenario_d']}% E={s.get('scenario_e','?')}%"
        for s in prev_scenarios
    )
    nai_text = "\n".join(
        f"{n['country_code']}: E={n['expressed_score']} L={n['latent_score']} [{n['category']}]"
        for n in current_nai
    )

    system = (
        "You are a senior strategic intelligence analyst. Apply STRUCTURAL NEUTRALITY. "
        "This is for professional subscribers making high-stakes decisions. Be analytically honest — state what you don't know. "
        "Output ONLY valid JSON. No markdown. No preamble."
    )
    user = f"""CONFLICT DAY {conflict_day} — STRATEGIC DEEP DIVE

SCENARIO HISTORY:
{scenario_history}

CURRENT NAI:
{nai_text}

MARKETS:
{markets_text}

ARTICLES (72h, {len(articles)} items):
{articles_text}

TWO MASTER VARIABLES IN TENSION (present both equally):
1. US/Gulf/Business: Kharg oil infrastructure = primary variable (JPMorgan $150/bbl)
2. Iranian: Hormuz closure = primary strategic leverage (Iran controls re-opening timeline)

Output:
{{
  "conflict_day": {conflict_day},
  "run_date": "{run_date}",
  "executive_summary": "3 sentences — most critical developments past 48h, neutral framing.",
  "conflict_trajectory": {{
    "72h_assessment": "Full paragraph — both US/coalition trajectory and Iranian response.",
    "1_week_outlook": "Full paragraph covering all scenarios.",
    "2_week_outlook": "Structural outlook — what conditions change the path."
  }},
  "master_variables": {{
    "us_gulf_variable": "Paragraph — Kharg status, Gulf infrastructure, JPMorgan scenario, US threat posture.",
    "iran_variable": "Paragraph — Hormuz leverage, mining status, IRGC timeline, Iran's negotiating posture.",
    "tension_between": "1 sentence — core analytical tension between these two variables today."
  }},
  "diplomatic_channels": {{
    "oman_backchannel": {{"status": "ACTIVE/STALLED/UNCERTAIN/BROKEN", "latest_signal": "...", "confidence": "HIGH/MEDIUM/LOW"}},
    "xi_trump": {{"status": "ACTIVE/STALLED/UNCERTAIN/NOT_STARTED", "latest_signal": "...", "confidence": "HIGH/MEDIUM/LOW"}},
    "gulf_swf_pressure": {{"status": "ACTIVE/PASSIVE/UNCERTAIN", "latest_signal": "...", "confidence": "HIGH/MEDIUM/LOW"}}
  }},
  "scenario_movement": {{
    "changed_since_last_run": ["what moved and why"],
    "key_driver_today": "Single most important factor driving probabilities today.",
    "most_likely_next_48h": "Which scenario gains probability and why."
  }},
  "wildcards": [
    {{"event": "Low-probability, high-impact event.", "probability": "VERY LOW/LOW/MEDIUM", "impact": "What it would mean."}}
  ],
  "eschatology_index": 65,
  "analyst_note": "2-3 sentences — key unresolved tension, what we don't know and why it matters."
}}

Provide exactly 3 wildcards."""

    print("  Calling Claude — strategic (Batch)...")
    raw = batch_and_wait(
        f"strategic-day{conflict_day}-{run_date}", "claude-sonnet-4-6", system, user, 12000
    )
    result = json.loads(raw)

    now = datetime.datetime.utcnow().isoformat() + "+00:00"
    row = {
        "conflict_day": conflict_day,
        "run_date": run_date,
        "executive_summary": result.get("executive_summary"),
        "conflict_trajectory": result.get("conflict_trajectory"),
        "master_variables": result.get("master_variables"),
        "diplomatic_channels": result.get("diplomatic_channels"),
        "scenario_movement": result.get("scenario_movement"),
        "wildcards": result.get("wildcards"),
        "analyst_note": result.get("analyst_note"),
        "eschatology_index": result.get("eschatology_index"),
        "updated_at": now,
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/strategic_assessments?on_conflict=conflict_day,run_date",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=row,
        timeout=15,
    )
    if resp.status_code in (200, 201, 204):
        print(f"  ✅ Strategic assessment written for Day {conflict_day}")
    else:
        print(f"  ⚠️ Write failed: {resp.status_code} {resp.text[:200]}")
    print("✅ Strategic analysis complete.")


if __name__ == "__main__":
    main()
