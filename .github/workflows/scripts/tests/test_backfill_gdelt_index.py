"""backfill_gdelt_index.py: rebuild the lost news-link index (Days 1-220) from GDELT GKG files.

Run:  cd .github/workflows/scripts && python3 -m unittest discover -s tests -v
No network: GDELT downloads are served from tests/fixtures/*.excerpt.tsv (real GKG 2.1 rows from
the 2026-03-15 00:00 and 12:00 UTC files; the columns the backfill never reads - Counts, V1 Themes,
V2Locations, Persons, Orgs, Dates, GCAM, images, quotations, names, amounts - are blanked and
<PAGE_LINKS> is stripped from Extras to keep the fixture small; every other byte is verbatim).
Supabase POSTs go to a fake urlopen.
"""
import datetime
import io
import json
import os
import random
import sys
import unittest
import urllib.error
import zipfile
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

bf = _load.load("backfill_gdelt_index")

FIX = os.path.join(os.path.dirname(os.path.abspath(__file__)), "fixtures")
START = datetime.date(2026, 2, 28)
TODAY = datetime.date(2026, 10, 6)  # Day 221


def day_of(d):
    return (d - START).days + 1


def fixture_lines(name):
    with open(os.path.join(FIX, name), encoding="utf-8") as f:
        return [l.rstrip("\n") for l in f if l.strip()]


def as_zip(lines, inner):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr(inner, "\n".join(lines) + "\n")
    return buf.getvalue()


EN_0000 = fixture_lines("20260315000000.gkg.excerpt.tsv")
EN_1200 = fixture_lines("20260315120000.gkg.excerpt.tsv")
TR_0000 = fixture_lines("20260315000000.translation.gkg.excerpt.tsv")

# Every column the live `articles` table has (information_schema, 2026-10-06).
LIVE_COLUMNS = {
    "id", "title", "summary", "url", "source_name", "source_logo_url", "source_type", "published_at",
    "fetched_at", "conflict_day", "region", "country", "lat", "lng", "sentiment", "confidence_score",
    "tags", "content_json", "created_at", "updated_at", "source_perspective", "is_retrospective",
    "rank_score",
}


def make_fetch(shuffle_seed=None, files=None):
    """Fake GDELT: serve fixture zips for the 2026-03-15 00:00 / 12:00 slots, 404 for the rest."""
    files = files if files is not None else {
        "20260315000000.gkg.csv.zip": ("20260315000000.gkg.csv", EN_0000),
        "20260315120000.gkg.csv.zip": ("20260315120000.gkg.csv", EN_1200),
        "20260315000000.translation.gkg.csv.zip": ("20260315000000.translation.gkg.csv", TR_0000),
    }
    calls = []

    def fetch(url):
        calls.append(url)
        name = url.rsplit("/", 1)[1]
        if name not in files:
            return None  # 404 / missing slot
        inner, lines = files[name]
        lines = list(lines)
        if shuffle_seed is not None:
            random.Random(shuffle_seed).shuffle(lines)
        return as_zip(lines, inner)

    fetch.calls = calls
    return fetch


def opts(**kw):
    base = dict(en_cap=500, nonen_cap=100, translation=True, lookahead_hours=6, workers=1,
                registry_unfiltered=False, today=TODAY)
    base.update(kw)
    return bf.Options(**base)


REGISTRY = bf.build_registry()


class IdParity(unittest.TestCase):
    def test_same_id_as_live_collector(self):
        feeds = _load.load("collect_feeds")
        urls = [l.split("\t")[4] for l in EN_0000[:40] + TR_0000[:20]]
        urls += ["https://www.reuters.com/world/middle-east/x-2026-03-15/?utm_source=rss",
                 "https://example.com/café"]
        for u in urls:
            self.assertEqual(bf.url_to_id(u), feeds.url_to_id(u), u)

    def test_selected_rows_carry_collector_id(self):
        feeds = _load.load("collect_feeds")
        res = bf.process_day(day_of(datetime.date(2026, 3, 15)), opts(), fetch=make_fetch())
        self.assertTrue(res.rows)
        for r in res.rows:
            self.assertEqual(r["id"], feeds.url_to_id(r["url"]))


