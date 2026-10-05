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
import time
import requests
import feedparser
import concurrent.futures
from dateutil import parser as dateparser
from bs4 import BeautifulSoup

from sources_registry import ALL_SOURCES, CONFLICT_KEYWORDS, NITTER_INSTANCES, TELEGRAM_CHANNELS

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
MAX_ITEM_AGE = datetime.timedelta(days=7)  # older feed items are not news for an hourly collector

TG_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9,ar;q=0.8,ru;q=0.7",
}


# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────

def utc_now() -> datetime.datetime:
    """Current UTC time as a naive datetime (the convention used for every stored timestamp)."""
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)

def to_utc_naive(dt: datetime.datetime) -> datetime.datetime:
    """Convert an aware datetime to naive UTC. A naive datetime is taken to be UTC already.

    The old code did dt.replace(tzinfo=None), which kept the feed's LOCAL wall-clock
    time and relabelled it as UTC (NDTV +05:30 items landed on the next conflict day).
    """
    if dt.tzinfo is not None:
        dt = dt.astimezone(datetime.timezone.utc).replace(tzinfo=None)
    return dt

def entry_published_utc(entry) -> datetime.datetime | None:
    """Publish time of a feedparser entry in naive UTC, or None if it has no usable date.

    feedparser's *_parsed fields are already normalised to UTC. They are None for
    RFC-822 dates without a zone, so fall back to dateutil and treat naive as UTC.
    """
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        return datetime.datetime(*parsed[:6])
    pub_str = entry.get("published", "") or entry.get("updated", "")
    if not pub_str:
        return None
    try:
        return to_utc_naive(dateparser.parse(pub_str))
    except Exception:
        return None

def normalise_pub_dt(pub_dt: datetime.datetime | None,
                     now: datetime.datetime) -> datetime.datetime | None:
    """Return the UTC publish time to store, or None to drop the item.

    - no usable date        -> fetch time (a true upper bound; previous behaviour)
    - claims the future     -> clamped to fetch time (never stamp a later day)
    - older than 7 days     -> None (stale: Xinhua 2017, JPost 2025 were stamped Day 1)
    Rows are written with resolution=ignore-duplicates, so a wrong value is never
    corrected by a later run — it has to be right at write time.
    """
    if pub_dt is None:
        return now
    if pub_dt > now:
        return now
    if pub_dt < now - MAX_ITEM_AGE:
        return None
    return pub_dt

