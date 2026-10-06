"""backfill_market_closes.py: deterministic daily-close backfill for market_data.

Run:  cd .github/workflows/scripts && python3 -m unittest discover -s tests -v
No network: requests.get / requests.post are replaced by fakes serving inline fixtures.
"""
import datetime as dt
import os
import sys
import unittest
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

bf = _load.load("backfill_market_closes")

D = dt.date
TODAY = D(2026, 10, 6)  # conflict Day 221


class FakeResp:
    def __init__(self, status=200, payload=None, text=""):
        self.status_code = status
        self._payload = payload
        self.text = text

    def json(self):
        return self._payload

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError(f"HTTP {self.status_code}")


def yahoo_payload(rows, gmtoffset=-14400):
    """rows: list of (date, close). Timestamp = local midnight-ish UTC epoch."""
    ts = [int(dt.datetime(d.year, d.month, d.day, 14, 30, tzinfo=dt.timezone.utc).timestamp()) for d, _ in rows]
    return {"chart": {"result": [{"meta": {"gmtoffset": gmtoffset},
                                  "timestamp": ts,
                                  "indicators": {"quote": [{"close": [c for _, c in rows]}]}}]}}


class DayDateMapping(unittest.TestCase):
    def test_day1_is_2026_02_28_saturday(self):
        self.assertEqual(bf.day_to_date(1), D(2026, 2, 28))
        self.assertEqual(bf.day_to_date(1).weekday(), 5)

    def test_today_is_day_221(self):
        self.assertEqual(bf.date_to_day(TODAY), 221)
        self.assertEqual(bf.day_to_date(221), TODAY)
        self.assertEqual(bf.day_to_date(220), D(2026, 10, 5))

    def test_round_trip(self):
        for d in (1, 2, 31, 100, 220):
            self.assertEqual(bf.date_to_day(bf.day_to_date(d)), d)


class FawazD1Rule(unittest.TestCase):
    def test_snapshot_date_is_next_day(self):
        self.assertEqual(bf.fawaz_snapshot_date(1), D(2026, 3, 1))
        self.assertEqual(bf.fawaz_snapshot_date(220), D(2026, 10, 6))

    def test_value_for_day_d_comes_from_snapshot_d_plus_1(self):
        # snapshots keyed by snapshot date; each value encodes its own date for easy checking
        snaps = {bf.fawaz_snapshot_date(d): 3.0 + d / 1000 for d in range(0, 8)}
        rows = bf.build_fx_rows("USD/SAR", snaps, 5, 6, TODAY)
        by_day = {r["conflict_day"]: r for r in rows}
        self.assertEqual(sorted(by_day), [5, 6])
        self.assertAlmostEqual(by_day[5]["value"], 3.005)   # snaps are keyed by date(day)+1, so day 5 reads the snapshot dated date(5)+1
        self.assertAlmostEqual(by_day[6]["value"], 3.006)
        # change_pct of day 5 is vs day 4's value (snapshot dated day 4 + 1)
        self.assertAlmostEqual(by_day[5]["change_pct"], round((3.005 / 3.004 - 1) * 100, 2))
        self.assertEqual(by_day[5]["unit"], "rate")
        self.assertIn("reconstructed backfill", by_day[5]["source"])
        self.assertIn("daily close", by_day[5]["source"])

    def test_fx_writes_every_calendar_day_no_weekend_skip(self):
        snaps = {bf.fawaz_snapshot_date(d): 3.75 for d in range(0, 11)}
        rows = bf.build_fx_rows("USD/SAR", snaps, 1, 10, TODAY)
        self.assertEqual([r["conflict_day"] for r in rows], list(range(1, 11)))

    def test_missing_snapshot_is_a_gap_not_a_forward_fill(self):
        snaps = {bf.fawaz_snapshot_date(d): 3.75 for d in range(0, 6) if d != 3}
        rows = bf.build_fx_rows("USD/SAR", snaps, 1, 5, TODAY)
        self.assertEqual([r["conflict_day"] for r in rows], [1, 2, 4, 5])
        # day 4's change_pct has no previous (day 3 missing) -> compared to last real value (day 2)
        self.assertEqual(rows[2]["change_pct"], 0.0)