class Parsing(unittest.TestCase):
    def test_parses_every_real_row(self):
        recs = [bf.parse_gkg_line(l, "en") for l in EN_0000]
        self.assertEqual(sum(1 for r in recs if r), len(EN_0000))
        r = recs[0]
        self.assertEqual(r.first_seen, datetime.datetime(2026, 3, 15, 0, 0, 0))
        self.assertTrue(r.url.startswith("http"))
        self.assertEqual(r.lang, "eng")

    def test_title_is_verbatim_page_title_unescaped(self):
        line = next(l for l in TR_0000 if "&#x" in l.split("\t")[26].split("<PAGE_TITLE>")[-1])
        raw = line.split("\t")[26].split("<PAGE_TITLE>")[1].split("</PAGE_TITLE>")[0]
        rec = bf.parse_gkg_line(line, "translation")
        import html
        self.assertEqual(rec.title, html.unescape(raw))
        self.assertNotEqual(rec.lang, "eng")

    def test_short_rows_rejected(self):
        self.assertIsNone(bf.parse_gkg_line("a\tb\tc", "en"))


class UtcDayMapping(unittest.TestCase):
    def rec(self, seen, pub):
        line = EN_0000[0].split("\t")
        line[1] = seen
        extras = line[26]
        import re
        extras = re.sub(r"<PAGE_PRECISEPUBTIMESTAMP>\d+</PAGE_PRECISEPUBTIMESTAMP>", "", extras)
        if pub:
            extras = f"<PAGE_PRECISEPUBTIMESTAMP>{pub}</PAGE_PRECISEPUBTIMESTAMP>" + extras
        line[26] = extras
        return bf.parse_gkg_line("\t".join(line), "en")

    def test_late_night_page_time_keeps_its_own_utc_day(self):
        # first seen 00:15 on Mar 15, published 23:59:59 UTC on Mar 14 -> Day 15, not Day 16
        r = self.rec("20260315001500", "20260314235959")
        dt, basis = bf.resolve_published(r)
        self.assertEqual(dt, datetime.datetime(2026, 3, 14, 23, 59, 59))
        self.assertEqual(basis, "page_pubtime")
        self.assertEqual(bf.conflict_day_of(dt, TODAY), 15)

    def test_midnight_boundary(self):
        r = self.rec("20260315001500", "20260315000000")
        dt, _ = bf.resolve_published(r)
        self.assertEqual(bf.conflict_day_of(dt, TODAY), 16)

    def test_no_page_time_uses_first_seen(self):
        r = self.rec("20260314234500", None)
        dt, basis = bf.resolve_published(r)
        self.assertEqual(dt, datetime.datetime(2026, 3, 14, 23, 45))
        self.assertEqual(basis, "gkg_first_seen")

    def test_page_time_after_first_seen_is_clamped(self):
        # local wall-clock mislabelled as UTC (seen in real translation rows): never later than first-seen
        r = self.rec("20260314231500", "20260315021500")
        dt, basis = bf.resolve_published(r)
        self.assertEqual(dt, datetime.datetime(2026, 3, 14, 23, 15))
        self.assertEqual(basis, "page_pubtime_clamped")
        self.assertEqual(bf.conflict_day_of(dt, TODAY), 15)

    def test_real_rows_published_late_mar14_go_to_day_15(self):
        n = 0
        for l in EN_0000:
            r = bf.parse_gkg_line(l, "en")
            dt, basis = bf.resolve_published(r)
            if basis == "page_pubtime" and dt.date() == datetime.date(2026, 3, 14):
                self.assertEqual(bf.conflict_day_of(dt, TODAY), 15)
                n += 1
        self.assertGreater(n, 10)


class NeverFutureNeverDayOne(unittest.TestCase):
    def test_future_day_rejected(self):
        self.assertIsNone(bf.conflict_day_of(datetime.datetime(2026, 10, 7, 1), TODAY))
        self.assertEqual(bf.conflict_day_of(datetime.datetime(2026, 10, 6, 1), TODAY), 221)

    def test_pre_conflict_is_none_not_day_one(self):
        self.assertIsNone(bf.conflict_day_of(datetime.datetime(2026, 2, 27, 23, 59), TODAY))
        self.assertEqual(bf.conflict_day_of(datetime.datetime(2026, 2, 28, 0, 0), TODAY), 1)

    def test_cli_refuses_today_and_future_days(self):
        with mock.patch.object(bf, "utc_today", return_value=TODAY):
            self.assertNotEqual(bf.main(["--start-day", "220", "--end-day", "221"]), 0)
            self.assertNotEqual(bf.main(["--start-day", "0", "--end-day", "3"]), 0)

    def test_no_row_on_a_future_or_other_day(self):
        d = day_of(datetime.date(2026, 3, 15))
        res = bf.process_day(d, opts(), fetch=make_fetch())
        for r in res.rows:
            self.assertEqual(r["conflict_day"], d)
            self.assertEqual(r["published_at"][:10], "2026-03-15")


