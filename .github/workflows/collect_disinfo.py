"""
collect_disinfo.py
Fetches fact-checking articles from Snopes, AFP Fact Check, Reuters Fact Check.
Filters for Middle East / Iran conflict claims.
Writes to Supabase disinfo_claims table.
Runs daily via GitHub Actions.
"""

import os
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
}

KEYWORDS = [
    "iran", "irgc", "israel", "houthi", "hezbollah", "hormuz",
    "oil", "middle east", "war", "nuclear", "missile", "drone",
    "saudi", "yemen", "iraq", "us military",
]

FACT_CHECK_FEEDS = [
    {
        "url": "https://www.reuters.com/fact-check/rss",
        "source": "Reuters Fact Check",
    },
    {
        "url": "https://factcheck.afp.com/list/all/feed",
        "source": "AFP Fact Check",
    },
    {
        "url": "https://www.snopes.com/feed/",
        "source": "Snopes",
    },
    {
        "url": "https://www.bbc.co.uk/news/reality_check/rss.xml",
        "source": "BBC Reality Check",
    },
    {
        "url": "https://apnews.com/hub/ap-fact-check/feed",
        "source": "AP Fact Check",
    },
]

def url_to_id(url):
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def guess_verdict(title, summary):
    text = (title + " " + (summary or "")).lower()
    if any(w in text for w in ["false", "fake", "debunk", "no evidence", "misleading claim", "wrong"]):
        return "FALSE"
    if any(w in text for w in ["misleading", "out of context", "partly", "missing context"]):
        return "MISLEADING"
    if any(w in text for w in ["true", "confirmed", "accurate", "verified"]):
        return "TRUE"
    return "UNVERIFIED"

def is_relevant(title, summary):
    combined = (title + " " + (summary or "")).lower()
    return any(kw in combined for kw in KEYWORDS)

def fetch_disinfo():
    records = []
    seen_ids = set()

    for feed_cfg in FACT_CHECK_FEEDS:
        try:
            d = feedparser.parse(feed_cfg["url"])
            for entry in d.entries:
                title = entry.get("title", "")
                summary = entry.get("summary", "") or entry.get("description", "")
                url = entry.get("link", "")
                if not url or not is_relevant(title, summary):
                    continue

                rid = url_to_id(url)
                if rid in seen_ids:
                    continue
                seen_ids.add(rid)

                pub_str = entry.get("published", "") or entry.get("updated", "")
                try:
                    pub_dt = dateparser.parse(pub_str) if pub_str else datetime.datetime.utcnow()
                except Exception:
                    pub_dt = datetime.datetime.utcnow()

                records.append({
                    "id": rid,
                    "claim_text": title[:500],
                    "verdict": guess_verdict(title, summary),
                    "source_url": url,
                    "debunk_url": url,
                    "spread_estimate": "UNKNOWN",
                    "published_at": pub_dt.isoformat(),
                    "created_at": datetime.datetime.utcnow().isoformat(),
                })
                print(f"  [{feed_cfg['source']}] {guess_verdict(title, summary)}: {title[:80]}")
        except Exception as e:
            print(f"  ERROR {feed_cfg['source']}: {e}")

    return records

def upsert_disinfo(records):
    if not records:
        return 0
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/disinfo_claims",
        headers={**HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal"},
        json=records,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  Supabase error: {resp.status_code} — {resp.text[:300]}")
        return 0
    return len(records)

def main():
    print(f"[collect_disinfo] Starting — {datetime.datetime.utcnow().isoformat()}Z")
    records = fetch_disinfo()
    inserted = upsert_disinfo(records)
    print(f"[collect_disinfo] Done — {inserted} disinfo claims written")

if __name__ == "__main__":
    main()