class ChangePct(unittest.TestCase):
    def test_basic(self):
        self.assertEqual(bf.change_pct(110.0, 100.0), 10.0)
        self.assertEqual(bf.change_pct(95.0, 100.0), -5.0)

    def test_rounding_matches_collector_two_decimals(self):
        self.assertEqual(bf.change_pct(100.456, 100.0), 0.46)

    def test_no_previous(self):
        self.assertEqual(bf.change_pct(100.0, None), 0.0)
        self.assertEqual(bf.change_pct(100.0, 0), 0.0)

    def test_exchange_rows_compare_to_previous_trading_close(self):
        # Fri Feb 27 close is the lead-in; Day 1 (Sat) and Day 2 (Sun) have no bar;
        # Mon Mar 2 (Day 3) change is vs Fri; Tue Mar 3 (Day 4) vs Mon.
        series = {D(2026, 2, 26): 70.0, D(2026, 2, 27): 72.0, D(2026, 3, 2): 79.2, D(2026, 3, 3): 75.24}
        rows = bf.build_exchange_rows("Brent Crude Oil", series, 1, 10, TODAY)
        self.assertEqual([r["conflict_day"] for r in rows], [3, 4])  # trading days only, no weekend fill
        self.assertEqual(rows[0]["change_pct"], 10.0)
        self.assertEqual(rows[1]["change_pct"], -5.0)
        self.assertEqual(rows[0]["unit"], "USD/bbl")
        self.assertEqual(rows[0]["indicator"], "Brent Crude Oil")
        self.assertIn("daily close", rows[0]["source"])
        self.assertIn("reconstructed backfill", rows[0]["source"])
        self.assertIn("BZ=F", rows[0]["source"])
        self.assertNotIn("created_at", rows[0])  # DB default now()

    def test_parse_yahoo_skips_null_closes_and_uses_exchange_local_date(self):
        payload = yahoo_payload([(D(2026, 3, 2), 1.0), (D(2026, 3, 3), None), (D(2026, 3, 4), 3.0)])
        got = bf.parse_yahoo_chart(payload)
        self.assertEqual(got, {D(2026, 3, 2): 1.0, D(2026, 3, 4): 3.0})


class NeverWriteTodayOrLater(unittest.TestCase):
    def test_last_writable_day(self):
        self.assertEqual(bf.last_writable_day(TODAY), 220)

    def test_clamp(self):
        self.assertEqual(bf.clamp_days(1, 9999, TODAY), (1, 220))
        self.assertEqual(bf.clamp_days(0, 5, TODAY), (1, 5))
        self.assertEqual(bf.clamp_days(221, 300, TODAY), (221, 220))  # empty range -> start > end

    def test_exchange_rows_exclude_today_partial_bar(self):
        series = {D(2026, 10, 2): 100.0, D(2026, 10, 5): 101.0, D(2026, 10, 6): 55.5}
        rows = bf.build_exchange_rows("Gold", series, 200, 999, TODAY)
        self.assertEqual([r["conflict_day"] for r in rows], [217, 220])  # Oct 2, Oct 5; Oct 6 (Day 221) dropped
        self.assertTrue(all(r["conflict_day"] < 221 for r in rows))

    def test_fx_rows_exclude_today(self):
        snaps = {bf.fawaz_snapshot_date(d): 3.75 for d in range(210, 230)}
        rows = bf.build_fx_rows("USD/AED", snaps, 210, 999, TODAY)
        self.assertEqual(max(r["conflict_day"] for r in rows), 220)