def conflict_day(dt=None):
    """Conflict day of a naive-UTC datetime: (UTC date - 2026-02-28).days + 1.

    Never later than today's UTC conflict day; None (never Day 1) before the conflict.
    """
    today = utc_now().date()
    d = dt.date() if dt else today
    n = (d - CONFLICT_START).days + 1
    if n < 1:
        return None
    return min(n, (today - CONFLICT_START).days + 1)

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

    now = utc_now()
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

        # Parse date in UTC; drop stale items, clamp future ones to fetch time
        pub_dt = normalise_pub_dt(entry_published_utc(entry), now)
        day = conflict_day(pub_dt) if pub_dt else None
        if day is None:
            continue

        summary = truncate(raw_summary, SUMMARY_MAX_LEN)

        row = {
            "id": url_to_id(entry_url),
            "title": truncate(title, 400),
            "summary": summary,
            "url": entry_url,
            "source_name": source["source_name"],
            "source_type": source.get("source_type", "unknown"),
            "published_at": pub_dt.isoformat(),
            "fetched_at": now.isoformat(),
            "conflict_day": day,
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
# TELEGRAM CHANNELS (t.me/s/{handle} scrape — no RSS)
# ─────────────────────────────────────────────

def scrape_telegram_channel(channel: dict, max_posts: int = 20) -> list[dict]:
    """
    Scrape recent posts from a public Telegram channel via t.me/s/{handle}.
    Returns list of raw post dicts (url, title, summary, published_at, ...).
    """
    handle = channel.get("handle", "")
    if handle == "PENDING_OMAR" or not channel.get("active", True):
        return []

    url = f"https://t.me/s/{handle}"
    posts = []

    try:
        resp = requests.get(url, headers=TG_HEADERS, timeout=15)
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")
        messages = soup.select(".tgme_widget_message")[-max_posts:]

        for msg in messages:
            text_el = msg.select_one(".tgme_widget_message_text")
            if not text_el:
                continue
            text = text_el.get_text(separator=" ", strip=True)
            if len(text) < 40:
                continue

            time_el = msg.select_one("time")
            if time_el and time_el.get("datetime"):
                try:
                    pub_dt = datetime.datetime.fromisoformat(
                        time_el["datetime"].replace("Z", "+00:00")
                    )
                    pub_dt = to_utc_naive(pub_dt)
                except Exception:
                    pub_dt = None
            else:
                pub_dt = None

            msg_url_el = msg.select_one(".tgme_widget_message_date")
            article_url = msg_url_el["href"] if msg_url_el and msg_url_el.get("href") else url

            posts.append({
                "url": article_url,
                "title": text[:200],
                "summary": text[:1000],
                "published_at": pub_dt,
                "source_name": channel["display_name"],
                "source_type": channel.get("source_type", "aggregator"),
                "source_perspective": channel.get("source_perspective"),
                "region": channel.get("region"),
                "country": channel.get("country"),
            })
    except requests.RequestException as e:
        print(f"  ⚠ Telegram scrape failed for @{handle}: {e}")

    return posts


def collect_telegram_sources(max_posts_per_channel: int = 15) -> list[dict]:
    """Collect from all active Telegram channels; return article rows for Supabase."""
    all_rows = []
    for ch in TELEGRAM_CHANNELS:
        if not ch.get("active", True) or ch.get("handle") == "PENDING_OMAR":
            continue
        print(f"  Fetching @{ch['handle']}...")
        posts = scrape_telegram_channel(ch, max_posts_per_channel)
        now = utc_now()
        for p in posts:
            pub_dt = normalise_pub_dt(p["published_at"], now)
            day = conflict_day(pub_dt) if pub_dt else None
            if day is None:
                continue
            title = p["title"]
            summary = p.get("summary") or ""
            row = {
                "id": url_to_id(p["url"]),
                "title": truncate(title, 400),
                "summary": truncate(summary, SUMMARY_MAX_LEN),
                "url": p["url"],
                "source_name": p["source_name"],
                "source_type": p["source_type"],
                "published_at": pub_dt.isoformat(),
                "fetched_at": now.isoformat(),
                "conflict_day": day,
                "region": p.get("region"),
                "country": p.get("country"),
                "lat": None,
                "lng": None,
                "sentiment": classify_sentiment(title, summary),
                "tags": extract_tags(title, summary),
            }
            if p.get("source_perspective") is not None:
                row["source_perspective"] = p["source_perspective"]
            all_rows.append(row)
        if posts:
            print(f"    → {len(posts)} posts")
        time.sleep(2)
    print(f"  Telegram: {len(all_rows)} posts collected")
    return all_rows


# ─────────────────────────────────────────────
# BATCH UPSERT
# ─────────────────────────────────────────────

def upsert_batch(articles: list[dict]) -> int:
    """Insert a batch, split by key signature.

    PostgREST rejects a bulk insert with PGRST102 ("All object keys must match")
    when objects in one array carry different keys. RSS and Telegram rows are
    built with different key sets, so mixed batches were rejected whole — the
    reason the articles table stayed at 0 rows while this job reported green.
    Grouping by signature (rather than padding with nulls) keeps column
    defaults such as fetched_at intact.
    """
    if not articles:
        return 0
    groups: dict[tuple, list[dict]] = {}
    for a in articles:
        groups.setdefault(tuple(sorted(a.keys())), []).append(a)
    written = 0
    for rows in groups.values():
        resp = requests.post(
            f"{SUPABASE_URL}/rest/v1/articles",
            headers={**HEADERS, "Prefer": "resolution=ignore-duplicates,return=minimal"},
            json=rows,
            timeout=30,
        )
        if resp.status_code not in (200, 201):
            print(f"  ⚠ Supabase upsert error {resp.status_code}: {resp.text[:200]}")
            continue
        written += len(rows)
    return written


# ─────────────────────────────────────────────
# MAIN
# ─────────────────────────────────────────────

def main():
    now = datetime.datetime.utcnow()
    print(f"[collect_feeds] Start — {now.isoformat()}Z")
    print(f"[collect_feeds] {len(ALL_SOURCES)} sources registered")

    # Parallel fetch (RSS + Nitter + Chinese RSS)
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

    # Telegram channels (t.me/s scrape)
    print("📱 Collecting Telegram sources...")
    telegram_articles = collect_telegram_sources(max_posts_per_channel=15)
    all_articles.extend(telegram_articles)
    for a in telegram_articles:
        source_stats[a["source_name"]] = source_stats.get(a["source_name"], 0) + 1
    print(f"  Total with Telegram: {len(all_articles)} articles")

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
    if unique_articles and total_inserted == 0:
        # Fail loudly: a green run that wrote nothing hid this bug for months.
        print("[collect_feeds] ✗ articles were collected but none were written")
        sys.exit(1)
    print("\nPer-source breakdown:")
    for name, count in sorted(source_stats.items(), key=lambda x: -x[1]):
        print(f"  {count:3d}  {name}")

    elapsed = (datetime.datetime.utcnow() - now).total_seconds()
    print(f"\n[collect_feeds] Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
