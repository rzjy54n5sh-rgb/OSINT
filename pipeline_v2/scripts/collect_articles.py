"""
collect_articles.py
Fetches real news articles from RSS feeds and writes to Supabase articles table.
Runs every 30 minutes via GitHub Actions.
Sources: Reuters, BBC, Al-Jazeera, AP, France24, Times of Israel
"""

import os
import sys
import json
import hashlib
import datetime
import feedparser
import requests
from dateutil import parser as dateparser

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=ignore-duplicates",
}

# Conflict start date — Feb 28 2026 = Day 1
CONFLICT_START = datetime.date(2026, 2, 28)

def conflict_day(dt=None):
    d = (dt.date() if dt else datetime.date.today())
    return max(1, (d - CONFLICT_START).days + 1)

def classify_region(text):
    text = text.lower()
    if any(w in text for w in ["iran", "tehran", "khamenei", "irgc", "persian"]):
        return "Iran"
    if any(w in text for w in ["israel", "tel aviv", "jerusalem", "idf", "netanyahu"]):
        return "Israel"
    if any(w in text for w in ["iraq", "baghdad", "karbala", "mosul"]):
        return "Iraq"
    if any(w in text for w in ["saudi", "riyadh", "aramco", "mbs"]):
        return "Saudi Arabia"
    if any(w in text for w in ["uae", "dubai", "abu dhabi", "emirates"]):
        return "UAE"
    if any(w in text for w in ["houthi", "yemen", "sanaa", "hodeidah"]):
        return "Yemen"
    if any(w in text for w in ["lebanon", "hezbollah", "beirut"]):
        return "Lebanon"
    if any(w in text for w in ["syria", "damascus"]):
        return "Syria"
    if any(w in text for w in ["hormuz", "strait", "gulf", "persian gulf"]):
        return "Persian Gulf"
    if any(w in text for w in ["oil", "crude", "opec", "brent", "wti"]):
        return "Energy"
    if any(w in text for w in ["pentagon", "washington", "white house", "biden", "trump", "us army", "us navy"]):
        return "USA"
    return "Global"

def classify_sentiment(text):
    text = text.lower()
    neg = ["attack", "strike", "kill", "dead", "bomb", "war", "missile", "explosion", "crisis", "threat", "sanction", "escalat"]
    pos = ["ceasefire", "peace", "deal", "agreement", "diplomacy", "talks", "withdraw", "calm"]
    n = sum(1 for w in neg if w in text)
    p = sum(1 for w in pos if w in text)
    if n > p: return "negative"
    if p > n: return "positive"
    return "neutral"

def url_to_id(url):
    """Deterministic UUID-like ID from URL to avoid duplicates."""
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

# Relevant keywords — only insert articles about this conflict
KEYWORDS = [
    "iran", "irgc", "khamenei", "hormuz", "tehran",
    "israel", "idf", "houthi", "hezbollah",
    "us-iran", "iran war", "middle east war", "iran strike",
    "oil price", "crude oil", "persian gulf",
    "iraq militia", "yemen missile", "strait of hormuz",
    "nuclear iran", "us military iran", "centcom",
]

RSS_FEEDS = [
    {
        "url": "https://feeds.reuters.com/reuters/topNews",
        "source_name": "Reuters",
        "source_type": "wire",
    },
    {
        "url": "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml",
        "source_name": "BBC",
        "source_type": "broadcast",
    },
    {
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "source_name": "Al Jazeera",
        "source_type": "broadcast",
    },
    {
        "url": "https://feeds.ap.org/apf-topnews",
        "source_name": "AP",
        "source_type": "wire",
    },
    {
        "url": "https://www.france24.com/en/rss",
        "source_name": "France24",
        "source_type": "broadcast",
    },
    {
        "url": "https://www.timesofisrael.com/feed/",
        "source_name": "Times of Israel",
        "source_type": "regional",
    },
    {
        "url": "https://english.alarabiya.net/rss.xml",
        "source_name": "Al Arabiya",
        "source_type": "regional",
    },
    {
        "url": "https://www.middleeasteye.net/rss",
        "source_name": "Middle East Eye",
        "source_type": "regional",
    },
]

def is_relevant(title, summary):
    combined = (title + " " + (summary or "")).lower()
    return any(kw in combined for kw in KEYWORDS)

def fetch_feed(feed_cfg):
    try:
        d = feedparser.parse(feed_cfg["url"])
        articles = []
        for entry in d.entries:
            title = entry.get("title", "")
            summary = entry.get("summary", "") or entry.get("description", "")
            url = entry.get("link", "")
            if not url or not is_relevant(title, summary):
                continue

            # Parse published date
            pub_str = entry.get("published", "") or entry.get("updated", "")
            try:
                pub_dt = dateparser.parse(pub_str) if pub_str else datetime.datetime.utcnow()
            except Exception:
                pub_dt = datetime.datetime.utcnow()

            region = classify_region(title + " " + summary)
            sentiment = classify_sentiment(title + " " + summary)

            articles.append({
                "id": url_to_id(url),
                "title": title[:500],
                "summary": summary[:1000] if summary else None,
                "url": url,
                "source_name": feed_cfg["source_name"],
                "source_type": feed_cfg["source_type"],
                "published_at": pub_dt.isoformat(),
                "fetched_at": datetime.datetime.utcnow().isoformat(),
                "conflict_day": conflict_day(pub_dt),
                "region": region,
                "country": region,
                "sentiment": sentiment,
                "tags": [],
            })
        return articles
    except Exception as e:
        print(f"  ERROR fetching {feed_cfg['source_name']}: {e}")
        return []

def upsert_articles(articles):
    if not articles:
        return 0
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/articles",
        headers={**HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal"},
        json=articles,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Supabase error: {resp.status_code} — {resp.text[:300]}")
        return 0
    return len(articles)

def main():
    total = 0
    print(f"[collect_articles] Starting — {datetime.datetime.utcnow().isoformat()}Z")
    for feed in RSS_FEEDS:
        articles = fetch_feed(feed)
        inserted = upsert_articles(articles)
        print(f"  {feed['source_name']}: {len(articles)} relevant → {inserted} upserted")
        total += inserted
    print(f"[collect_articles] Done — {total} total articles written")

if __name__ == "__main__":
    main()
