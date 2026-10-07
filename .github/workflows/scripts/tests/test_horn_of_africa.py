"""Horn of Africa & Red Sea theatre (ruling 2026-10-07): registry, keyword scope and collector.

Run:  cd .github/workflows/scripts && python3 -m unittest discover -s tests -v
No network: feedparser.parse / requests.get are patched with inline feeds.
"""
import datetime
import io
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

reg = _load.load("sources_registry")
feeds = _load.load("collect_feeds")
_real_parse = feeds.feedparser.parse

HORN_SRC = {"url": "https://horn.example/rss", "source_name": "Horn Example", "source_type": "regional",
            "region": "Horn of Africa", "country": "Somalia", "lat": 2.0, "lng": 45.0}
OTHER_SRC = {"url": "https://other.example/rss", "source_name": "Other Example", "source_type": "regional",
             "region": "Global", "country": None, "lat": None, "lng": None}


class RegistryShape(unittest.TestCase):
    def test_group_is_registered_and_collected(self):
        self.assertIs(reg.FEED_GROUPS["horn"], reg.HORN_OF_AFRICA)
        urls = {s["url"] for s in reg.ALL_SOURCES}
        for s in reg.HORN_OF_AFRICA:
            self.assertIn(s["url"], urls)
        self.assertEqual(len({s["url"] for s in reg.HORN_OF_AFRICA}), len(reg.HORN_OF_AFRICA))

    def test_every_entry_has_the_fields_collect_feeds_reads(self):
        for s in reg.HORN_OF_AFRICA:
            for k in ("url", "source_name", "source_type", "region", "country", "lat", "lng"):
                self.assertIn(k, s, f"{s.get('source_name')} lacks {k}")
            self.assertTrue(s["url"].startswith("https://"), s["source_name"])
            self.assertIn(s["source_tier"], (1, 2, 3))
            self.assertIsInstance(s["party_source"], bool)
            self.assertTrue(s["bias_profile"], s["source_name"])
            self.assertIn(s["region"], ("Horn of Africa", "Africa"))

    def test_party_flags_follow_decision_002(self):
        party = {s["source_name"] for s in reg.HORN_OF_AFRICA if s["party_source"]}
        self.assertEqual(party, {"Fana Media Corporation (Ethiopia)", "SONNA (Somali National News Agency)"})
        for s in reg.HORN_OF_AFRICA:
            # party/state => Tier 3, and never the other way round
            self.assertEqual(s["party_source"], s["source_tier"] == 3, s["source_name"])

    def test_has_an_arabic_language_source(self):
        ar = [s for s in reg.HORN_OF_AFRICA if s["language"] == "ar"]
        self.assertTrue(ar)
        self.assertTrue(all(s.get("source_perspective") == "arabic" for s in ar))

    def test_horn_countries_use_names_the_ui_maps_to_codes(self):
        names = {s["country"] for s in reg.HORN_OF_AFRICA if s["country"]}
        self.assertTrue({"Ethiopia", "Eritrea", "Sudan", "Somalia", "Djibouti"} <= names)

    def test_keyword_lists(self):
        for kw in ("ethiopia", "tigray", "tplf", "abiy", "assab", "massawa", "djibouti", "somaliland",
                   "berbera", "al-shabaab", "port sudan", "rapid support forces", "horn of africa",
                   "red sea access", "إثيوبيا", "إريتريا", "تيغراي", "الصومال", "السودان", "جيبوتي"):
            self.assertIn(kw, reg.CONFLICT_KEYWORDS, kw)
        for kw in ("fano", "isaias", "afar", "rsf", "burhan", "عصب"):
            self.assertIn(kw, reg.HORN_AMBIGUOUS_KEYWORDS, kw)
            self.assertNotIn(kw, reg.CONFLICT_KEYWORDS, f"{kw} is ambiguous: it must not admit an item alone")
        self.assertIn("iran", reg.CONFLICT_KEYWORDS)  # legacy list untouched


