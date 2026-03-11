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

def get_current_conflict_day():
    """Derive conflict day from latest data in DB."""
    try:
        rows = sb_get("nai_scores?select=conflict_day&order=conflict_day.desc&limit=1")
        if rows:
            return rows[0]["conflict_day"] + 1
    except Exception:
        pass
    # Fallback: count days since conflict start (approximate: Feb 28, 2026)
    conflict_start = datetime.date(2026, 2, 28)
    return (datetime.date.today() - conflict_start).days

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

    system_prompt = """You are a geopolitical intelligence analyst for the MENA conflict tracker.
You analyze raw data and produce structured JSON analysis.

Your output MUST be valid JSON only — no preamble, no markdown, no explanation.
Output structure:
{
  "nai_scores": [
    {
      "country_code": "XX",
      "expressed_score": 0-100,
      "latent_score": 0-100,
      "gap_size": number,
      "category": "ALIGNED|STABLE|TENSION|FRACTURE|INVERSION"
    }
  ],
  "country_reports": [
    {
      "country_code": "XX",
      "country_name": "...",
      "nai_score": number,
      "nai_category": "...",
      "content_json": {
        "nai": {"expressed": n, "latent": n, "gap_size": n, "velocity": n, "category": "..."},
        "scenarios": {"A": pct, "B": pct, "C": pct, "D": pct},
        "key_risks": ["...", "...", "...", "..."],
        "stabilizers": ["...", "...", "..."],
        "elite_network": [{"name": "...", "role": "...", "position": "...", "red_line": "..."}],
        "assessment": "3-5 sentence analytical paragraph",
        "social_summary": "1-2 sentence social media signal"
      }
    }
  ],
  "scenario_probabilities": {
    "scenario_a": number,
    "scenario_b": number,
    "scenario_c": number,
    "scenario_d": number
  }
}

NAI (National Alignment Index) scoring:
- Expressed score (0-100): How openly a country supports/opposes the US-Iran conflict
- Latent score (0-100): The underlying true alignment of the population/elites
- Gap = expressed - latent (positive = overexpressing, negative = underexpressing)
- ALIGNED: both scores >75, gap <10
- STABLE: expressed >50, gap <15
- TENSION: expressed 30-60, gap 10-25
- FRACTURE: expressed 20-45, gap 5-15, downward velocity
- INVERSION: expressed <30, latent diverging significantly

Scenario definitions:
- A: De-escalation/Ceasefire (US-Iran negotiated pause)
- B: Controlled Conflict (ongoing strikes, no regional expansion)
- C: Humanitarian/Economic Crisis (Hormuz closure, supply chain collapse)
- D: Regional War Expansion (multiple state actors drawn in)
All four must sum to 100.

Analyze ALL 20 countries listed in the user prompt."""

    articles_text = "\n".join(
        f"[{a.get('country','GLOBAL')}][{a.get('sentiment','')}] {a.get('source_name','')}: {a.get('title','')}"
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
    prev_sc_text = (
        f"A={prev_sc['scenario_a']}% B={prev_sc['scenario_b']}% C={prev_sc['scenario_c']}% D={prev_sc['scenario_d']}%"
        if prev_sc else "No previous data"
    )

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
            "max_tokens": 8000,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        },
        timeout=120,
    )
    response.raise_for_status()
    
    content = response.json()["content"][0]["text"]
    # Strip any accidental markdown fences
    content = content.strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]
    
    return json.loads(content)

def write_to_supabase(conflict_day, analysis):
    """Write Claude's analysis back to Supabase."""
    now = datetime.datetime.utcnow().isoformat() + "+00:00"
    
    # 1. NAI scores — upsert by country_code + conflict_day
    nai_rows = []
    for n in analysis.get("nai_scores", []):
        nai_rows.append({
            "country_code": n["country_code"],
            "conflict_day": conflict_day,
            "expressed_score": n["expressed_score"],
            "latent_score": n["latent_score"],
            "gap_size": abs(n["expressed_score"] - n["latent_score"]),
            "category": n["category"],
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

    # 2. Country reports — patch each by country_code
    for r in analysis.get("country_reports", []):
        payload = {
            "nai_score": r["nai_score"],
            "nai_category": r["nai_category"],
            "content_json": r["content_json"],
            "conflict_day": conflict_day,
            "updated_at": now,
        }
        requests.patch(
            f"{SUPABASE_URL}/rest/v1/country_reports?country_code=eq.{r['country_code']}",
            headers=SB_HEADERS,
            json=payload,
        )
    print(f"  ✅ Country reports: {len(analysis.get('country_reports', []))} updated")

    # 3. Scenario probabilities
    sc = analysis.get("scenario_probabilities")
    if sc:
        # Normalize to 100
        total = sc["scenario_a"] + sc["scenario_b"] + sc["scenario_c"] + sc["scenario_d"]
        if total != 100:
            sc = {k: round(v * 100 / total) for k, v in sc.items()}
        
        # Delete existing day row if any, insert fresh
        requests.delete(
            f"{SUPABASE_URL}/rest/v1/scenario_probabilities?conflict_day=eq.{conflict_day}",
            headers=SB_HEADERS,
        )
        requests.post(
            f"{SUPABASE_URL}/rest/v1/scenario_probabilities",
            headers=SB_HEADERS,
            json={**sc, "conflict_day": conflict_day, "updated_at": now},
        ).raise_for_status()
    print(f"  ✅ Scenarios: A={sc['scenario_a']}% B={sc['scenario_b']}% C={sc['scenario_c']}% D={sc['scenario_d']}%")


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

    print("✅ Daily analysis complete.")

if __name__ == "__main__":
    main()
