#!/usr/bin/env python3
"""
detect_scenarios.py — Smart scenario detection (Phase 11, Section 16).
ALL THREE criteria required: (1) ≥2 independent sources, (2) new state actor or new
instrument category, (3) not reducible to existing A–E. Writes status='candidate' only;
admin approval required. Includes acting_party_framing and affected_party_framing.
"""
import os
import sys
import json
import argparse
import requests

CONFLICT_START_YMD = (2026, 2, 28)
INTEL_PATH_TEMPLATE = "/tmp/intel_day_{}.json"
OUTPUT_PATH_TEMPLATE = "/tmp/scenario_detection_day{}.json"
NEW_INSTRUMENTS = {
    "nuclear", "chemical", "biological", "ground troops", "second front",
    "carrier sunk", "nuclear device", "ground forces", "deploys forces",
}
EXISTING_SCENARIOS = {
    "A": "ceasefire / managed exit",
    "B": "prolonged war",
    "C": "cascade / dual closure",
    "D": "escalation spiral (Kharg + Gulf oil)",
    "E": "UAE direct strike",
}


def conflict_day_from_date(d: tuple) -> int:
    from datetime import date
    ref = date(*CONFLICT_START_YMD)
    today = date(d[0], d[1], d[2]) if len(d) >= 3 else date.today()
    return max(1, (today - ref).days + 1)


def load_intel(day: int) -> list:
    path = INTEL_PATH_TEMPLATE.format(day)
    if not os.path.isfile(path):
        return []
    with open(path) as f:
        data = json.load(f)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "articles" in data:
        return data["articles"]
    return []


def criteria_check_candidate(entry: dict) -> bool:
    """Check ALL THREE criteria (all required)."""
    # 1: At least 2 independent sources
    sources = entry.get("trigger_sources") or entry.get("sources") or []
    if isinstance(sources, list) and len(sources) < 2:
        return False
    if isinstance(sources, dict):
        return False
    # 2: New state actor OR new instrument category
    new_actor = (entry.get("new_actor") or "").strip()
    new_instrument = (entry.get("new_instrument") or "").strip().lower()
    has_new_actor = bool(new_actor)
    has_new_instrument = any(
        inst in new_instrument for inst in NEW_INSTRUMENTS
    ) or new_instrument in NEW_INSTRUMENTS
    if not has_new_actor and not has_new_instrument:
        return False
    # 3: Not reducible to existing A–E (handled in prompt / model output)
    return True


def call_claude(articles: list, day: int) -> list:
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        print("ANTHROPIC_API_KEY not set", file=sys.stderr)
        return []
    url = "https://api.anthropic.com/v1/messages"
    system = """You are a scenario analyst. Identify ONLY scenarios that meet ALL three criteria:
1. At least 2 INDEPENDENT sources in the provided data confirm the development.
2. Either a new STATE ACTOR is entering the conflict OR a new INSTRUMENT category appears: nuclear | chemical | biological | ground troops | second front | carrier sunk (or similar).
3. The development is NOT reducible to existing scenarios:
   A = ceasefire/managed exit; B = prolonged war; C = cascade/dual closure; D = escalation spiral (Kharg+Gulf oil); E = UAE direct strike.

For each candidate you output, you MUST include:
- acting_party_framing: perspective of the party taking the new action (one sentence).
- affected_party_framing: perspective of parties being affected (one sentence).
Output a JSON array of objects with: label, title, description_en, new_actor (or null), new_instrument (or null), trigger_sources (array of source identifiers), source_count, acting_party_framing, affected_party_framing. If no scenario meets all three criteria, output []."""

    user_content = f"Conflict day: {day}. Articles/items (excerpts):\n" + json.dumps(
        [{"title": a.get("title"), "source": a.get("source_name"), "summary": (a.get("summary") or "")[:300]} for a in articles[:80]],
        indent=0,
    )[:12000]

    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    body = {
        "model": "claude-sonnet-4-20250514",
        "max_tokens": 2000,
        "system": system,
        "messages": [{"role": "user", "content": user_content}],
    }
    try:
        r = requests.post(url, headers=headers, json=body, timeout=120)
        r.raise_for_status()
        data = r.json()
        content = data.get("content") or []
        text = ""
        for block in content:
            if block.get("type") == "text":
                text += block.get("text", "")
        if not text.strip():
            return []
        # Parse JSON array from response
        text = text.strip()
        if text.startswith("```"):
            lines = text.split("\n")
            text = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
        return json.loads(text)
    except Exception as e:
        print(f"Claude API error: {e}", file=sys.stderr)
        return []


def upsert_candidates(day: int, candidates: list) -> None:
    url = os.environ.get("SUPABASE_URL", "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY", "")
    if not url or not key:
        print("SUPABASE_URL or SUPABASE_SERVICE_KEY not set", file=sys.stderr)
        return
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    for c in candidates:
        if not criteria_check_candidate(c):
            continue
        row = {
            "conflict_day": day,
            "label": (c.get("label") or "candidate")[:64],
            "title": (c.get("title") or c.get("label") or "Candidate")[:256],
            "description_en": (c.get("description_en") or "")[:4096],
            "description_ar": (c.get("description_ar") or "")[:4096] or None,
            "new_actor": (c.get("new_actor") or "")[:256] or None,
            "new_instrument": (c.get("new_instrument") or "")[:256] or None,
            "trigger_sources": c.get("trigger_sources") or [],
            "source_count": int(c.get("source_count") or len(c.get("trigger_sources") or [])),
            "acting_party_framing": (c.get("acting_party_framing") or "")[:1024] or None,
            "affected_party_framing": (c.get("affected_party_framing") or "")[:1024] or None,
            "status": "candidate",
            "detected_by": "claude_pipeline",
            "detection_model": "claude-sonnet-4-20250514",
        }
        try:
            r = requests.post(
                f"{url}/rest/v1/detected_scenarios",
                headers=headers,
                json=row,
                timeout=15,
            )
            if r.status_code not in (200, 201):
                print(f"Supabase insert error: {r.status_code} {r.text[:200]}", file=sys.stderr)
        except Exception as e:
            print(f"Insert failed: {e}", file=sys.stderr)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True, help="Conflict day")
    args = ap.parse_args()
    day = args.day

    articles = load_intel(day)
    if not articles:
        print(f"No intel file for day {day}; writing empty summary.")
        summary = {"day": day, "candidates": [], "message": "No input articles"}
        with open(OUTPUT_PATH_TEMPLATE.format(day), "w") as f:
            json.dump(summary, f, indent=2)
        return

    candidates = call_claude(articles, day)
    if not isinstance(candidates, list):
        candidates = []
    upsert_candidates(day, candidates)
    summary = {
        "day": day,
        "candidates": [
            {
                "label": c.get("label"),
                "title": c.get("title"),
                "new_actor": c.get("new_actor"),
                "new_instrument": c.get("new_instrument"),
                "source_count": c.get("source_count"),
            }
            for c in candidates
        ],
    }
    with open(OUTPUT_PATH_TEMPLATE.format(day), "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Scenario detection day {day}: {len(candidates)} candidates (status=candidate)")


if __name__ == "__main__":
    main()
