"""
warm_kv_cache.py — Writes a fresh Supabase snapshot to Cloudflare KV after each pipeline run.

This is called at the END of collect_feeds.py, collect_markets.py, and collect_social.py.
The Cloudflare Worker then reads from KV instead of hitting Supabase on every page load.

KV keys written:
  snapshot:dashboard   — main dashboard data (markets, NAI, scenarios, latest articles)
  snapshot:countries   — all country reports
  snapshot:articles    — latest 20 articles
  snapshot:updated_at  — ISO timestamp of last update

TTL: 300 seconds (5 minutes) — Worker checks this and re-reads if stale.
"""

import os
import json
import requests
import datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
CF_ACCOUNT_ID = os.environ.get("CF_ACCOUNT_ID", "")
CF_KV_NAMESPACE_ID = os.environ.get("CF_KV_NAMESPACE_ID", "")
CF_API_TOKEN = os.environ.get("CF_API_TOKEN", "")

if not all([CF_ACCOUNT_ID, CF_KV_NAMESPACE_ID, CF_API_TOKEN]):
    print("[warm_kv_cache] Cloudflare KV secrets not set — skipping cache warm")
    exit(0)

SB_HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
}

CF_KV_URL = f"https://api.cloudflare.com/client/v4/accounts/{CF_ACCOUNT_ID}/storage/kv/namespaces/{CF_KV_NAMESPACE_ID}/values"
CF_HEADERS = {
    "Authorization": f"Bearer {CF_API_TOKEN}",
    "Content-Type": "application/json",
}

def sb_get(path):
    r = requests.get(f"{SUPABASE_URL}/rest/v1/{path}", headers=SB_HEADERS, timeout=15)
    r.raise_for_status()
    return r.json()

def kv_put(key, value_dict, ttl_seconds=300):
    """Write JSON value to Cloudflare KV with TTL."""
    r = requests.put(
        f"{CF_KV_URL}/{key}",
        headers={**CF_HEADERS, "Content-Type": "application/json"},
        params={"expiration_ttl": ttl_seconds},
        data=json.dumps(value_dict),
        timeout=10,
    )
    return r.status_code

def build_and_warm():
    now = datetime.datetime.utcnow().isoformat() + "Z"
    
    # Get current conflict day
    nai_latest = sb_get("nai_scores?select=conflict_day&order=conflict_day.desc&limit=1")
    conflict_day = nai_latest[0]["conflict_day"] if nai_latest else 1

    # Dashboard snapshot
    markets = sb_get(f"market_data?conflict_day=eq.{conflict_day}&order=created_at.desc&limit=30")
    # Deduplicate by indicator
    seen, markets_clean = set(), []
    for m in markets:
        if m["indicator"] not in seen:
            seen.add(m["indicator"])
            markets_clean.append(m)

    nai_scores = sb_get(f"nai_scores?conflict_day=eq.{conflict_day}&order=expressed_score.desc")
    scenarios = sb_get("scenario_probabilities?order=conflict_day.asc")
    articles_latest = sb_get("articles?select=id,title,summary,url,source_name,published_at,country,sentiment,tags&order=published_at.desc&limit=20")
    social = sb_get(f"social_trends?conflict_day=eq.{conflict_day}&order=created_at.desc")

    dashboard_snapshot = {
        "conflict_day": conflict_day,
        "updated_at": now,
        "markets": markets_clean,
        "nai_scores": nai_scores,
        "scenarios": scenarios,
        "articles": articles_latest,
        "social": social,
    }

    # Country reports snapshot
    country_reports = sb_get("country_reports?order=nai_score.desc")

    # Write to KV with 5-minute TTL
    statuses = {}
    statuses["snapshot:dashboard"] = kv_put("snapshot:dashboard", dashboard_snapshot, ttl_seconds=300)
    statuses["snapshot:countries"] = kv_put("snapshot:countries", {"reports": country_reports, "updated_at": now}, ttl_seconds=300)
    statuses["snapshot:updated_at"] = kv_put("snapshot:updated_at", {"ts": now, "conflict_day": conflict_day}, ttl_seconds=300)

    print(f"KV cache warmed: {statuses}")
    return statuses

if __name__ == "__main__":
    build_and_warm()
