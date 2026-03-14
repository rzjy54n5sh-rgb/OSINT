"""
daily_analysis.py — Automated daily intelligence analysis via Claude API

Flow:
  1. Read latest articles (last 24h), market data, social trends from Supabase
  2. Determine current conflict_day
  3. Build a structured prompt with all data
  4. Call Claude claude-sonnet-4-6 to generate NAI scores + country reports
  5. Parse JSON response and UPSERT back to Supabase
  6. Update scenario_probabilities

Runs daily at 06:00 UTC via GitHub Actions.
Zero manual intervention required.
"""

import os
import json
import requests
import datetime
import time

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
ANTHROPIC_KEY = os.environ.get("ANTHROPIC_API_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY or not ANTHROPIC_KEY:
    missing = [k for k, v in {"SUPABASE_URL": SUPABASE_URL, "SUPABASE_SERVICE_KEY": SUPABASE_KEY, "ANTHROPIC_API_KEY": ANTHROPIC_KEY}.items() if not v]
    print(f"[daily_analysis] SKIPPING — missing secrets: {missing}")
    print("Add secrets in GitHub repo Settings → Secrets and variables → Actions")
    exit(0)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=minimal",
}

COUNTRIES = [
    {"code": "IR", "name": "Iran"},
    {"code": "US", "name": "United States"},
    {"code": "IL", "name": "Israel"},
    {"code": "SA", "name": "Saudi Arabia"},
    {"code": "AE", "name": "UAE"},
    {"code": "IQ", "name": "Iraq"},
    {"code": "LB", "name": "Lebanon"},
    {"code": "YE", "name": "Yemen"},
    {"code": "JO", "name": "Jordan"},
    {"code": "EG", "name": "Egypt"},
    {"code": "TR", "name": "Turkey"},
    {"code": "RU", "name": "Russia"},
    {"code": "CN", "name": "China"},
    {"code": "GB", "name": "United Kingdom"},
    {"code": "FR", "name": "France"},
    {"code": "DE", "name": "Germany"},
    {"code": "QA", "name": "Qatar"},
    {"code": "KW", "name": "Kuwait"},
    {"code": "IN", "name": "India"},
    {"code": "PK", "name": "Pakistan"},
]

ARABIC_IRANIAN_SOURCES = {
    'Al Jazeera', 'PressTV', 'Tasnim News', 'Mehr News', 'IRNA', 'Fars News',
    'Al-Manar', 'Al-Masirah TV', 'Ansarallah', 'Al-Monitor', 'Middle East Eye',
    'Middle East Monitor', 'IFP News', 'IRIB World', 'Iran International',
}

def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()

def sb_upsert(table, rows, on_conflict):
    headers = {**SB_HEADERS, "Prefer": f"resolution=merge-duplicates,return=minimal"}
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}?on_conflict={on_conflict}",
        headers=headers,
        json=rows,
        timeout=15,
    )
    r.raise_for_status()
    return r.status_code

def sb_patch(table, match_field, match_val, payload):
    r = requests.patch(
        f"{SUPABASE_URL}/rest/v1/{table}?{match_field}=eq.{match_val}",
        headers=SB_HEADERS,
        json=payload,
        timeout=15,
    )
    r.raise_for_status()

CONFLICT_START = datetime.date(2026, 2, 28)


def get_current_conflict_day() -> int:
    """
    DAY LOCK — always derived from the real system clock.
    Never derived from DB max or incremented from prior state.
    Rule: DAY = (today - 2026-02-28).days + 1
    """
    return (datetime.date.today() - CONFLICT_START).days + 1

def build_data_snapshot(conflict_day):
    """Pull last 24h of data from Supabase for the prompt."""
    since = (datetime.datetime.utcnow() - datetime.timedelta(hours=24)).isoformat() + "Z"

    # Latest articles (limit 80 to keep prompt manageable)
    articles = sb_get(
        f"articles?select=title,source_name,country,sentiment,tags&"
        f"published_at=gte.{since}&order=published_at.desc&limit=80"
    )

    # Market data latest snapshot
    markets = sb_get(
        f"market_data?conflict_day=eq.{conflict_day}&"
        f"order=created_at.desc&limit=20"
    )
    # Deduplicate by indicator — keep latest per indicator
    seen = set()
    markets_dedup = []
    for m in markets:
        if m["indicator"] not in seen:
            seen.add(m["indicator"])
            markets_dedup.append(m)

    # Social trends
    social = sb_get(
        f"social_trends?conflict_day=eq.{conflict_day}&order=created_at.desc"
    )

    # Previous day NAI scores (baseline)
    prev_nai = sb_get(
        f"nai_scores?conflict_day=eq.{conflict_day - 1}&order=expressed_score.desc"
    )

    # Previous day scenarios
    prev_scenario = sb_get(
        f"scenario_probabilities?conflict_day=eq.{conflict_day - 1}&limit=1"
    )

    return {
        "articles": articles,
        "markets": markets_dedup,
        "social": social,
        "prev_nai": prev_nai,
        "prev_scenario": prev_scenario[0] if prev_scenario else None,
    }

