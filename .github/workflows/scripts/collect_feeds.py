"""
collect_feeds.py  — Unified feed collector (replaces collect_articles.py)

Pulls from ALL sources in sources_registry.py:
  - RSS/Atom feeds (news sites)
  - Nitter RSS (Twitter/X accounts) with automatic instance failover
  - RSSHub Telegram RSS (public Telegram channels)

For each item stores ONLY:
  title, summary (≤300 chars), url, source_name, source_type,
  published_at, conflict_day, region, country, lat, lng,
  sentiment, tags

Runs every 30 minutes via GitHub Actions.
Uses deduplication by URL hash — no duplicate rows.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

import hashlib
import datetime
import requests
import feedparser
import concurrent.futures
from dateutil import parser as dateparser

from sources_registry import ALL_SOURCES, CONFLICT_KEYWORDS, NITTER_INSTANCES

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_KEY = os.environ["SUPABASE_SERVICE_KEY"]

HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
}

CONFLICT_START = datetime.date(2026, 2, 28)
BATCH_SIZE = 50          # rows per Supabase upsert
MAX_WORKERS = 10         # parallel feed fetches
ARTICLE_LIMIT = 15       # max articles per feed per run
SUMMARY_MAX_LEN = 300    # chars — keep Supabase lean


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def conflict_day(dt=None):
    d = (dt.date() if dt else datetime.date.today())
    return max(1, (d - CONFLICT_START).days + 1)

def url_to_id(url: str) -> str:
    """Stable UUID-v4-like from URL hash — prevents duplicates."""
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"

def truncate(text: str, max_len: int) -> str:
    if not text:
        return None
    text = text.strip()
    return text[:max_len] + "…" if len(text) > max_len else text

def is_relevant(title: str, summary: str) -> bool:
    combined = (title + " " + (summary or "")).lower()
    return any(kw in combined for kw in CONFLICT_KEYWORDS)

def classify_sentiment(title: str, summary: str) -> str:
    text = (title + " " + (summary or "")).lower()
    neg = ["attack", "strike", "kill", "dead", "bomb", "war", "missile",
           "explosion", "crisis", "threat", "escalat", "sanction", "casualt"]
    pos = ["ceasefire", "peace", "deal", "agreement", "diplomacy",
           "talks", "withdraw", "calm", "negotiat"]
    n = sum(1 for w in neg if w in text)
    p = sum(1 for w in pos if w in text)
    if n > p: return "negative"
    if p > n: return "positive"
    return "neutral"

def extract_tags(title: str, summary: str) -> list:
    text = (title + " " + (summary or "")).lower()
    tag_map = {
        "iran": "Iran", "irgc": "Iran", "tehran": "Iran",
        "israel": "Israel", "idf": "Israel",
        "houthi": "Yemen", "yemen": "Yemen",
        "hezbollah": "Lebanon", "beirut": "Lebanon",
        "oil": "Energy", "crude": "Energy", "hormuz": "Energy",
        "nuclear": "Nuclear", "enrichment": "Nuclear",
        "missile": "Missile", "drone": "UAV",
        "ceasefire": "Diplomacy", "diplomacy": "Diplomacy",
        "saudi": "Saudi Arabia", "aramco": "Saudi Arabia",
        "uae": "UAE", "dubai": "UAE",
        "iraq": "Iraq", "pmf": "Iraq",
        "russia": "Russia", "china": "China",
        "usa": "USA", "pentagon": "USA", "centcom": "USA",
        "escalat": "Escalation",
    }
    found = set()
    for kw, tag in tag_map.items():
        if kw in text:
            found.add(tag)
    return list(found)[:8]  # max 8 tags


# ─────────────────────────────────────────────
# NITTER FALLOVER — try instances until one works
# ─────────────────────────────────────────────

def resolve_nitter_url(feed_url: str) -> str | None:
    """
    For Nitter RSS URLs, try all instances until one returns HTTP 200.
    Non-Nitter URLs are returned as-is.
    """
    is_nitter = any(inst in feed_url for inst in NITTER_INSTANCES)
    if not is_nitter:
        return feed_url

    # Extract handle from any nitter URL pattern: /handle/rss
    parts = feed_url.rstrip("/").split("/")
    if len(parts) >= 2 and parts[-1] == "rss":
        handle = parts[-2]
    else:
        return feed_url  # unexpected format, pass through

    for instance in NITTER_INSTANCES:
        candidate = f"{instance}/{handle}/rss"
        try:
            r = requests.head(candidate, timeout=5, allow_redirects=True)
            if r.status_code == 200:
                return candidate
        except Exception:
            continue
    return None  # all instances failed


# ─────────────────────────────────────────────
# CORE FETCH
# ─────────────────────────────────────────────

def fetch_source(source: dict) -> list[dict]:
    """Fetch one source, return list of article dicts ready for Supabase."""
    url = source["url"]

    # Resolve Nitter failover
    resolved_url = resolve_nitter_url(url)
    if resolved_url is None:
        return []  # Nitter completely down for this handle

    is_social = any(x in resolved_url for x in NITTER_INSTANCES + ["rsshub.app"])

    try:
        d = feedparser.parse(resolved_url)
        entries = d.entries[:ARTICLE_LIMIT]
    except Exception as e:
        return []

    articles = []
    for entry in entries:
        title = entry.get("title", "").strip()
        raw_summary = (entry.get("summary") or entry.get("description") or "").strip()
        # Strip HTML tags simply
        import re
        raw_summary = re.sub(r"<[^>]+>", " ", raw_summary).strip()
        entry_url = entry.get("link", "").strip()

        if not title or not entry_url:
            continue

        # For social/elite sources: always include (they're already filtered by account)
        # For news sources: filter by conflict relevance
        if not is_social and not is_relevant(title, raw_summary):
            continue

        # Parse date
        pub_str = entry.get("published", "") or entry.get("updated", "")
        try:
            pub_dt = dateparser.parse(pub_str) if pub_str else datetime.datetime.utcnow()
            if pub_dt and pub_dt.tzinfo:
                pub_dt = pub_dt.replace(tzinfo=None)
        except Exception:
            pub_dt = datetime.datetime.utcnow()

        summary = truncate(raw_summary, SUMMARY_MAX_LEN)

        row = {
            "id": url_to_id(entry_url),
            "title": truncate(title, 400),
            "summary": summary,
            "url": entry_url,
            "source_name": source["source_name"],
            "source_type": source.get("source_type", "unknown"),
            "published_at": pub_dt.isoformat(),
            "fetched_at": datetime.datetime.utcnow().isoformat(),
            "conflict_day": conflict_day(pub_dt),
            "region": source.get("region"),
            "country": source.get("country"),
            "lat": source.get("lat"),
            "lng": source.get("lng"),
            "sentiment": classify_sentiment(title, raw_summary),
            "tags": extract_tags(title, raw_summary),
        }
        if source.get("source_perspective") is not None:
            row["source_perspective"] = source["source_perspective"]
        articles.append(row)

    return articles


# ─────────────────────────────────────────────
# BATCH UPSERT
# ─────────────────────────────────────────────

def upsert_batch(articles: list[dict]) -> int:
    if not articles:
        return 0
    resp = requests.post(
        f"{SUPABASE_URL}/rest/v1/articles",
        headers={**HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal"},
        json=articles,
        timeout=30,
    )
    if resp.status_code not in (200, 201):
        print(f"  ⚠ Supabase upsert error {resp.status_code}: {resp.text[:200]}")
        return 0
    return len(articles)


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    now = datetime.datetime.utcnow()
    print(f"[collect_feeds] Start — {now.isoformat()}Z")
    print(f"[collect_feeds] {len(ALL_SOURCES)} sources registered")

    # Parallel fetch
    all_articles = []
    source_stats = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=MAX_WORKERS) as ex:
        futures = {ex.submit(fetch_source, src): src for src in ALL_SOURCES}
        for future in concurrent.futures.as_completed(futures):
            src = futures[future]
            try:
                arts = future.result()
                all_articles.extend(arts)
                if arts:
                    source_stats[src["source_name"]] = len(arts)
            except Exception as e:
                print(f"  ✗ {src['source_name']}: {e}")

    # Deduplicate by ID (same article from multiple sources)
    seen = set()
    unique_articles = []
    for a in all_articles:
        if a["id"] not in seen:
            seen.add(a["id"])
            unique_articles.append(a)

    print(f"[collect_feeds] {len(all_articles)} raw → {len(unique_articles)} unique articles")

    # Batch upsert to Supabase
    total_inserted = 0
    for i in range(0, len(unique_articles), BATCH_SIZE):
        batch = unique_articles[i:i + BATCH_SIZE]
        inserted = upsert_batch(batch)
        total_inserted += inserted

    # Print per-source summary
    print(f"\n[collect_feeds] ✓ {total_inserted} articles upserted to Supabase")
    print("\nPer-source breakdown:")
    for name, count in sorted(source_stats.items(), key=lambda x: -x[1]):
        print(f"  {count:3d}  {name}")

    elapsed = (datetime.datetime.utcnow() - now).total_seconds()
    print(f"\n[collect_feeds] Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