class DayOwnership(unittest.TestCase):
    def test_rows_split_across_days_without_overlap(self):
        d15 = bf.process_day(15, opts(), fetch=make_fetch())  # reads Mar 15 00:00 as lookahead
        d16 = bf.process_day(16, opts(), fetch=make_fetch())
        ids15 = {r["id"] for r in d15.rows}
        ids16 = {r["id"] for r in d16.rows}
        self.assertTrue(ids15)
        self.assertTrue(ids16)
        self.assertFalse(ids15 & ids16)
        self.assertTrue(all(r["published_at"].startswith("2026-03-14") for r in d15.rows))

    def test_lookahead_only_reads_first_hours_of_next_day(self):
        f = make_fetch()
        bf.process_day(15, opts(lookahead_hours=6), fetch=f)
        names = {u.rsplit("/", 1)[1][:14] for u in f.calls}
        self.assertIn("20260314000000", names)
        self.assertIn("20260315054500", names)
        self.assertNotIn("20260315060000", names)
        self.assertEqual(len([n for n in f.calls if ".translation." not in n]), 96 + 24)


class CapsAndDeterminism(unittest.TestCase):
    def test_caps_respected(self):
        res = bf.process_day(16, opts(en_cap=10, nonen_cap=4), fetch=make_fetch())
        en = [r for r in res.rows if r["content_json"]["lang"] == "eng"]
        non = [r for r in res.rows if r["content_json"]["lang"] != "eng"]
        self.assertEqual(len(en), 10)
        self.assertLessEqual(len(non), 4)
        self.assertGreater(len(non), 0)

    def test_same_selection_whatever_the_file_order(self):
        a = bf.process_day(16, opts(en_cap=25, nonen_cap=7), fetch=make_fetch())
        b = bf.process_day(16, opts(en_cap=25, nonen_cap=7), fetch=make_fetch(shuffle_seed=7))
        c = bf.process_day(16, opts(en_cap=25, nonen_cap=7, workers=4), fetch=make_fetch(shuffle_seed=99))
        self.assertEqual([r["id"] for r in a.rows], [r["id"] for r in b.rows])
        self.assertEqual([r["id"] for r in a.rows], [r["id"] for r in c.rows])

    def test_one_row_per_normalised_title_outside_registry(self):
        res = bf.process_day(16, opts(), fetch=make_fetch())
        keys = [bf.normalise_title(r["title"]) for r in res.rows if not r["content_json"]["reg"]]
        self.assertEqual(len(keys), len(set(keys)))

    def test_without_translation_flag_no_translation_downloads(self):
        f = make_fetch()
        res = bf.process_day(16, opts(translation=False), fetch=f)
        self.assertFalse(any(".translation." in u for u in f.calls))
        self.assertTrue(all(r["content_json"]["lang"] == "eng" for r in res.rows))