def call_claude(conflict_day, data):
    """Call Claude API with the data snapshot and get structured analysis back."""

    system_prompt = """You are a geopolitical intelligence analyst for the MENA
Conflict Intelligence Platform. You analyze raw data and produce structured
JSON analysis applying STRUCTURAL NEUTRALITY — presenting all parties'
perspectives equally without favoring US/Israel or Iran/resistance axis framing.

STRUCTURAL NEUTRALITY RULES (apply to every country report and scenario):
1. Present ALL parties' official positions — US/Israel AND Iran/IRGC AND
   Gulf states AND resistance axis (Hezbollah, Houthis, PMF)
2. When describing Iranian military actions: include Iran's stated justification
   alongside the impact description — never describe only through CENTCOM/IDF lens
3. When describing US/Israel actions: include Iranian characterization alongside
   US/official framing — never describe only through Pentagon/IDF lens
4. Casualty figures: include ALL sides ordered by count (highest first)
5. Iranian civilian harm from US-Israel strikes is as relevant as Israeli/Gulf
   civilian harm from Iranian strikes — include both always
6. Ceasefire path: includes Iran-Oman back-channel (Iran's stated condition:
   US base closure) AND Xi-Trump framework — not only one side's channel
7. Source hierarchy: distinguish party sources (CENTCOM, IRGC, IDF) from
   independent verifiers (AFP, Reuters, NetBlocks, HRW) — party denials
   are CONTESTED, not DEBUNKED, without independent corroboration

TELEGRAM PARTY SOURCE RULE:
- Rybar (@rybar / @rybar_in_english): pro-Kremlin milblog, US DOJ flagged as
  Russian disinfo org. All military claims require independent corroboration
  (Reuters/AP/AFP/BBC) before CONFIRMED. Mark as CONTESTED pending verification.
- Intel Slava (@intelslava): pro-Russian aggregator. Same rule applies.
- Our Wars Today (@ourwarstoday): neutral aggregator. Standard triage.
- الروائي: resistance-axis Arabic source. Party source rules apply.

CHINESE SOURCE RULE:
- Xinhua/Global Times/CGTN/People's Daily: CCP party sources. Diplomatic
  signaling value is HIGH (official positions). Factual military claims
  require independent corroboration. Label as [CN-STATE] in source attribution.
- Guancha.cn: nationalist commentary, not state media. Label as [CN-NATIONALIST].

OUTPUT: Valid JSON only — no preamble, no markdown, no explanation.

Output structure:
{
  "nai_scores": [
    {
      "country_code": "XX",
      "expressed_score": 0-100,
      "latent_score": 0-100,
      "gap_size": number,
      "category": "ALIGNED|FRACTURED|INVERTED|TENSE"
    }
  ],
  "country_reports": [
    {
      "country_code": "XX",
      "country_name": "...",
      "nai_score": number,
      "nai_category": "...",
      "content_json": {
        "nai": {"expressed": n, "latent": n, "gap_size": n, "category": "..."},
        "scenarios": {"A": pct, "B": pct, "C": pct, "D": pct, "E": pct},
        "key_risks": ["...", "...", "...", "..."],
        "stabilizers": ["...", "...", "..."],
        "all_parties_positions": {
          "us_israel_framing": "1 sentence",
          "iran_irgc_framing": "1 sentence",
          "local_govt_framing": "1 sentence",
          "street_framing": "1 sentence"
        },
        "assessment": "3-5 sentence analytical paragraph — neutral, all perspectives",
        "social_summary": "1-2 sentence summary of social media signals"
      }
    }
  ],
  "scenario_probabilities": {
    "scenario_a": number,
    "scenario_b": number,
    "scenario_c": number,
    "scenario_d": number,
    "scenario_e": number
  },
  "new_scenario_detected": true | false,
  "new_scenario_description": "string or null"
}

NAI CATEGORY DEFINITIONS:
- ALIGNED: expressed and latent within ~15 pts, same direction
- FRACTURED: gap >15 pts, govt and public diverge significantly
- INVERTED: government says X, public believes opposite
- TENSE: unstable, direction unclear, external pressure building

SCENARIO DEFINITIONS (neutral framing — all parties' perspectives):
- A: Managed Exit (ceasefire via Xi-Trump OR Iran-Oman — Iran's condition: US base closure)
- B: Prolonged War (4+ weeks, no breakthrough)
- C: Cascade (Hormuz + Red Sea dual closure; Egypt IMF emergency)
- D: Escalation Spiral (Iran hits Gulf oil → Kharg oil terminals destroyed → $150/bbl)
- E: UAE Direct Strike on Iranian missile sites (sub-branch, independent probability)
A+B+C+D must sum to 100. E is independent (0-100 separately).

Analyze ALL 20 countries. Include at minimum: IR, US, IL, EG, AE, SA, IQ, LB, YE,
TR, RU, CN, GB, FR, DE, QA, KW, IN, PK, JO."""

    # Mark Arabic/Iranian/resistance-axis sources explicitly for model context
    articles_text = "\n".join(
        f"[{a.get('country','GLOBAL')}][{a.get('sentiment','')}]"
        f"[{'AR/IR-PERSPECTIVE' if a.get('source_name','') in ARABIC_IRANIAN_SOURCES else 'EN-WESTERN'}]"
        f" {a.get('source_name','')}: {a.get('title','')}"
        for a in data["articles"]
    )
    
    markets_text = "\n".join(
        f"{m['indicator']}: {m['value']} {m['unit']} ({m['change_pct']:+.1f}%)"
        for m in data["markets"]
    )
    
    social_text = "\n".join(
        f"{s.get('country','')}/{s.get('platform','')}: [{s.get('sentiment','')}] {s.get('trend','')[:120]}"
        for s in data["social"]
    )
    
    prev_nai_text = "\n".join(
        f"{n['country_code']}: expressed={n['expressed_score']} latent={n['latent_score']} [{n['category']}]"
        for n in data["prev_nai"]
    )
    
    prev_sc = data["prev_scenario"]
    if prev_sc:
        prev_sc_text = f"A={prev_sc['scenario_a']}% B={prev_sc['scenario_b']}% C={prev_sc['scenario_c']}% D={prev_sc['scenario_d']}%"
        if prev_sc.get("scenario_e") is not None:
            prev_sc_text += f" E={prev_sc['scenario_e']}%"
    else:
        prev_sc_text = "No previous data"

    user_prompt = f"""CONFLICT DAY {conflict_day} — Daily Intelligence Analysis

COUNTRIES TO ANALYZE: IR, US, IL, SA, AE, IQ, LB, YE, JO, EG, TR, RU, CN, GB, FR, DE, QA, KW, IN, PK

=== PREVIOUS DAY NAI BASELINE ===
{prev_nai_text}

=== PREVIOUS DAY SCENARIOS ===
{prev_sc_text}

=== TODAY'S ARTICLES ({len(data['articles'])} items) ===
{articles_text}

=== MARKET DATA ===
{markets_text}

=== SOCIAL TRENDS ===
{social_text}

Based on the above, generate updated Day {conflict_day} analysis for all 20 countries.
Output ONLY valid JSON. No explanation. No markdown.
Velocity = today's expressed_score minus yesterday's expressed_score."""

    response = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-4-6",
            "max_tokens": 32000,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        timeout=300,  # large prompts (80+ articles + rules) need up to 5 min
    )
    if not response.ok:
        try:
            err_body = response.json()
            msg = err_body.get("error", {}).get("message", "") or response.text[:500]
            if "credit balance is too low" in msg.lower() or "purchase credits" in msg.lower():
                print("  ⚠️  Anthropic API: insufficient credits. Add credits at https://console.anthropic.com → Plans & Billing")
            print(f"  Anthropic API error {response.status_code}: {msg}")
        except Exception:
            print(f"  Anthropic API error {response.status_code}: {response.text[:1500]}")
    response.raise_for_status()
    
    content = response.json()["content"][0]["text"]
    # Strip any accidental markdown fences
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]
    
    return json.loads(content)


