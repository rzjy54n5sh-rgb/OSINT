"""collect_disinfo.py: verdicts only from the fact-checker's own ClaimReview rating,
spread_estimate never invented, off-topic items dropped, page fetches capped.

Run:  cd .github/workflows/scripts && python3 -m unittest discover -s tests -v
Against the original script:  COLLECTOR_SCRIPTS_DIR=/path/to/orig python3 -m unittest ...
No network: requests.get is replaced by a fake that serves inline RSS / HTML fixtures.
"""
import hashlib
import json
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

disinfo = _load.load("collect_disinfo")

FEED_URL = "https://factcheck.example/feed"
SUPABASE = os.environ["SUPABASE_URL"]
B = "https://factcheck.example/"


def rid(url):
    h = hashlib.md5(url.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def ld(obj):
    return f'<script type="application/ld+json">{json.dumps(obj)}</script>'


def claim_review_page(alternate=None, claim=None, numeric=None, graph=False):
    rating = {"@type": "Rating"}
    if alternate is not None:
        rating["alternateName"] = alternate
    if numeric:
        rating.update(numeric)
    cr = {"@context": "https://schema.org", "@type": "ClaimReview", "reviewRating": rating,
          "url": "x", "author": {"@type": "Organization", "name": "Example Fact Check"}}
    if claim:
        cr["claimReviewed"] = claim
    if graph:
        cr["@type"] = ["ClaimReview"]
        cr = {"@context": "https://schema.org", "@graph": [{"@type": "WebPage", "name": "p"}, cr]}
    return f"<html><head>{ld(cr)}</head><body>article</body></html>"


# (url, title, summary, page_html_or_None_for_fetch_error)
ITEMS = [
    (B + "not-true", "Did Iran release a list of US target cities?",
     "Social media posts claim Iran released a list of US target cities. That's not true.",
     claim_review_page("Not true", claim="Iran released a list of US cities it will target", graph=True)),
    (B + "pants", "Iran claim about a US strike on Tehran", "Pants on Fire!",
     claim_review_page("Pants on Fire!")),
    (B + "missing-context", "Video of Iran missile launch", "We rated this missing context.",
     claim_review_page("Missing context")),
    (B + "true", "Iran closed the Strait of Hormuz to tankers", "Our rating: accurate.",
     claim_review_page("True")),
    (B + "mostly-true", "Iran nuclear enrichment level claim", "Rating: mostly true.",
     claim_review_page("Mostly True")),
    (B + "unknown", "Iran drone strike video", "Confirmed by officials, the post says.",
     claim_review_page("Wibble-wobble rating")),
    (B + "no-claimreview", "Fake video claims Iran sank a US destroyer", "An explainer.",
     "<html><head>" + ld({"@context": "https://schema.org", "@type": "NewsArticle", "headline": "h"})
     + "</head><body>no rating here</body></html>"),
    (B + "numeric", "Claim about Iran ballistic missile range", "",
     claim_review_page(numeric={"ratingValue": "1", "bestRating": "5", "worstRating": "1"})),
    (B + "spanish", "No, este vídeo no muestra un ataque de Irán contra Israel", "Es de 2016.",
     claim_review_page("Falso")),
    (B + "unverified", "Iran claim about an unverified downing", "The claim remains unverified.",
     claim_review_page("Unverified")),
    (B + "fetch-fails", "Iran missile debris claim", "Images circulate online.", None),
    (B + "off-topic-award", "Fact-checking organizations awarded IFCN grants",
     "Grants awarded toward newsroom work.", claim_review_page("True")),
    (B + "off-topic-butler", "White House butler memo about cutlery theft is fake",
     "A fake memo.", claim_review_page("False")),
]

EXPECTED = {
    B + "not-true": "FALSE",
    B + "pants": "FALSE",
    B + "missing-context": "MISLEADING",
    B + "true": "TRUE",
    B + "mostly-true": "TRUE",          # table choice: "Mostly true" -> TRUE
    B + "unknown": "UNVERIFIED",
    B + "no-claimreview": "UNVERIFIED",
    B + "numeric": "FALSE",
    B + "spanish": "FALSE",
    B + "unverified": "UNVERIFIED",
    B + "fetch-fails": "UNVERIFIED",
}


def rss(items):
    body = "".join(f"<item><title>{t}</title><link>{u}</link><description>{s}</description>"
                   f"<pubDate>Mon, 05 Oct 2026 10:00:00 +0000</pubDate></item>" for u, t, s, _ in items)
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>f</title>{body}</channel></rss>'


class _Resp:
    def __init__(self, status=200, text="", content=None, payload=None):
        self.status_code, self.text = status, text
        self.content = content if content is not None else text.encode()
        self._payload = payload

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise disinfo.requests.HTTPError(f"HTTP {self.status_code}")


class FakeNet:
    def __init__(self, items, stored=()):
        self.feed = rss(items)
        self.pages = {u: html for u, _, _, html in items}
        self.stored = list(stored)
        self.calls = []          # (url, kwargs)

    def get(self, url, **kw):
        self.calls.append((url, kw))
        if url == FEED_URL:
            return _Resp(text=self.feed)
        if url.startswith(SUPABASE):
            return _Resp(payload=self.stored)
        html = self.pages.get(url)
        if html is None:
            raise disinfo.requests.ConnectionError("simulated fetch failure")
        return _Resp(text=html)

    def page_calls(self):
        return [u for u, _ in self.calls if u != FEED_URL and not u.startswith(SUPABASE)]


def run(items, stored=(), cap=None):
    net = FakeNet(items, stored)
    patches = [mock.patch.object(disinfo, "FACT_CHECK_FEEDS", [{"url": FEED_URL, "source": "Example"}]),
               mock.patch.object(disinfo.requests, "get", side_effect=net.get)]
    if cap is not None:
        patches.append(mock.patch.object(disinfo, "MAX_PAGE_FETCHES", cap, create=True))
    for p in patches:
        p.start()
    try:
        records = disinfo.fetch_disinfo()
    finally:
        for p in reversed(patches):
            p.stop()
    return {r["source_url"]: r for r in records}, net


class DisinfoVerdictTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.records, cls.net = run(ITEMS)

    def test_verdicts_come_from_claimreview_rating(self):
        for url, expected in EXPECTED.items():
            with self.subTest(url=url.rsplit("/", 1)[-1]):
                self.assertIn(url, self.records)
                self.assertEqual(self.records[url]["verdict"], expected)

    def test_only_allowed_verdict_values(self):
        for r in self.records.values():
            self.assertIn(r["verdict"], ("FALSE", "MISLEADING", "TRUE", "UNVERIFIED"))

    def test_spread_estimate_is_never_invented(self):
        self.assertTrue(self.records)
        for url, r in self.records.items():
            with self.subTest(url=url.rsplit("/", 1)[-1]):
                self.assertIsNone(r["spread_estimate"])

    def test_off_topic_items_are_filtered(self):
        self.assertNotIn(B + "off-topic-award", self.records)    # old list: "war" matched "awarded"
        self.assertNotIn(B + "off-topic-butler", self.records)

    def test_claim_text_is_claim_reviewed_when_present(self):
        self.assertEqual(self.records[B + "not-true"]["claim_text"],
                         "Iran released a list of US cities it will target")
        self.assertEqual(self.records[B + "pants"]["claim_text"], "Iran claim about a US strike on Tehran")

    def test_every_fetch_has_timeout_and_user_agent(self):
        for url, kw in self.net.calls:
            if url.startswith(SUPABASE):
                continue
            with self.subTest(url=url):
                self.assertEqual(kw.get("timeout"), 15)
                self.assertEqual(kw.get("headers", {}).get("User-Agent"),
                                 "Mozilla/5.0 (MENA-Intel-Desk collector)")

    def test_relevant_pages_are_fetched(self):
        self.assertEqual(sorted(self.net.page_calls()), sorted(EXPECTED))


class DisinfoCapAndSkipTests(unittest.TestCase):
    def test_page_fetches_are_capped(self):
        items = [(B + f"cap-{i}", f"Iran claim number {i}", "", claim_review_page("False")) for i in range(3)]
        records, net = run(items, cap=2)
        self.assertEqual(len(net.page_calls()), 2)
        self.assertEqual(len(records), 2)       # the third waits for the next run, no verdict asserted

    def test_already_rated_rows_are_not_refetched(self):
        items = [(B + "rated", "Iran claim already rated", "", claim_review_page("False")),
                 (B + "unrated", "Iran claim still unrated", "", claim_review_page("False"))]
        stored = [{"id": rid(B + "rated"), "verdict": "FALSE"},
                  {"id": rid(B + "unrated"), "verdict": "UNVERIFIED"}]
        records, net = run(items, stored=stored)
        self.assertEqual(net.page_calls(), [B + "unrated"])
        self.assertEqual(set(records), {B + "unrated"})
        self.assertEqual(records[B + "unrated"]["verdict"], "FALSE")


class RatingTableTests(unittest.TestCase):
    CASES = {
        "Not true": "FALSE", "NOT TRUE.": "FALSE", "untrue": "FALSE", "False": "FALSE",
        "Pants on Fire": "FALSE", "pants-on-fire": "FALSE", "Inaccurate": "FALSE", "Fake": "FALSE",
        "Misleading": "MISLEADING", "Missing Context": "MISLEADING", "Partly false": "MISLEADING",
        "Half True": "MISLEADING", "Mostly False": "MISLEADING", "Engañoso": "MISLEADING",
        "True": "TRUE", "Mostly true": "TRUE", "Correct": "TRUE",
        "Unproven": "UNVERIFIED", "Unverified": "UNVERIFIED", "Unconfirmed": "UNVERIFIED",
        "The video was filmed in 2019, not this week": None, "": None,
    }

    def test_rating_text_table(self):
        for text, expected in self.CASES.items():
            with self.subTest(text=text):
                self.assertEqual(disinfo.verdict_from_rating_text(text), expected)

    def test_numeric_rating_relative_to_scale(self):
        cases = [({"ratingValue": 1, "bestRating": 5, "worstRating": 1}, "FALSE"),
                 ({"ratingValue": 3, "bestRating": 5, "worstRating": 1}, "MISLEADING"),
                 ({"ratingValue": 5, "bestRating": 5, "worstRating": 1}, "TRUE"),
                 ({"ratingValue": -1, "bestRating": 5, "worstRating": 1}, "UNVERIFIED"),
                 ({"ratingValue": 1}, "UNVERIFIED")]
        for rating, expected in cases:
            with self.subTest(rating=rating):
                self.assertEqual(disinfo.verdict_from_review_rating(rating), expected)


if __name__ == "__main__":
    unittest.main()
