"""
collect_disinfo_escha.py
Call 5: Disinformation + Eschatology Tracker
Schedule: Tue/Sat 10:00 UTC
Tier: INFORMED + PROFESSIONAL
Cost: ~$0.42/month (8 calls)
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
    print(f"[disinfo_escha] SKIPPING — missing: {missing}")
    exit(0)

CONFLICT_START = datetime.date(2026, 2, 28)
SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
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
    print(f"🔍 Disinfo + Eschatology — Day {conflict_day} — {run_date}")

    existing_claims = sb_get(
        "disinformation_tracker?order=created_at.desc&limit=20&select=claim,status"
    )
    since = (datetime.datetime.utcnow() - datetime.timedelta(hours=72)).isoformat() + "Z"
    articles = sb_get(
        f"articles?select=title,source_name,country,sentiment,tags&published_at=gte.{since}&order=published_at.desc&limit=50"
    )

    existing_text = (
        "\n".join(f"- [{r['status']}] {r['claim']}" for r in existing_claims)
        or "No existing claims."
    )
    articles_text = "\n".join(
        f"[{a.get('country','?')}] {a.get('source_name','')}: {a.get('title','')}"
        for a in articles
    )

    system = (
        "You are an intelligence analyst specializing in disinformation triage and eschatological risk assessment. "
        "Apply STRUCTURAL NEUTRALITY — equal scrutiny to ALL parties (US/Israel, Iran/IRGC, Russia). "
        "Party sources (CENTCOM, IRGC, IDF) require independent corroboration for CONFIRMED status. "
        "Claims debunked only by party sources = CONTESTED, not DEBUNKED. "
        "Output ONLY valid JSON. No markdown. No preamble."
    )
    user = f"""CONFLICT DAY {conflict_day} — DISINFORMATION + ESCHATOLOGY

EXISTING CLAIMS (do not duplicate):
{existing_text}

ARTICLES (72h):
{articles_text}

SOURCE HIERARCHY:
INDEPENDENT (can confirm/debunk): AFP, Reuters, AP, BBC, CNN, Al Jazeera, NetBlocks, HRW, Amnesty
PARTY SOURCES (need corroboration): CENTCOM, IRGC/PressTV, IDF, Rybar, Intel Slava
Statuses: CONFIRMED | DEBUNKED | CONTESTED | PARTIALLY_ACCURATE | UNVERIFIABLE

Output:
{{
  "disinformation": {{
    "new_claims": [
      {{
        "claim": "Specific claim text",
        "parties_making_it": ["US", "Iran", "Russia", "Israel"],
        "status": "CONFIRMED|DEBUNKED|CONTESTED|PARTIALLY_ACCURATE|UNVERIFIABLE",
        "verdict": "1-2 sentence explanation.",
        "source_type": "INDEPENDENT|CENTCOM|IRGC|IDF|RUSSIAN|MIXED",
        "verification_source": "AFP / Reuters / CNN / etc."
      }}
    ],
    "status_updates": [
      {{"claim": "existing claim", "old_status": "CONTESTED", "new_status": "DEBUNKED", "reason": "why"}}
    ],
    "coordination_detected": ["any coordinated narrative amplification detected"]
  }},
  "eschatology": {{
    "eschatology_index": 65,
    "christian_dispensationalist": {{"intensity": "LOW|MEDIUM|HIGH|CRITICAL", "key_signals": ["signal 1", "signal 2"], "diplomatic_impact": "how this affects US decision-making"}},
    "jewish_messianic": {{"intensity": "LOW|MEDIUM|HIGH|CRITICAL", "key_signals": ["Amalek framing", "Temple Mount signal"], "diplomatic_impact": "how this affects Israeli decision-making"}},
    "shia_mahdist": {{"intensity": "LOW|MEDIUM|HIGH|CRITICAL", "key_signals": ["Mojtaba election framing", "True Promise IV religious framing"], "diplomatic_impact": "how this affects Iran negotiating posture"}},
    "sunni_malhamah": {{"intensity": "LOW|MEDIUM|HIGH|CRITICAL", "key_signals": ["regional mobilization", "Friday sermon themes"], "diplomatic_impact": "how this affects Gulf/regional populations"}},
    "mrff_complaints_count": 200,
    "new_eschatological_events": ["specific event from this week that escalated eschatological framing"],
    "diplomatic_exit_constraint": "LOW|MEDIUM|HIGH|CRITICAL",
    "analyst_note": "2 sentences — most important eschatological development this week and its operational consequences."
  }}
}}

eschatology_index: 0-100 (0=none, 100=all parties fully in end-times mode)."""

    print("  Calling Claude — disinfo + eschatology (Batch)...")
    raw = batch_and_wait(
        f"disinfo-escha-day{conflict_day}-{run_date}",
        "claude-sonnet-4-6",
        system,
        user,
        8000,
    )
    result = json.loads(raw)
    now = datetime.datetime.utcnow().isoformat() + "+00:00"

    disinfo = result.get("disinformation", {})
    new_claims = disinfo.get("new_claims", [])
    if new_claims:
        disinfo_rows = [
            {
                "conflict_day": conflict_day,
                "claim": c["claim"],
                "status": c["status"],
                "verdict": c.get("verdict"),
                "source": c.get("verification_source"),
                "created_at": now,
            }
            for c in new_claims
        ]
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/disinformation_tracker",
            headers=SB_HEADERS,
            json=disinfo_rows,
            timeout=15,
        )
        if resp.status_code in (200, 201, 204):
            print(f"  ✅ Disinfo: {len(disinfo_rows)} new claims")
        else:
            print(f"  ⚠️ Disinfo write failed: {resp.status_code}")

    escha = result.get("eschatology", {})
    escha_row = {
        "conflict_day": conflict_day,
        "run_date": run_date,
        "eschatology_index": escha.get("eschatology_index"),
        "christian_dispensationalist": escha.get("christian_dispensationalist"),
        "jewish_messianic": escha.get("jewish_messianic"),
        "shia_mahdist": escha.get("shia_mahdist"),
        "sunni_malhamah": escha.get("sunni_malhamah"),
        "mrff_complaints_count": escha.get("mrff_complaints_count"),
        "new_eschatological_events": escha.get("new_eschatological_events", []),
        "diplomatic_exit_constraint": escha.get("diplomatic_exit_constraint"),
        "analyst_note": escha.get("analyst_note"),
        "updated_at": now,
    }
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/eschatology_tracker?on_conflict=conflict_day,run_date",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=escha_row,
        timeout=15,
    )
    if resp.status_code in (200, 201, 204):
        print(f"  ✅ Eschatology index={escha.get('eschatology_index')} written")
    else:
        print(f"  ⚠️ Eschatology write failed: {resp.status_code}")
    print("✅ Disinfo + Eschatology complete.")


if __name__ == "__main__":
    main()