class WholeWordMatching(unittest.TestCase):
    def rel(self, title, summary="", src=OTHER_SRC):
        return feeds.is_relevant(title, summary, src)

    def test_horn_terms_admit_an_item_anywhere(self):
        for t in ("Ethiopian forces advance in Tigray", "TPLF rejects Abiy's offer", "Assab port claim angers Asmara",
                  "Massawa shipping resumes", "Djibouti hosts naval talks", "Berbera deal and Somaliland recognition",
                  "Al-Shabaab claims Mogadishu attack", "RSF shells Port Sudan", "Rapid Support Forces take town",
                  "Horn of Africa leaders meet", "Red Sea access dispute escalates", "Eritreans flee border"):
            self.assertTrue(self.rel(t), t)

    def test_legacy_substring_behaviour_is_unchanged(self):
        # the legacy list keeps its plain-substring test (that is why 'idf' still hits 'midfielder')
        self.assertTrue(self.rel("Midfielder signs"))
        self.assertTrue(self.rel("Iranian drones hit tanker near Hormuz"))
        self.assertFalse(self.rel("Local council approves budget"))

    def test_horn_terms_are_whole_words(self):
        for t in ("Fanout cache design", "Afarensis fossil skull found", "Berberaa local fair",
                  "Sudanplus loyalty card", "Ethiopiaville zoning"):
            self.assertFalse(self.rel(t), t)

    def test_south_sudan_alone_does_not_match(self):
        self.assertFalse(self.rel("South Sudan elections: Kenya backs December vote"))
        self.assertFalse(self.rel("Juba says South Sudanese refugees return"))
        self.assertTrue(self.rel("Sudan and South Sudan agree oil transit"))
        self.assertTrue(self.rel("Sudanese army retakes town"))
        self.assertFalse(self.rel("جنوب السودان يعلن موعد الانتخابات"))
        self.assertTrue(self.rel("السودان وجنوب السودان يتفقان على النفط"))

    def test_wordpress_site_name_in_boilerplate_does_not_match(self):
        # Sudans Post is a South Sudan outlet: every summary ends "... appeared first on Sudans Post."
        summary = "The post Governor opens new school appeared first on Sudans Post."
        self.assertFalse(feeds.is_relevant("Governor opens new school", summary, HORN_SRC))

    def test_ambiguous_terms_need_a_horn_feed(self):
        for t, s in (("Fano fighters seize town", ""), ("Afar region clashes", ""), ("Isaias speaks", ""),
                     ("RSF drones hit El Fasher", ""), ("Burhan rejects talks", ""), ("Somali forces advance", "")):
            self.assertFalse(self.rel(t, s, OTHER_SRC), t)   # no geography established
            self.assertTrue(self.rel(t, s, HORN_SRC), t)     # Horn feed supplies it

    def test_ambiguous_words_are_still_whole_words_in_a_horn_feed(self):
        self.assertFalse(self.rel("Fanatic crowd at stadium", "", HORN_SRC))
        self.assertFalse(self.rel("Watched from afar", "", HORN_SRC))
        self.assertFalse(self.rel("Burhanuddin visits", "", HORN_SRC))

    def test_arabic_terms_with_proclitics(self):
        for t in ("اتفاق في السودان", "وفد للسودان", "زيارة إلى إثيوبيا", "وفي إثيوبيا", "بإثيوبيا وإريتريا",
                  "الجيش السوداني يتقدم", "قوات الدعم السريع تقصف", "أرض الصومال تعلن", "مقديشو تشهد هجوما",
                  "اجتماع في جيبوتي", "مقاتلو تيغراي"):
            self.assertTrue(self.rel(t), t)
        self.assertFalse(self.rel("مباراة كرة القدم الليلة"))

    def test_arabic_ambiguous_terms(self):
        self.assertFalse(self.rel("التهاب في العصب البصري", "", OTHER_SRC))  # "nerve" - medical
        self.assertTrue(self.rel("ميناء عصب", "", HORN_SRC))
        self.assertFalse(self.rel("البرهان العقلي", "", OTHER_SRC))


class Tags(unittest.TestCase):
    def test_horn_tags(self):
        t = feeds.extract_tags("Tigray war risks Eritrea clash as RSF advances in Sudan", "")
        self.assertTrue({"Ethiopia", "Eritrea", "Sudan"} <= set(t))
        self.assertIn("Somalia", feeds.extract_tags("Al-Shabaab attack in Mogadishu", ""))
        self.assertIn("Djibouti", feeds.extract_tags("Djibouti port deal", ""))

    def test_south_sudan_is_not_tagged_sudan(self):
        self.assertNotIn("Sudan", feeds.extract_tags("South Sudan budget passes", ""))

    def test_legacy_tags_unchanged(self):
        self.assertEqual(set(feeds.extract_tags("Iran fires missile at Israel", "")), {"Iran", "Israel", "Missile"})