class Idempotency(unittest.TestCase):
    def test_filter_new_skips_existing_daily_close_keys(self):
        rows = [{"indicator": "Gold", "conflict_day": 3}, {"indicator": "Gold", "conflict_day": 4},
                {"indicator": "Dow Jones", "conflict_day": 3}]
        existing = {("Gold", 3)}
        new, skipped = bf.filter_new(rows, existing)
        self.assertEqual([(r["indicator"], r["conflict_day"]) for r in new], [("Gold", 4), ("Dow Jones", 3)])
        self.assertEqual(skipped, 1)

    def test_fetch_existing_filters_on_daily_close_and_paginates(self):
        calls = []

        def fake_get(url, headers=None, params=None, timeout=None):
            calls.append((url, dict(params or {})))
            off = int((params or {}).get("offset", 0))
            page = {0: [{"indicator": "Gold", "conflict_day": 3}, {"indicator": "Gold", "conflict_day": 4}],
                    2: [{"indicator": "Dow Jones", "conflict_day": 3}],
                    3: []}[off]
            return FakeResp(200, page)

        with mock.patch.object(bf.requests, "get", fake_get):
            keys = bf.fetch_existing_keys("https://sb.test", {"apikey": "k"}, 1, 220, page_size=2)
        self.assertEqual(keys, {("Gold", 3), ("Gold", 4), ("Dow Jones", 3)})
        self.assertTrue(all(u == "https://sb.test/rest/v1/market_data" for u, _ in calls))
        p = calls[0][1]
        self.assertEqual(p["source"], "ilike.*daily close*")
        self.assertIn("gte.1", p["and"] if "and" in p else str(p))

    def test_fetch_existing_raises_on_http_error(self):
        with mock.patch.object(bf.requests, "get", lambda *a, **k: FakeResp(500, None)):
            with self.assertRaises(Exception):
                bf.fetch_existing_keys("https://sb.test", {}, 1, 220)


class Batching(unittest.TestCase):
    def test_groups_by_key_signature(self):
        a = {"indicator": "Gold", "value": 1.0, "conflict_day": 3}
        b = {"indicator": "Gold", "value": 2.0, "conflict_day": 4}
        c = {"indicator": "Gold", "value": 2.0, "conflict_day": 5, "extra": "x"}
        groups = bf.group_by_signature([a, c, b])
        self.assertEqual(len(groups), 2)
        for g in groups:
            self.assertEqual(len({frozenset(r) for r in g}), 1)  # never mix key sets in one array
        self.assertEqual(sorted(len(g) for g in groups), [1, 2])

    def test_write_rows_posts_one_homogeneous_array_per_signature_and_chunks(self):
        posts = []

        def fake_post(url, headers=None, json=None, timeout=None):
            posts.append(json)
            return FakeResp(201, None)

        rows = [{"indicator": "G", "value": float(i), "conflict_day": i} for i in range(5)]
        rows.append({"indicator": "G", "value": 9.0, "conflict_day": 9, "extra": 1})
        with mock.patch.object(bf.requests, "post", fake_post):
            n = bf.write_rows("https://sb.test", {}, rows, batch_size=2)
        self.assertEqual(n, 6)
        self.assertEqual(len(posts), 4)  # 3 chunks (2,2,1) of base signature + 1 of extra signature
        for body in posts:
            self.assertEqual(len({frozenset(r) for r in body}), 1)
            self.assertLessEqual(len(body), 2)

    def test_write_rows_failure_counts_zero_for_that_batch(self):
        with mock.patch.object(bf.requests, "post", lambda *a, **k: FakeResp(400, None, "PGRST102")):
            n = bf.write_rows("https://sb.test", {}, [{"indicator": "G", "value": 1.0, "conflict_day": 1}])
        self.assertEqual(n, 0)