BATCH_HEADERS = {
    "x-api-key": ANTHROPIC_KEY,
    "anthropic-version": "2023-06-01",
    "content-type": "application/json",
    "anthropic-beta": "message-batches-2024-09-24",
}


def call_claude_batch(custom_id: str, model: str, max_tokens: int, messages: list) -> str:
    """
    Submit a single request via the batch API (50% discount), poll until complete,
    return the response text. Used for non-urgent calls: detect_new_scenario, future briefings.
    """
    create_resp = requests.post(
        "https://api.anthropic.com/v1/messages/batches",
        headers=BATCH_HEADERS,
        json={
            "requests": [
                {
                    "custom_id": custom_id,
                    "params": {
                        "model": model,
                        "max_tokens": max_tokens,
                        "messages": messages,
                    },
                }
            ],
        },
        timeout=30,
    )
    create_resp.raise_for_status()
    batch = create_resp.json()
    batch_id = batch["id"]

    # Poll every 30 seconds until processing ends (max 20 polls = 10 min)
    for _ in range(20):
        status_resp = requests.get(
            f"https://api.anthropic.com/v1/messages/batches/{batch_id}",
            headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01"},
            timeout=30,
        )
        status_resp.raise_for_status()
        status = status_resp.json()
        if status.get("processing_status") == "ended":
            break
        time.sleep(30)
    else:
        raise RuntimeError(f"Batch {batch_id} did not complete within 10 minutes")

    results_url = status.get("results_url")
    if not results_url:
        raise RuntimeError(f"Batch {batch_id} ended but no results_url")

    results_resp = requests.get(results_url, timeout=60)
    results_resp.raise_for_status()
    # Parse .jsonl: one JSON object per line
    for line in results_resp.text.strip().split("\n"):
        if not line:
            continue
        row = json.loads(line)
        if row.get("custom_id") == custom_id:
            res = row.get("result", {})
            if "error" in res:
                raise RuntimeError(f"Batch request failed: {res['error']}")
            # Batch success: result.message.content[0].text (MessageBatchResult.message)
            msg = res.get("message", {})
            content = msg.get("content", [])
            if content and content[0].get("type") == "text" and isinstance(content[0].get("text"), str):
                return content[0]["text"].strip()
            raise RuntimeError(f"Unexpected batch result shape: {row}")
    raise RuntimeError(f"No result found for custom_id={custom_id}")