def _rss(items):
    now = datetime.datetime.now(datetime.timezone.utc)
    body = "".join(
        f"<item><title>{t}</title><link>https://horn.example/{i}</link><description>{d}</description>"
        f"<pubDate>{(now - datetime.timedelta(hours=2)).strftime('%a, %d %b %Y %H:%M:%S +0000')}</pubDate></item>"
        for i, (t, d) in enumerate(items))
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{body}</channel></rss>'


class FetchSource(unittest.TestCase):
    def test_horn_feed_item_is_stored_with_horn_labels(self):
        xml = _rss([("Tigray drone strikes continue", "Mekelle"), ("Bakery opens", "bread")])
        with mock.patch.object(feeds.feedparser, "parse", side_effect=lambda _u: _real_parse(xml)):
            rows = feeds.fetch_source(dict(HORN_SRC))
        self.assertEqual([r["title"] for r in rows], ["Tigray drone strikes continue"])
        self.assertEqual((rows[0]["region"], rows[0]["country"]), ("Horn of Africa", "Somalia"))
        self.assertIn("Ethiopia", rows[0]["tags"])

    def test_requests_mode_uses_timeout_and_browser_user_agent(self):
        xml = _rss([("Tigray drone strikes continue", "x")])
        resp = mock.Mock(content=xml.encode(), status_code=200)
        resp.raise_for_status = lambda: None
        src = dict(HORN_SRC, fetch="requests")
        with mock.patch.object(feeds.requests, "get", return_value=resp) as g:
            rows = feeds.fetch_source(src)   # real feedparser parses the returned bytes
        self.assertEqual(len(rows), 1)
        _, kw = g.call_args
        self.assertEqual(kw["timeout"], feeds.FEED_TIMEOUT)
        self.assertIn("Mozilla", kw["headers"]["User-Agent"])

    def test_requests_mode_http_error_returns_empty_and_reports(self):
        resp = mock.Mock(status_code=403)
        resp.raise_for_status.side_effect = feeds.requests.HTTPError("403 Forbidden")
        stats = {}
        with mock.patch.object(feeds.requests, "get", return_value=resp):
            rows = feeds.fetch_source(dict(HORN_SRC, fetch="requests"), stats)
        self.assertEqual(rows, [])
        self.assertIn("403", stats["error"])

    def test_default_mode_is_untouched(self):
        # a source without "fetch" still goes through feedparser.parse(url) and never requests.get
        xml = _rss([("Iran strikes", "x")])
        with mock.patch.object(feeds.feedparser, "parse", side_effect=lambda _u: _real_parse(xml)) as fp, \
                mock.patch.object(feeds.requests, "get", side_effect=AssertionError("no requests.get")):
            rows = feeds.fetch_source(dict(OTHER_SRC))
        self.assertEqual(len(rows), 1)
        fp.assert_called_once_with(OTHER_SRC["url"])


class DryRun(unittest.TestCase):
    def test_dry_run_prints_counts_and_titles_and_writes_nothing(self):
        xml = _rss([("Tigray drone strikes continue", "a"), ("Eritrea mobilises", "b"), ("Ethiopia vows", "c"),
                    ("Sudan truce", "d")])
        srcs = [dict(HORN_SRC), dict(HORN_SRC, source_name="Broken", url="https://broken.example/rss")]

        def fake_parse(url):
            return _real_parse(xml) if "horn.example" in url else _real_parse("")

        buf = io.StringIO()
        with mock.patch.object(feeds.feedparser, "parse", side_effect=fake_parse), \
                mock.patch.object(feeds.requests, "post", side_effect=AssertionError("dry run wrote")), \
                mock.patch("sys.stdout", buf):
            code = feeds.run_dry(srcs)
        out = buf.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("entries seen   4 | kept   4", out)
        self.assertIn("Tigray drone strikes continue", out)
        self.assertIn("Broken", out)
        self.assertIn("no entries", out)

    def test_dry_run_fails_when_nothing_comes_back(self):
        with mock.patch.object(feeds.feedparser, "parse", side_effect=lambda _u: _real_parse("")), \
                mock.patch("sys.stdout", io.StringIO()):
            self.assertEqual(feeds.run_dry([dict(HORN_SRC)]), 1)

    def test_main_dry_run_group_uses_only_the_horn_group(self):
        seen = []
        with mock.patch.object(feeds, "run_dry", side_effect=lambda s: seen.append(s) or 0):
            self.assertEqual(feeds.main(["--group", "horn", "--dry-run"]), 0)
        self.assertEqual(seen, [reg.HORN_OF_AFRICA])


if __name__ == "__main__":
    unittest.main()