class EndToEnd(unittest.TestCase):
    """run() with every HTTP call mocked."""

    def setUp(self):
        self.posts, self.gets = [], []
        # 12 trading days of data for every Yahoo symbol: Fri Oct 2 and Mon Oct 5 plus today's partial bar
        self.series = [(D(2026, 2, 26), 70.0), (D(2026, 2, 27), 72.0), (D(2026, 3, 2), 79.2),
                       (D(2026, 3, 3), 75.24), (D(2026, 10, 5), 100.0), (D(2026, 10, 6), 1.0)]
        env = {"SUPABASE_URL": "https://sb.test", "SUPABASE_SERVICE_KEY": "k"}
        self.patches = [mock.patch.dict(os.environ, env), mock.patch.object(bf, "today_utc", lambda: TODAY),
                        mock.patch.object(bf.time, "sleep", lambda s: None),
                        mock.patch.object(bf.requests, "get", self.fake_get),
                        mock.patch.object(bf.requests, "post", self.fake_post)]
        for p in self.patches:
            p.start()
        self.existing = []

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def fake_get(self, url, headers=None, params=None, timeout=None):
        self.gets.append(url)
        if "query1.finance.yahoo.com" in url:
            if "User-Agent" not in (headers or {}):
                return FakeResp(429)
            return FakeResp(200, yahoo_payload(self.series))
        if "currency-api" in url:
            return FakeResp(200, {"date": "x", "usd": {"sar": 3.75, "aed": 3.6725, "iqd": 1310.0}})
        if "fred.stlouisfed.org" in url:
            return FakeResp(200, text="observation_date,SP500\n2026-03-02,79.2\n2026-03-03,75.24\n2026-10-05,100.0\n")
        if "/rest/v1/market_data" in url:
            off = int((params or {}).get("offset", 0))
            return FakeResp(200, self.existing if off == 0 else [])
        raise AssertionError(url)

    def fake_post(self, url, headers=None, json=None, timeout=None):
        self.posts.append(json)
        return FakeResp(201)

    def args(self, **kw):
        base = dict(start_day=1, end_day=999, dry_run=False)
        base.update(kw)
        return mock.Mock(**base)

    def test_dry_run_writes_nothing_and_returns_zero(self):
        rc = bf.run(self.args(dry_run=True))
        self.assertEqual(rc, 0)
        self.assertEqual(self.posts, [])

    def test_real_run_writes_rows_never_day_221_and_no_irr_egp(self):
        rc = bf.run(self.args())
        self.assertEqual(rc, 0)
        rows = [r for body in self.posts for r in body]
        self.assertTrue(rows)
        self.assertLess(max(r["conflict_day"] for r in rows), 221)
        inds = {r["indicator"] for r in rows}
        self.assertNotIn("USD/IRR", inds)
        self.assertNotIn("USD/EGP", inds)
        self.assertEqual({"USD/SAR", "USD/AED", "USD/IQD", "EUR/USD", "Brent Crude Oil"} - inds, set())
        for body in self.posts:
            self.assertEqual(len({frozenset(r) for r in body}), 1)

    def test_rerun_after_existing_daily_close_rows_skips_them(self):
        self.existing = [{"indicator": "Gold", "conflict_day": 3}, {"indicator": "USD/SAR", "conflict_day": 3}]
        bf.run(self.args())
        rows = [r for body in self.posts for r in body]
        self.assertNotIn(("Gold", 3), {(r["indicator"], r["conflict_day"]) for r in rows})
        self.assertNotIn(("USD/SAR", 3), {(r["indicator"], r["conflict_day"]) for r in rows})
        self.assertIn(("Gold", 4), {(r["indicator"], r["conflict_day"]) for r in rows})

    def test_exit_nonzero_when_data_fetched_but_nothing_written(self):
        with mock.patch.object(bf.requests, "post", lambda *a, **k: FakeResp(500, None, "boom")):
            self.assertNotEqual(bf.run(self.args()), 0)

    def test_nothing_new_to_write_is_success(self):
        # every key already present -> idempotent no-op, exit 0
        import itertools
        rows = []
        for ind in ["Brent Crude Oil", "WTI Crude Oil", "Gold", "Natural Gas", "S&P 500", "Dow Jones",
                    "Energy ETF (XLE)", "Oil ETF (USO)", "VIX (Fear Index)", "EUR/USD", "USD/SAR", "USD/AED", "USD/IQD"]:
            rows += [{"indicator": ind, "conflict_day": d} for d in range(1, 221)]
        self.existing = rows
        self.assertEqual(bf.run(self.args()), 0)
        self.assertEqual(self.posts, [])

    def test_user_agent_is_sent_to_yahoo(self):
        seen = []
        orig = self.fake_get

        def spy(url, headers=None, params=None, timeout=None):
            if "yahoo" in url:
                seen.append(headers)
            return orig(url, headers=headers, params=params, timeout=timeout)

        with mock.patch.object(bf.requests, "get", spy):
            bf.run(self.args(dry_run=True))
        self.assertTrue(seen and all("User-Agent" in h for h in seen))


class CrossCheck(unittest.TestCase):
    def test_warns_when_diff_over_half_percent(self):
        series = {D(2026, 3, 2): 100.0, D(2026, 3, 3): 100.0}
        fred = {D(2026, 3, 2): 100.2, D(2026, 3, 3): 103.0}
        out = bf.crosscheck_sp500(series, fred, k=2, rng=__import__("random").Random(1))
        self.assertEqual(len(out), 2)
        flagged = {d: warn for d, y, f, diff, warn in out}
        self.assertFalse(flagged[D(2026, 3, 2)])
        self.assertTrue(flagged[D(2026, 3, 3)])


if __name__ == "__main__":
    unittest.main()