def detect_new_scenario(conflict_day: int, data: dict, analysis: dict) -> dict | None:
    """
    Smart scenario detection — runs after main Claude analysis.
    Searches for conflict developments that constitute a genuinely new
    scenario branch not captured by A-E.

    Returns a dict describing the new scenario, or None.
    Only triggers if Claude identifies a new scenario AND it clears
    a novelty threshold — prevents false positives.

    New scenario must meet ALL of:
    1. Named/described by at least 2 independent sources in today's articles
    2. Not reducible to escalation of existing A-E scenarios
    3. Represents a new ACTOR entering or a new INSTRUMENT being used
    """
    articles_text = "\n".join(
        f"[{a.get('country','?')}] {a.get('source_name','')}: {a.get('title','')}"
        for a in data.get("articles", [])[:60]
    )

    # Current scenarios for context
    current = analysis.get("scenario_probabilities", {})

    detection_prompt = f"""You are analyzing Day {conflict_day} of the US-Iran War 2026 for new conflict scenarios.

EXISTING TRACKED SCENARIOS:
A: Managed Exit / Ceasefire (Xi-Trump framework OR Iran-Oman channel)
B: Prolonged War (4+ weeks, no breakthrough)
C: Cascade / Dual Closure (Hormuz + Red Sea simultaneously)
D: Escalation Spiral (Iran strikes Gulf oil → $150/bbl)
E: UAE Direct Strike on Iranian missile sites

TODAY'S ARTICLES:
{articles_text}

CURRENT PROBABILITIES: A={current.get('scenario_a',0)}% B={current.get('scenario_b',0)}% C={current.get('scenario_c',0)}% D={current.get('scenario_d',0)}% E={current.get('scenario_e','?')}%

TASK: Determine if today's data reveals a NEW scenario not captured by A-E.
A new scenario qualifies if ALL of these are true:
1. At least 2 independent news sources today describe the same new development
2. It involves a new state actor joining the conflict OR a new weapon/instrument category
3. It is NOT just a higher-probability version of an existing scenario

Examples of qualifying new scenarios:
- Pakistan enters the conflict militarily
- Saudi Arabia strikes Iranian territory
- Iran detonates a nuclear device
- Russia deploys forces to Iran
- US ground troops enter Iran
- Iran successfully blockades Hormuz with mines (sustained, verified)
- Turkey invokes Article 5

Output JSON only:
{{
  "new_scenario_detected": true | false,
  "scenario_label": "F" | "G" | null,
  "scenario_name": "Short name" | null,
  "scenario_description": "1-2 sentence neutral description citing both party perspectives" | null,
  "probability_estimate": 0-100 | null,
  "trigger_sources": ["source1", "source2"] | null,
  "confidence": "HIGH" | "MEDIUM" | "LOW" | null
}}

STRUCTURAL NEUTRALITY: If a new scenario is detected, describe it from
all parties' perspectives — not only US/coalition framing."""

    try:
        content = call_claude_batch(
            custom_id="scenario-detection",
            model="claude-sonnet-4-6",
            max_tokens=1000,
            messages=[{"role": "user", "content": detection_prompt}],
        )
    except Exception as e:
        print(f"  ⚠️  Scenario detection batch failed: {e}")
        return None

    if content.startswith("```"):
        content = content.split("\n", 1)[1].rsplit("```", 1)[0]

    result = json.loads(content)
    if result.get("new_scenario_detected") and result.get("confidence") in ("HIGH", "MEDIUM"):
        return result
    return None


