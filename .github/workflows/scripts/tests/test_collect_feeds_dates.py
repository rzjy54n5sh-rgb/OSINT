"""collect_feeds.py: timestamps must be UTC, never in the future, never clamped to Day 1.

Run:  cd .github/workflows/scripts && python3 -m unittest discover -s tests -v
Against the original script:  COLLECTOR_SCRIPTS_DIR=/path/to/orig python3 -m unittest ...
No network: feedparser.parse and requests.get are patched with inline fixtures.
"""
import datetime
import hashlib
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

feeds = _load.load("collect_feeds")
_real_parse = feeds.feedparser.parse

START = datetime.date(2026, 2, 28)
UTC = datetime.timezone.utc


def day_of(d: datetime.date) -> int:
    return (d - START).days + 1


def now_utc() -> datetime.datetime:
    return datetime.datetime.now(UTC).replace(tzinfo=None)


def rfc822(dt: datetime.datetime, offset: str) -> str:
    return dt.strftime("%a, %d %b %Y %H:%M:%S") + (f" {offset}" if offset else "")


def rss(items) -> str:
    body = "".join(
        f"<item><title>{t}</title><link>{u}</link><description>Iran news item</description>"
        f"<pubDate>{p}</pubDate></item>" for t, u, p in items)
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{body}</channel></rss>'


SOURCE = {"url": "https://news.example/rss", "source_name": "Example News", "source_type": "news",
          "region": "South Asia", "country": "India", "lat": 1.0, "lng": 2.0}


def run_feed(items):
    xml = rss(items)
    with mock.patch.object(feeds.feedparser, "parse", side_effect=lambda _url: _real_parse(xml)):
        rows = feeds.fetch_source(dict(SOURCE))
    return {r["url"]: r for r in rows}


class FeedTimestampTests(unittest.TestCase):
    def setUp(self):
        self.now = now_utc()
        self.today_day = day_of(self.now.date())
        self.D = (self.now - datetime.timedelta(days=2)).date()   # a day safely inside the 7-day window

    def test_plus0530_late_evening_is_stored_as_utc(self):
        # Task case: 23:30 local (+05:30) on day D == 18:00 UTC on day D.
        local = datetime.datetime.combine(self.D, datetime.time(23, 30))
        rows = run_feed([("Iran item ist late", "https://news.example/a", rfc822(local, "+0530"))])
        row = rows["https://news.example/a"]
        self.assertEqual(row["published_at"], datetime.datetime.combine(self.D, datetime.time(18, 0)).isoformat())
        self.assertEqual(row["conflict_day"], day_of(self.D))

    def test_plus0530_after_midnight_gets_previous_utc_day(self):
        # 02:00 local (+05:30) on day D == 20:30 UTC on D-1 -> conflict day of D-1, not D.
        local = datetime.datetime.combine(self.D, datetime.time(2, 0))
        rows = run_feed([("Iran item ist early", "https://news.example/b", rfc822(local, "+0530"))])
        row = rows["https://news.example/b"]
        prev = self.D - datetime.timedelta(days=1)
        self.assertEqual(row["published_at"], datetime.datetime.combine(prev, datetime.time(20, 30)).isoformat())
        self.assertEqual(row["conflict_day"], day_of(prev))

    def test_future_dated_item_never_exceeds_today(self):
        future = self.now + datetime.timedelta(days=2)
        rows = run_feed([("Iran item future", "https://news.example/c", rfc822(future, "+0000"))])
        row = rows["https://news.example/c"]
        self.assertLessEqual(row["conflict_day"], self.today_day)
        self.assertLessEqual(row["published_at"], row["fetched_at"])

    def test_2017_item_is_dropped_not_day_1(self):
        old = datetime.datetime(2017, 10, 13, 8, 0)
        rows = run_feed([("Iran item 2017", "https://news.example/d", rfc822(old, "+0800"))])
        self.assertNotIn("https://news.example/d", rows)
        self.assertFalse(any(r["conflict_day"] == 1 for r in rows.values()))

    def test_item_older_than_7_days_is_dropped(self):
        stale = self.now - datetime.timedelta(days=10)
        rows = run_feed([("Iran item stale", "https://news.example/e", rfc822(stale, "+0000"))])
        self.assertNotIn("https://news.example/e", rows)

    def test_naive_timestamp_is_treated_as_utc(self):
        naive = datetime.datetime.combine(self.D, datetime.time(10, 0))
        rows = run_feed([("Iran item naive", "https://news.example/f", rfc822(naive, ""))])
        row = rows["https://news.example/f"]
        self.assertEqual(row["published_at"], naive.isoformat())
        self.assertEqual(row["conflict_day"], day_of(self.D))

    def test_row_keys_and_id_unchanged(self):
        # Regression guard: dedup depends on the id derivation and the key set per source type.
        ts = datetime.datetime.combine(self.D, datetime.time(12, 0))
        url = "https://news.example/g"
        row = run_feed([("Iran item keys", url, rfc822(ts, "+0000"))])[url]
        h = hashlib.md5(url.encode()).hexdigest()
        self.assertEqual(row["id"], f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}")
        self.assertEqual(set(row), {"id", "title", "summary", "url", "source_name", "source_type",
                                    "published_at", "fetched_at", "conflict_day", "region", "country",
                                    "lat", "lng", "sentiment", "tags"})


class _Resp:
    def __init__(self, text):
        self.text = text
        self.status_code = 200

    def raise_for_status(self):
        pass


class TelegramTimestampTests(unittest.TestCase):
    def _run(self, msgs):
        html = "".join(
            f'<div class="tgme_widget_message"><div class="tgme_widget_message_text">{text}</div>'
            f'<a class="tgme_widget_message_date" href="{href}"><time datetime="{dt}"></time></a></div>'
            for text, href, dt in msgs)
        chan = {"handle": "testchan", "display_name": "Test Channel", "active": True,
                "source_type": "aggregator", "region": "Middle East", "country": "Iran"}
        with mock.patch.object(feeds, "TELEGRAM_CHANNELS", [chan]), \
             mock.patch.object(feeds.time, "sleep"), \
             mock.patch.object(feeds.requests, "get", return_value=_Resp(html)):
            rows = feeds.collect_telegram_sources(max_posts_per_channel=15)
        return {r["url"]: r for r in rows}

    def test_plus0300_post_is_converted_to_utc(self):
        D = (now_utc() - datetime.timedelta(days=2)).date()
        text = "Statement on the Iran situation from the channel, long enough to keep."
        rows = self._run([(text, "https://t.me/testchan/1", f"{D.isoformat()}T02:00:00+03:00")])
        row = rows["https://t.me/testchan/1"]
        prev = D - datetime.timedelta(days=1)
        self.assertEqual(row["published_at"], datetime.datetime.combine(prev, datetime.time(23, 0)).isoformat())
        self.assertEqual(row["conflict_day"], day_of(prev))

    def test_old_post_is_dropped_not_day_1(self):
        text = "Archived Iran post from long before the conflict, long enough to keep."
        rows = self._run([(text, "https://t.me/testchan/2", "2025-06-07T09:00:00+00:00")])
        self.assertNotIn("https://t.me/testchan/2", rows)


if __name__ == "__main__":
    unittest.main()