class RegistryPriority(unittest.TestCase):
    def cand(self, domain, title, cluster_twins=0, minute=0):
        line = EN_1200[0].split("\t")
        line[3] = domain
        line[4] = f"https://{domain}/a/{abs(hash((domain, title))) % 10**8}"
        line[1] = f"20260315{12:02d}{minute:02d}00"
        import re
        line[26] = re.sub(r"<PAGE_TITLE>.*?</PAGE_TITLE>", f"<PAGE_TITLE>{title}</PAGE_TITLE>", line[26])
        line[26] = re.sub(r"<PAGE_PRECISEPUBTIMESTAMP>\d+</PAGE_PRECISEPUBTIMESTAMP>", "", line[26])
        return bf.parse_gkg_line("\t".join(line), "en")

    def test_registry_rows_first_even_against_big_clusters(self):
        cands = [self.cand("jpost.com", "Iran fires missiles at Haifa")]
        for i in range(30):
            cands.append(self.cand(f"outlet{i}.com", "Iran war widely syndicated wire story"))
        cands.append(self.cand("another.com", "Houthi drones over Red Sea"))
        sel = bf.select_for_day(cands, REGISTRY, cap=2)
        self.assertEqual(sel[0].rec.domain, "jpost.com")
        self.assertTrue(sel[0].registry)
        self.assertEqual(sel[1].cluster, 30)  # then the most widely carried title
        self.assertEqual(len(sel), 2)

    def test_registry_row_without_keyword_competes_on_cluster(self):
        cands = [self.cand("jpost.com", "Bank deposit grant scheme opens to savers")]
        for i in range(5):
            cands.append(self.cand(f"outlet{i}.com", "Iran war widely syndicated wire story"))
        self.assertEqual(bf.select_for_day(cands, REGISTRY, cap=1)[0].cluster, 5)
        strict = bf.select_for_day(cands, REGISTRY, cap=1, strict_registry=True)
        self.assertEqual(strict[0].rec.domain, "jpost.com")

    def test_other_outlets_keyword_titles_before_body_only_matches(self):
        cands = [self.cand(f"wire{i}.com", "Markets slip as tariffs bite") for i in range(10)]
        cands += [self.cand(f"paper{i}.com", "Iran says talks with US are paused") for i in range(2)]
        sel = bf.select_for_day(cands, REGISTRY, cap=2)
        self.assertEqual([s.cluster for s in sel], [2, 10])

    def test_registry_dedup_by_normalised_title(self):
        cands = [self.cand("jpost.com", "Iran strikes: live updates", minute=1),
                 self.cand("bbc.com", "IRAN STRIKES - live updates!", minute=2)]
        sel = bf.select_for_day(cands, REGISTRY, cap=10)
        self.assertEqual(len(sel), 1)
        self.assertEqual(sel[0].rec.domain, "jpost.com")  # earliest wins

    def test_real_registry_row_in_fixture_is_kept(self):
        res = bf.process_day(16, opts(en_cap=5), fetch=make_fetch())
        regs = [r for r in res.rows if r["content_json"]["reg"]]
        self.assertTrue(regs, "fixture contains in-scope jpost.com rows")
        self.assertTrue(res.rows[0]["content_json"]["reg"])
        jpost = [r for r in regs if r["source_name"] == "jpost.com"]
        self.assertTrue(jpost)
        # region/country/perspective follow the registry entry, as in collect_feeds
        self.assertEqual({(r["region"], r["country"]) for r in jpost}, {("Israel", "Israel")})
        others = [r for r in res.rows if not r["content_json"]["reg"]]
        self.assertTrue(all("source_perspective" not in r for r in others))


class Scope(unittest.TestCase):
    def test_word_boundaries(self):
        self.assertFalse(bf.keyword_hit("Brentford midfielder signs new deal"))
        self.assertTrue(bf.keyword_hit("Iranian drones hit tanker near Hormuz"))
        self.assertTrue(bf.keyword_hit("Israeli army says IDF struck Beirut"))

    def test_loose_keyword_needs_regional_location(self):
        line = EN_0000[0].split("\t")
        import re
        line[26] = re.sub(r"<PAGE_TITLE>.*?</PAGE_TITLE>", "<PAGE_TITLE>North Korea test-fires ballistic missile</PAGE_TITLE>", line[26])
        line[9] = "1#North Korea#KN#KN#40#127#KN"
        line[8] = ""
        self.assertFalse(bf.in_scope(bf.parse_gkg_line("\t".join(line), "en"), REGISTRY))
        line[9] = "1#Iran#IR#IR#32#53#IR"
        self.assertTrue(bf.in_scope(bf.parse_gkg_line("\t".join(line), "en"), REGISTRY))

    def test_registry_outlet_home_country_alone_is_not_enough(self):
        line = next(l for l in EN_1200 if "Hair Transplant" in l).split("\t")
        rec = bf.parse_gkg_line("\t".join(line), "en")
        self.assertEqual(rec.reg_key, "jpost.com")
        self.assertTrue(rec.fips & bf.REGIONAL_FIPS)  # mentions Turkey
        self.assertFalse(bf.in_scope(rec, REGISTRY))
        self.assertTrue(bf.in_scope(rec, REGISTRY, registry_unfiltered=True))