def write_new_scenario_to_db(conflict_day: int, scenario: dict) -> None:
    """
    Writes a newly detected scenario to the detected_scenarios table.
    This table is created by the migration in PROMPT 4.
    Also updates the homepage banner via the platform_alerts table.
    """
    now = datetime.datetime.utcnow().isoformat() + "+00:00"

    # Write to detected_scenarios table
    payload = {
        "conflict_day": conflict_day,
        "scenario_label": scenario.get("scenario_label"),
        "scenario_name": scenario.get("scenario_name"),
        "scenario_description": scenario.get("scenario_description"),
        "probability_estimate": scenario.get("probability_estimate"),
        "trigger_sources": json.dumps(scenario.get("trigger_sources", [])),
        "confidence": scenario.get("confidence"),
        "created_at": now,
    }
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/detected_scenarios",
        headers=SB_HEADERS,
        json=payload,
    )
    if r.status_code in (200, 201):
        print(f"  🔴 NEW SCENARIO DETECTED: {scenario['scenario_label']} — {scenario['scenario_name']}")
        print(f"     {scenario['scenario_description']}")
        print(f"     Probability: {scenario['probability_estimate']}% | Confidence: {scenario['confidence']}")
    else:
        print(f"  ⚠️  Failed to write new scenario: {r.status_code} {r.text}")

    # Update homepage alert banner
    alert_payload = {
        "key": "new_scenario_alert",
        "value": json.dumps({
            "active": True,
            "conflict_day": conflict_day,
            "label": scenario.get("scenario_label"),
            "name": scenario.get("scenario_name"),
            "description": scenario.get("scenario_description"),
            "probability": scenario.get("probability_estimate"),
        }),
        "updated_at": now,
    }
    requests.post(
        f"{SUPABASE_URL}/rest/v1/platform_alerts",
        headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
        json=alert_payload,
    )


