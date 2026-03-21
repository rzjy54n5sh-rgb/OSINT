"""
collect_social.py
Fetches Google Trends data for conflict-related keywords.
Writes to Supabase social_trends table.
Runs every 6 hours via GitHub Actions.
"""

import os
import time
import datetime
import requests
from pytrends.request import TrendReq

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

CONFLICT_START = datetime.date(2026, 2, 28)

def conflict_day():
    return max(1, (datetime.date.today() - CONFLICT_START).days + 1)

# Keyword groups per region/country
TREND_GROUPS = [
    {
        "country": "United States",
        "region": "USA",
        "geo": "US",
        "keywords": ["Iran war", "oil prices", "US military Iran", "World War 3", "Houthis"],
    },
    {
        "country": "United Kingdom",
        "region": "Europe",
        "geo": "GB",
        "keywords": ["Iran war", "oil prices", "Middle East war", "ceasefire"],
    },
    {
        "country": "Saudi Arabia",
        "region": "Gulf",
        "geo": "SA",
        "keywords": ["Iran", "oil", "war", "Houthis", "Yemen"],
    },
    {
        "country": "Egypt",
        "region": "MENA",
        "geo": "EG",
        "keywords": ["Iran war", "Middle East", "oil", "Gaza", "Suez"],
    },
    {
        "country": "Turkey",
        "region": "MENA",
        "geo": "TR",
        "keywords": ["Iran savaşı", "Ortadoğu", "petrol fiyatları", "İran"],
    },
    {
        "country": "Pakistan",
        "region": "South Asia",
        "geo": "PK",
        "keywords": ["Iran war", "Muslim world", "oil prices", "Middle East"],
    },
    {
        "country": "India",
        "region": "South Asia",
        "geo": "IN",
        "keywords": ["Iran war", "oil price India", "Middle East conflict"],
    },
    {
        "country": "United Arab Emirates",
        "region": "Gulf",
        "geo": "AE",
        "keywords": ["Iran", "oil", "Middle East", "Houthis", "war"],
    },
    {
        "country": "Israel",
        "region": "MENA",
        "geo": "IL",
        "keywords": ["Iran", "Hezbollah", "war", "Gaza", "IDF"],
    },
    {
        "country": "Lebanon",
        "region": "MENA",
        "geo": "LB",
        "keywords": ["Hezbollah", "Israel", "Beirut", "war"],
    },
    {
        "country": "Jordan",
        "region": "MENA",
        "geo": "JO",
        "keywords": ["Iran", "Middle East", "war", "refugees"],
    },
    {
        "country": "Kuwait",
        "region": "Gulf",
        "geo": "KW",
        "keywords": ["Iran", "oil", "Gulf", "war"],
    },
]

def classify_sentiment_from_keywords(keywords):
    """Rough sentiment based on which keywords are trending."""
    fear = ["world war", "nuclear", "attack", "bomb", "crisis"]
    anti = ["peace", "ceasefire", "protest", "anti war"]
    combined = " ".join(keywords).lower()
    if any(w in combined for w in fear):
        return "fearful"
    if any(w in combined for w in anti):
        return "anti_war"
    return "neutral"

def fetch_trends_for_group(group, pytrends, max_retries=3):
    """Fetch interest over time for a keyword group. Retries on 429 with backoff."""
    for attempt in range(max_retries):
        try:
            pytrends.build_payload(
                group["keywords"][:5],
                timeframe="now 1-d",
                geo=group["geo"],
            )
            interest = pytrends.interest_over_time()
            if interest.empty:
                return None

            # Get average interest across all keywords (0–100 scale)
            keyword_cols = [c for c in interest.columns if c != "isPartial"]
            avg_interest = interest[keyword_cols].mean().mean()

            # Top trending keyword
            col_means = interest[keyword_cols].mean()
            top_keyword = col_means.idxmax() if not col_means.empty else group["keywords"][0]

            # Store numeric score only: matches lib/utils parseEngagementEstimate (x/100 → x*1000).
            # String "LOW (21/100)" breaks DB columns typed as bigint; integer works for bigint and TEXT.
            engagement_numeric = int(round(float(avg_interest) * 1000))

            return {
                "region": group["region"],
                "country": group["country"],
                "platform": "Google Trends",
                "trend": top_keyword,
                "sentiment": classify_sentiment_from_keywords(group["keywords"]),
                "engagement_estimate": engagement_numeric,
                "conflict_day": conflict_day(),
                "created_at": datetime.datetime.utcnow().isoformat(),
            }
        except Exception as e:
            err_str = str(e).lower()
            is_rate_limit = "429" in err_str or "too many" in err_str or "rate" in err_str
            if is_rate_limit and attempt < max_retries - 1:
                backoff = 30 * (attempt + 1)  # 30s, 60s, 90s
                print(f"  Trends rate limit for {group['country']}, retry in {backoff}s (attempt {attempt + 1}/{max_retries})")
                time.sleep(backoff)
            else:
                print(f"  Trends error for {group['country']}: {e}")
                return None
    return None

def insert_trends(records):
    if not records:
        return 0
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/social_trends",
        headers={**HEADERS, "Prefer": "return=minimal"},
        json=records,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Supabase error: {resp.status_code} — {resp.text[:300]}")
        return 0
    return len(records)

def main():
    day = conflict_day()
    print(f"[collect_social] Day {day} — {datetime.datetime.utcnow().isoformat()}Z")

    try:
        pytrends = TrendReq(hl="en-US", tz=0, timeout=(10, 25), retries=2, backoff_factor=1.0)
    except Exception as e:
        print(f"  pytrends init error: {e}")
        return

    # Initial delay to avoid burst 429 from Google Trends (CI IPs are often rate-limited)
    time.sleep(5)

    records = []
    for i, group in enumerate(TREND_GROUPS):
        print(f"  Fetching trends: {group['country']}...")
        result = fetch_trends_for_group(group, pytrends)
        if result:
            records.append(result)
            print(f"    → {result['trend']} | {result['sentiment']} | engagement_estimate={result['engagement_estimate']}")
        # 15s between countries to stay under Google Trends rate limit (avoid 429)
        if i < len(TREND_GROUPS) - 1:
            time.sleep(15)

    inserted = insert_trends(records)
    print(f"[collect_social] Done — {inserted} social trend records written")

if __name__ == "__main__":
    main()