class RowShape(unittest.TestCase):
    def test_only_live_columns_and_fixed_values(self):
        res = bf.process_day(16, opts(), fetch=make_fetch())
        for r in res.rows:
            self.assertLessEqual(set(r), LIVE_COLUMNS)
            self.assertEqual(r["source_type"], "gdelt-gkg")
            self.assertIsNone(r["summary"])
            self.assertTrue(r["is_retrospective"])
            self.assertIn(r["content_json"]["time"], {"page_pubtime", "page_pubtime_clamped", "gkg_first_seen"})
            self.assertTrue(r["title"])
            self.assertTrue(r["source_name"])
            self.assertIsInstance(r["tags"], list)
            json.dumps(r)


class FakeResp:
    def __init__(self, status=201):
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False

    def read(self):
        return b""


class Pgrst102Grouping(unittest.TestCase):
    def test_groups_by_key_signature_and_batches_500(self):
        base = {"id": "x", "title": "t", "url": "u"}
        rows = [dict(base, id=str(i)) for i in range(1200)]
        rows += [dict(base, id=f"p{i}", source_perspective="western") for i in range(3)]
        sent = []

        def fake_urlopen(req, timeout=None):
            body = json.loads(req.data)
            sent.append((req.headers, body))
            return FakeResp()

        with mock.patch.object(bf.urllib.request, "urlopen", fake_urlopen):
            written, failed = bf.upsert_rows(rows, "https://supabase.test", "k")
        self.assertEqual((written, failed), (1203, 0))
        self.assertEqual(sorted(len(b) for _, b in sent), [3, 200, 500, 500])
        for headers, body in sent:
            self.assertEqual(len({tuple(sorted(r)) for r in body}), 1)
            prefer = {k.lower(): v for k, v in headers.items()}["prefer"]
            self.assertIn("resolution=ignore-duplicates", prefer)

    def test_failed_batch_counted(self):
        def boom(req, timeout=None):
            raise urllib.error.HTTPError(req.full_url, 400, "PGRST102", {}, io.BytesIO(b"{}"))

        with mock.patch.object(bf.urllib.request, "urlopen", boom), mock.patch.object(bf.time, "sleep"):
            written, failed = bf.upsert_rows([{"id": "1"}], "https://supabase.test", "k")
        self.assertEqual((written, failed), (0, 1))


class ShardExitCodes(unittest.TestCase):
    def run_main(self, argv, upsert_result):
        posted = []

        def fake_upsert(rows, url, key):
            posted.append(len(rows))
            return upsert_result(len(rows))

        env = {"SUPABASE_URL": "https://supabase.test", "SUPABASE_SERVICE_KEY": "k"}
        with mock.patch.object(bf, "utc_today", return_value=TODAY), \
                mock.patch.object(bf, "http_fetch", make_fetch()), \
                mock.patch.object(bf, "upsert_rows", fake_upsert), \
                mock.patch.dict(os.environ, env), \
                mock.patch("sys.stdout", new_callable=io.StringIO) as out:
            code = bf.main(argv)
        return code, posted, out.getvalue()

    def test_dry_run_writes_nothing_and_reports(self):
        code, posted, out = self.run_main(["--start-day", "16", "--end-day", "16"], lambda n: (n, 0))
        self.assertEqual(code, 0)
        self.assertEqual(posted, [])
        for k in ("files_read", "rows_scanned", "matched", "kept", "registry_share", "top_outlets"):
            self.assertIn(k, out)

    def test_parsed_files_but_nothing_written_fails(self):
        code, posted, _ = self.run_main(["--start-day", "16", "--end-day", "16", "--write"], lambda n: (0, 1))
        self.assertTrue(posted)
        self.assertNotEqual(code, 0)

    def test_write_success(self):
        code, posted, _ = self.run_main(["--start-day", "16", "--end-day", "16", "--write"], lambda n: (n, 0))
        self.assertEqual(code, 0)
        self.assertTrue(posted)

    def test_no_files_at_all_fails(self):
        with mock.patch.object(bf, "utc_today", return_value=TODAY), \
                mock.patch.object(bf, "http_fetch", make_fetch(files={})), \
                mock.patch("sys.stdout", new_callable=io.StringIO):
            self.assertNotEqual(bf.main(["--start-day", "16", "--end-day", "16"]), 0)


class ShardPlan(unittest.TestCase):
    def test_plan_covers_range_once(self):
        plan = bf.shard_plan(1, 220, 8)
        days = [d for s in plan for d in range(s["start"], s["end"] + 1)]
        self.assertEqual(days, list(range(1, 221)))
        self.assertTrue(all(s["end"] - s["start"] + 1 <= 8 for s in plan))


if __name__ == "__main__":
    unittest.main()