def write_to_supabase(conflict_day, analysis):
    """Write Claude's analysis back to Supabase."""
    now = datetime.datetime.utcnow().isoformat() + "+00:00"
    
    # 1. NAI scores — upsert by country_code + conflict_day
    VALID_CATEGORIES = {"ALIGNED", "FRACTURED", "INVERTED", "TENSE"}
    nai_rows = []
    for n in analysis.get("nai_scores", []):
        category = n.get("category", "FRACTURED")
        if category not in VALID_CATEGORIES:
            print(f"  ⚠️  Invalid category '{category}' for {n['country_code']} — defaulting to FRACTURED")
            category = "FRACTURED"
        nai_rows.append({
            "country_code": n["country_code"],
            "conflict_day": conflict_day,
            "expressed_score": n["expressed_score"],
            "latent_score": n["latent_score"],
            "gap_size": abs(n["expressed_score"] - n["latent_score"]),
            "category": category,
            "updated_at": now,
        })
    if nai_rows:
        # Delete existing day first, then insert (cleaner than upsert for composite key)
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/nai_scores?conflict_day=eq.{conflict_day}",
            headers=SB_HEADERS,
        )
        requests.post(
            f"{SUPABASE_URL}/rest/v1/nai_scores",
            headers=SB_HEADERS,
            json=nai_rows,
        ).raise_for_status()
    print(f"  ✅ NAI scores: {len(nai_rows)} countries written")

    # 2. Country reports — upsert by (country_code, conflict_day)
    # Using POST with merge-duplicates — inserts new rows AND updates existing
    report_rows = []
    for r in analysis.get("country_reports", []):
        report_rows.append({
            "country_code": r["country_code"],
            "country_name": r["country_name"],   # REQUIRED NOT NULL
            "nai_score": r["nai_score"],
            "nai_category": r["nai_category"],
            "content_json": r["content_json"],
            "conflict_day": conflict_day,
            "updated_at": now,
        })
    if report_rows:
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/country_reports?on_conflict=country_code,conflict_day",
            headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
            json=report_rows,
            timeout=15,
        )
        if resp.status_code not in (200, 201, 204):
            print(f"  ⚠️  Country reports upsert warning: {resp.status_code} {resp.text[:200]}")
        else:
            print(f"  ✅ Country reports: {len(report_rows)} upserted for Day {conflict_day}")

    # 3. Scenario probabilities
    sc = analysis.get("scenario_probabilities")
    if sc:
        # Normalize A+B+C+D to 100 (E is independent sub-branch)
        main_keys = ["scenario_a", "scenario_b", "scenario_c", "scenario_d"]
        total = sum(sc.get(k, 0) for k in main_keys)
        if total > 0 and total != 100:
            factor = 100 / total
            for k in main_keys:
                sc[k] = round(sc.get(k, 0) * factor)
            # Fix rounding to ensure exact 100
            diff = 100 - sum(sc.get(k, 0) for k in main_keys)
            sc["scenario_d"] = sc.get("scenario_d", 0) + diff

        scenario_row = {
            "conflict_day": conflict_day,
            "scenario_a": sc.get("scenario_a", 0),
            "scenario_b": sc.get("scenario_b", 0),
            "scenario_c": sc.get("scenario_c", 0),
            "scenario_d": sc.get("scenario_d", 0),
            "scenario_e": sc.get("scenario_e"),  # None is OK — nullable column
            "updated_at": now,
        }
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/scenario_probabilities?conflict_day=eq.{conflict_day}",
            headers=SB_HEADERS,
        )
        requests.post(
            f"{SUPABASE_URL}/rest/v1/scenario_probabilities",
            headers=SB_HEADERS,
            json=scenario_row,
        ).raise_for_status()
        print(f"  ✅ Scenarios: A={scenario_row['scenario_a']}% B={scenario_row['scenario_b']}% "
              f"C={scenario_row['scenario_c']}% D={scenario_row['scenario_d']}% "
              f"E={scenario_row.get('scenario_e', 'N/A')}%")


def generate_daily_briefings(conflict_day: int, data: dict, analysis: dict) -> None:
    """
    Generates structured web-reader briefings for the daily_briefings table.
    Uses Haiku 4.5 via Batch API (~$0.09/day total for all 5 reports).
    Skips report types that already exist for this conflict_day.
    """
    now = datetime.datetime.utcnow().isoformat() + "+00:00"

    # Check which report types already exist for this day (idempotency)
    try:
        existing = sb_get(
            f"daily_briefings?conflict_day=eq.{conflict_day}&select=report_type"
        )
        existing_types = {r["report_type"] for r in existing}
    except Exception:
        existing_types = set()

    report_types = ["general", "egypt", "uae", "eschatology", "business"]
    to_generate = [t for t in report_types if t not in existing_types]

    if not to_generate:
        print(f"  ✓ All briefings already exist for Day {conflict_day} — skipping")
        return

    print(f"  Generating {len(to_generate)} briefings: {to_generate}")

    # Build shared context strings
    country_data = {r["country_code"]: r for r in analysis.get("country_reports", [])}
    articles_text = "\n".join(
        f"[{a.get('country','?')}][{a.get('sentiment','')}]"
        f"[{'AR/IR' if a.get('source_name','') in ARABIC_IRANIAN_SOURCES else 'EN'}]"
        f" {a.get('source_name','')}: {a.get('title','')}"
        for a in data.get("articles", [])[:50]
    )
    sc = analysis.get("scenario_probabilities", {})
    scenarios_text = (
        f"A={sc.get('scenario_a',0)}% B={sc.get('scenario_b',0)}% "
        f"C={sc.get('scenario_c',0)}% D={sc.get('scenario_d',0)}% "
        f"E={sc.get('scenario_e','N/A')}%"
    )
    markets_text = " | ".join(
        f"{m.get('indicator','')}:{m.get('value','')}{m.get('unit','')}({m.get('change_pct',0):+.1f}%)"
        for m in data.get("markets", [])[:8]
        if m.get("indicator") and m.get("value") is not None
    )

    base_context = f"""CONFLICT DAY {conflict_day} | STRUCTURAL NEUTRALITY — ALL PARTIES
SCENARIOS: {scenarios_text}
MARKETS: {markets_text}
ARTICLES (last 24h, {len(data.get('articles',[]))} total):
{articles_text[:2500]}

NEUTRALITY RULES:
1. Present US/Israel AND Iran/IRGC perspectives on every major action
2. For Iranian strikes: include Iran's stated justification AND the impact
3. For US/Israel strikes: include Iranian characterization alongside US framing
4. Casualties ordered by count (Iran highest → Israel → Gulf → US)
5. Include Iranian civilian harm from US-Israel strikes
6. Ceasefire path: Iran-Oman back-channel (Iran's condition: US base closure)
   AND Xi-Trump — not only one side's channel
7. CENTCOM/IRGC/IDF = party sources, require independent corroboration

Output ONLY valid JSON — no preamble, no markdown fences."""

    report_prompts = {
        "general": base_context + f"""

Generate a GENERAL INTELLIGENCE BRIEF for Day {conflict_day}.
Output JSON:
{{
  "title": "General Intelligence Brief — Day {conflict_day}",
  "lead": "2-3 sentence summary of most critical development today — neutral framing",
  "cover_stats": {{
    "conflict_day": {conflict_day},
    "regional_dead": <number>,
    "iran_civilian_dead": <number>,
    "iran_blackout_hours": <number>,
    "us_kia": <number>,
    "brent_oil": <number>,
    "oil_change_pct": <number>
  }},
  "sections": [
    {{
      "id": "zone-1",
      "heading": "ZONE 1 — DIRECT COMBATANTS",
      "type": "zone",
      "subsections": [
        {{
          "id": "usa",
          "heading": "🇺🇸 UNITED STATES — Operation Epic Fury",
          "nai_category": "FRACTURED",
          "nai_expressed": 38,
          "nai_latent": 51,
          "paragraphs": [
            {{"text": "...", "perspective": "us_israel"}},
            {{"text": "...", "perspective": "neutral"}}
          ]
        }},
        {{
          "id": "iran",
          "heading": "🇮🇷 IRAN — Operation True Promise IV (وعد صادق ۴)",
          "nai_category": "ALIGNED",
          "nai_expressed": 72,
          "nai_latent": 58,
          "paragraphs": [
            {{"text": "...", "perspective": "iran_irgc"}},
            {{"text": "...", "perspective": "neutral"}}
          ]
        }},
        {{
          "id": "israel",
          "heading": "🇮🇱 ISRAEL — Operation Roaring Lion",
          "nai_category": "ALIGNED",
          "nai_expressed": 61,
          "nai_latent": 65,
          "paragraphs": [
            {{"text": "...", "perspective": "us_israel"}},
            {{"text": "...", "perspective": "neutral"}}
          ]
        }}
      ]
    }},
    {{
      "id": "module-d",
      "heading": "MODULE D — STRATEGIC FORECAST",
      "type": "module",
      "subsections": [
        {{
          "id": "forecast-72h",
          "heading": "72-Hour Assessment",
          "paragraphs": [{{"text": "...", "perspective": "neutral"}}]
        }},
        {{
          "id": "forecast-scenarios",
          "heading": "Scenario Probabilities",
          "paragraphs": [{{"text": "A=...% B=...% C=...% D=...% E=...% — analysis of movement", "perspective": "neutral"}}]
        }}
      ]
    }}
  ],
  "source_ids": []
}}""",

        "egypt": base_context + f"""

Generate an EGYPT COUNTRY BRIEF for Day {conflict_day}.
Key data: EGP/USD rate, Suez Canal status, gas supply gap,
Morgan Stanley energy deficit projection, official position
(mediator neutrality — declined to condemn US-Israel strikes),
social media pulse (label as anti-US-intervention NOT pro-Iran).
Output same JSON section structure as general brief.
Include both Egypt's official framing AND street/opposition framing.""",

        "uae": base_context + f"""

Generate a UAE COUNTRY BRIEF for Day {conflict_day}.
Key data: 221 ballistic/1305 drones tracked (93% intercept),
6 civilian KIA, DIFC evacuations, Australian evacuation advisory.
CRITICAL: Include Iranian perspective subsection in Module 2:
Iran's IRGC designated Al Dhafra (US), Camp de la Paix (French),
US Consulate as primary military targets — UAE rejects this.
Scenario E (UAE direct strike on Iran) probability: 22%.
Output same JSON section structure.""",

        "eschatology": base_context + f"""

Generate an ESCHATOLOGY & GEOPOLITICS ANALYSIS for Day {conflict_day}.
Cover: 200+ MRFF complaints (40+ units, 30+ installations),
Christian dispensationalism and Kharg Island strike framing,
Jewish Amalek/Purim framework, Shia Mahdist context for
Mojtaba's election and defiant first statement,
Sunni Malhamah/Dajjal mobilization signals,
geopolitical consequences (diplomatic exit constraints,
casualty tolerance, Muslim world mobilization).
This is a Tier 1 operational variable — frame it as such.
Output same JSON section structure.""",

        "business": base_context + f"""

Generate a BUSINESS OPPORTUNITIES report (UAE + Egypt) for Day {conflict_day}.
CRITICAL REQUIREMENT: Section 1 must include zero-sum dimensions —
these gains exist partly at Iran's economic expense (Kharg 90% crude,
Hormuz closure). Do not present as cost-free opportunities.
Present Hormuz from BOTH angles:
- US/Gulf/business: re-opening = recovery trigger
- Iranian: closure = primary strategic leverage tool
UAE sectors: energy trading/storage, reconstruction, gold/hard assets,
defense/cybersecurity, aviation (contrarian buy-the-dip), financial flows.
Egypt sectors: Suez recovery play, food security trade, reconstruction
gateway positioning, currency/financial arbitrage.
Include risk matrix and timing guidance.
Output same JSON section structure.""",
    }

    for report_type in to_generate:
        prompt = report_prompts.get(report_type)
        if not prompt:
            continue

        try:
            result_text = call_claude_batch(
                f"briefing-{report_type}-day{conflict_day}",
                "claude-haiku-4-5-20251001",
                4000,
                [{"role": "user", "content": prompt}],
            )
            result_text = result_text.strip()
            if result_text.startswith("```"):
                result_text = result_text.split("\n", 1)[1]
                result_text = result_text.rsplit("```", 1)[0]

            briefing_data = json.loads(result_text)

            row = {
                "conflict_day": conflict_day,
                "report_type": report_type,
                "title": briefing_data.get(
                    "title", f"{report_type.title()} Brief — Day {conflict_day}"
                ),
                "lead": briefing_data.get("lead"),
                "cover_stats": briefing_data.get("cover_stats"),
                "sections": briefing_data.get("sections", []),
                "source_ids": briefing_data.get("source_ids", []),
                "source": "platform",
                "quality": "auto",
                "updated_at": now,
            }

            resp = requests.post(
                f"{SUPABASE_URL}/rest/v1/daily_briefings"
                f"?on_conflict=conflict_day,report_type",
                headers={**SB_HEADERS, "Prefer": "resolution=merge-duplicates,return=minimal"},
                json=row,
                timeout=15,
            )
            if resp.status_code in (200, 201, 204):
                section_count = len(briefing_data.get("sections", []))
                print(f"  ✅ {report_type} briefing written ({section_count} sections)")
            else:
                print(f"  ⚠️  {report_type} write failed: {resp.status_code} {resp.text[:150]}")

        except json.JSONDecodeError as e:
            print(f"  ⚠️  {report_type} JSON parse error: {e}")
        except Exception as e:
            print(f"  ⚠️  {report_type} generation failed: {e}")


def main():
    print(f"🧠 Daily Analysis — {datetime.datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}")
    
    conflict_day = get_current_conflict_day()
    print(f"📅 Conflict Day: {conflict_day}")

    print("📥 Reading DB snapshot...")
    data = build_data_snapshot(conflict_day)
    print(f"   Articles: {len(data['articles'])} | Markets: {len(data['markets'])} | Social: {len(data['social'])}")

    print("🤖 Calling Claude API...")
    analysis = call_claude(conflict_day, data)
    print(f"   Got {len(analysis.get('nai_scores',[]))} NAI scores, {len(analysis.get('country_reports',[]))} reports")

    print("💾 Writing to Supabase...")
    write_to_supabase(conflict_day, analysis)

    # Generate daily briefings for web reader
    print("📄 Generating daily briefings...")
    generate_daily_briefings(conflict_day, data, analysis)

    # Smart scenario detection
    print("🔍 Running scenario detection...")
    new_scenario = detect_new_scenario(conflict_day, data, analysis)
    if new_scenario:
        write_new_scenario_to_db(conflict_day, new_scenario)
    else:
        print("  ✓ No new scenarios detected today.")

    print("✅ Daily analysis complete.")

if __name__ == "__main__":
    main()
