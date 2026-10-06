"""scenario_daily.py: deterministic market-anchored-v1 daily scenario job.

Run:  cd .github/workflows/scripts && python3 -m unittest tests.test_scenario_daily -v
No network: the module's http_request() is replaced by a fake; market fetches are mocked.
"""
import datetime as dt
import hashlib
import json
import os
import re
import shutil
import sys
import tempfile
import unittest
from decimal import Decimal
from unittest import mock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import _load  # noqa: E402

sd = _load.load("scenario_daily")

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..", "..", ".."))
EV221 = os.path.join(REPO, "data", "scenario-evidence", "day-221")
IMPORT_SQL = os.path.join(REPO, "supabase", "migrations", "20261007100100_scenario_d221_import.sql")
READ_AT_221 = {"Polymarket": "2026-10-06T16:10:53Z", "Kalshi": "2026-10-06T16:14:47Z"}
H_OCT = dt.date(2026, 10, 31)
UTC = dt.timezone.utc


def slurp(path, mode="r"):
    with open(path, mode) as f:
        return f.read()


# --- Python replica of public.scenario_input_element_valid / scenario_inputs_valid (migration 100000) ---
def element_valid(el):
    if not isinstance(el, dict):
        return False
    if el.get("kind") == "derived":
        return (isinstance(el.get("rule"), str) and el["rule"].strip() != ""
                and isinstance(el.get("from"), list) and len(el["from"]) >= 1)
    if el.get("kind", "market") != "market":
        return False
    def s(k):
        return isinstance(el.get(k), str) and el[k].strip() != ""
    num = lambda k: isinstance(el.get(k), (int, float)) and not isinstance(el.get(k), bool)  # noqa: E731
    if not (s("venue") and s("question") and s("read_at") and s("url")
            and re.match(r"^https?://\S+$", el["url"], re.I) and num("probability")
            and 0 <= el["probability"] <= 1 and isinstance(el.get("used"), bool)):
        return False
    return (num("yes_bid") and num("yes_ask")) if el["used"] else s("excluded_reason")


def inputs_valid(inputs, require_basis):
    if not isinstance(inputs, list) or not inputs or not all(element_valid(e) for e in inputs):
        return False
    return (not require_basis) or any(e.get("kind") == "derived" or e.get("used") is True for e in inputs)


def import_sql_payloads():
    """Run inputs, computed, and per-scenario inputs exactly as imported by migration 100100."""
    sql = slurp(IMPORT_SQL)
    run_part, *daily_parts = sql.split("INSERT INTO public.scenario_daily")
    run_j = re.findall(r"\$j\$(.*?)\$j\$::jsonb", run_part, re.S)
    daily = {}
    for part in daily_parts:
        code = re.search(r"s\.code = '(\w)'", part).group(1)
        daily[code] = json.loads(re.search(r"\$j\$(.*?)\$j\$::jsonb", part, re.S).group(1))
    return json.loads(run_j[0]), json.loads(run_j[1]), daily


def R(cls, bid, ask, liq=50000, vol=50000, **kw):
    return sd.make_reading(cls=cls, bid=Decimal(str(bid)), ask=Decimal(str(ask)),
                           liq=Decimal(str(liq)), vol=Decimal(str(vol)), **kw)


def base_set(a=(0.20, 0.22), d=(0.30, 0.32), c=(0.05, 0.06), hormuz=(0.02, 0.03), e=None):
    rs = [R("A", *a, question="A proxy"),
          R("A", *hormuz, question="Hormuz normal", same_event="HORMUZ_NORMAL"),
          R("D", *d, question="D proxy"),
          R("C", *c, question="C proxy")]
    if e is not None:
        rs.append(R("E", *e, question="E proxy"))
    return rs


class DayAndHorizon(unittest.TestCase):
    def test_day_lock_formula(self):
        self.assertEqual(sd.conflict_day_for(dt.date(2026, 2, 28)), 1)
        self.assertEqual(sd.conflict_day_for(dt.date(2026, 10, 6)), 221)
        self.assertEqual(sd.conflict_day_for(dt.date(2026, 10, 7)), 222)

    def test_horizon_roll_rule(self):
        self.assertEqual(sd.horizon_for(dt.date(2026, 10, 6)), H_OCT)
        self.assertEqual(sd.horizon_for(dt.date(2026, 10, 17)), H_OCT)                  # 14 days left
        self.assertEqual(sd.horizon_for(dt.date(2026, 10, 18)), dt.date(2026, 11, 30))  # 13 days -> roll
        self.assertEqual(sd.horizon_for(dt.date(2026, 12, 20)), dt.date(2027, 1, 31))


class Day221Parity(unittest.TestCase):
    """The pure method over the committed Day 221 snapshots reproduces the published row exactly."""

    @classmethod
    def setUpClass(cls):
        cls.expected = json.loads(slurp(os.path.join(EV221, "scenario_d221.json")))
        readings = sd.load_readings(EV221, H_OCT, read_at_override=READ_AT_221)
        cls.result = sd.compute(readings, H_OCT, 221)

    def test_numbers(self):
        r = self.result
        self.assertEqual((r["scenario_a"], r["scenario_b"], r["scenario_c"], r["scenario_d"], r["scenario_e"]),
                         (23, 44, 5, 28, None))
        self.assertEqual(r["verdict"], "PUBLISH")

    def test_every_stored_field_identical(self):
        for k, v in self.expected.items():
            self.assertEqual(self.result[k], v, f"field {k} differs")

    def test_inputs_identical_row_by_row(self):
        self.assertEqual(len(self.result["inputs"]), len(self.expected["inputs"]))
        for got, exp in zip(self.result["inputs"], self.expected["inputs"]):
            self.assertEqual(got, exp)

    def test_matches_db_import_payloads(self):
        run_inputs, computed, daily = import_sql_payloads()
        self.assertEqual(self.result["inputs"], run_inputs)
        for k in ("A", "B", "C", "D", "E", "raw_percent", "verdict"):
            self.assertEqual(self.result["computed"][k], computed[k], k)
        rows = sd.build_daily_rows(self.result, {c: f"id-{c}" for c in "ABCDE"}, "run-1")
        got = {r["scenario_id"][3:]: r for r in rows}
        self.assertEqual(set(got), set("ABCDE"))
        for code in "ABCDE":
            self.assertEqual(got[code]["inputs"], daily[code], f"scenario {code} inputs differ from the import")
        self.assertEqual([got[c]["probability"] for c in "ABCDE"], [23, 44, 5, 28, None])
        self.assertIsNotNone(got["E"]["null_reason"])

    def test_payloads_pass_db_input_constraint(self):
        self.assertTrue(inputs_valid(self.result["inputs"], False))
        for row in sd.build_daily_rows(self.result, {c: c for c in "ABCDE"}, "run-1"):
            self.assertTrue(inputs_valid(row["inputs"], row["probability"] is not None), row["scenario_id"])


class Rounding(unittest.TestCase):
    def H(self, a, b, c, d):
        ints, _ = sd.hamilton({"A": Decimal(a), "B": Decimal(b), "C": Decimal(c), "D": Decimal(d)})
        return ints["A"], ints["B"], ints["C"], ints["D"]

    def test_exact_integers_untouched(self):
        self.assertEqual(self.H("0.25", "0.25", "0.25", "0.25"), (25, 25, 25, 25))

    def test_tie_goes_to_larger_raw_value(self):
        self.assertEqual(self.H("0.230", "0.440", "0.055", "0.275"), (23, 44, 5, 28))

    def test_equal_raw_tie_uses_order_D_C_A_B(self):
        self.assertEqual(self.H("0.125", "0.625", "0.125", "0.125"), (12, 63, 12, 13))  # B larger raw, then D

    def test_largest_remainder_wins_over_size(self):
        self.assertEqual(self.H("0.109", "0.701", "0.095", "0.095"), (11, 70, 9, 10))  # A by remainder; C/D equal -> D

    def test_three_points_left(self):
        self.assertEqual(sum(self.H("0.2475", "0.2475", "0.2575", "0.2475")), 100)

    def test_always_sums_to_100(self):
        import random
        rnd = random.Random(221)
        for _ in range(2000):
            cuts = sorted(Decimal(rnd.randint(0, 100000)) / 100000 for _ in range(3))
            a, c, d = cuts[0], cuts[1] - cuts[0], cuts[2] - cuts[1]
            ints, _ = sd.hamilton({"A": a, "B": 1 - a - c - d, "C": c, "D": d})
            self.assertEqual(sum(ints.values()), 100)
            self.assertTrue(all(v >= 0 for v in ints.values()))

    def test_e_rounds_half_up(self):
        r = sd.compute(base_set(e=(0.12, 0.13)), H_OCT, 221)   # mid 0.125 -> 12.5 -> 13
        self.assertEqual(r["scenario_e"], 13)


class Floors(unittest.TestCase):
    def one(self, **kw):
        r = sd.compute(base_set() + [R("D", **kw, question="probe")], H_OCT, 221)
        return next(i for i in r["inputs"] if i["question"] == "probe")

    def test_spread_exactly_5_points_passes(self):
        self.assertTrue(self.one(bid=0.40, ask=0.45)["used"])

    def test_spread_over_5_points_fails(self):
        i = self.one(bid=0.40, ask=0.4501)
        self.assertFalse(i["used"])
        self.assertIn("spread", i["excluded_reason"])

    def test_liquidity_exactly_10k_passes(self):
        self.assertTrue(self.one(bid=0.40, ask=0.41, liq=10000)["used"])

    def test_liquidity_below_10k_fails(self):
        i = self.one(bid=0.40, ask=0.41, liq="9999.99")
        self.assertFalse(i["used"])
        self.assertIn("liquidity_usd", i["excluded_reason"])

    def test_volume_exactly_10k_passes(self):
        self.assertTrue(self.one(bid=0.40, ask=0.41, vol=10000)["used"])

    def test_volume_below_10k_fails(self):
        i = self.one(bid=0.40, ask=0.41, vol="9999.5")
        self.assertFalse(i["used"])
        self.assertIn("volume", i["excluded_reason"])

    def test_class_takes_max_qualifying_market(self):
        r = sd.compute(base_set() + [R("D", 0.50, 0.52, question="big"), R("D", 0.70, 0.90, question="wide")],
                       H_OCT, 221)
        self.assertEqual(r["scenario_d"], 51)   # 0.70/0.90 fails the spread floor and is ignored


class ResidualAndVerdicts(unittest.TestCase):
    def test_residual_b_never_negative_overflow_keeps_frozen(self):
        r = sd.compute(base_set(a=(0.50, 0.52), d=(0.50, 0.52), c=(0.10, 0.11)), H_OCT, 221)
        self.assertEqual(r["verdict"], "KEEP_FROZEN")
        self.assertGreaterEqual(r["scenario_b"], 0)
        self.assertEqual(r["scenario_a"] + r["scenario_b"] + r["scenario_c"] + r["scenario_d"], 100)
        self.assertTrue(any("a+c+d" in f for f in r["flags"]))

    def test_no_d_market_keeps_frozen(self):
        rs = [x for x in base_set() if x["cls"] != "D"]
        r = sd.compute(rs, H_OCT, 221)
        self.assertEqual(r["verdict"], "KEEP_FROZEN")
        self.assertTrue(any("D" in f and "no market reading" in f for f in r["flags"]))

    def test_no_a_market_keeps_frozen(self):
        rs = base_set(a=(0.10, 0.30))   # A proxy fails the spread floor; only Hormuz-normal remains
        rs = [x for x in rs if x.get("same_event") != "HORMUZ_NORMAL"] + \
             [R("A", 0.02, 0.03, liq=500, question="Hormuz normal", same_event="HORMUZ_NORMAL")]
        self.assertEqual(sd.compute(rs, H_OCT, 221)["verdict"], "KEEP_FROZEN")

    def test_no_c_market_publishes_with_flag(self):
        rs = [x for x in base_set() if x["cls"] != "C"]
        r = sd.compute(rs, H_OCT, 221)
        self.assertEqual(r["verdict"], "PUBLISH_WITH_FLAG")
        self.assertEqual(r["scenario_c"], 0)
        c_row = next(x for x in sd.build_daily_rows(r, {k: k for k in "ABCDE"}, "r") if x["scenario_id"] == "C")
        self.assertTrue(inputs_valid(c_row["inputs"], True))

    def test_closed_core_market_at_horizon_keeps_frozen(self):
        rs = base_set() + [R("D", 0.40, 0.41, question="resolved", closed=True)]
        r = sd.compute(rs, H_OCT, 221)
        self.assertEqual(r["verdict"], "KEEP_FROZEN")


class ENull(unittest.TestCase):
    def test_e_null_when_only_market_fails_floor(self):
        r = sd.compute(base_set(e=(0.20, 0.37)), H_OCT, 221)
        self.assertIsNone(r["scenario_e"])
        self.assertEqual(r["verdict"], "PUBLISH")
        e_row = next(x for x in sd.build_daily_rows(r, {k: k for k in "ABCDE"}, "r") if x["scenario_id"] == "E")
        self.assertIsNone(e_row["probability"])
        self.assertTrue(len(e_row["null_reason"]) >= 5)
        self.assertTrue(inputs_valid(e_row["inputs"], False))

    def test_e_null_when_no_market_at_all(self):
        r = sd.compute(base_set(), H_OCT, 221)
        self.assertIsNone(r["scenario_e"])
        e_row = next(x for x in sd.build_daily_rows(r, {k: k for k in "ABCDE"}, "r") if x["scenario_id"] == "E")
        self.assertIsNone(e_row["probability"])
        self.assertTrue(inputs_valid(e_row["inputs"], False))


# ----------------------------------------------------------------------------------- main() flow
class FakeDB:
    """Records every HTTP call the job makes; answers PostgREST like production would."""

    def __init__(self, published=(), overrides=(), fail_on=None, scenarios=None):
        self.calls = []
        self.published = list(published)
        self.overrides = list(overrides)
        self.fail_on = fail_on
        self.scenarios = scenarios or [
            {"id": f"uuid-{c}", "code": c, "group_code": "independent" if c == "E" else "core",
             "status": "active", "born_day": 1, "retired_day": None} for c in "ABCDE"]

    def __call__(self, method, url, headers=None, body=None, timeout=30):
        self.calls.append((method, url, json.loads(body) if body else None))
        path = url.split("/rest/v1/", 1)[1]
        if self.fail_on and path.startswith(self.fail_on):
            return 400, b'{"code":"23514","message":"check constraint"}'
        if method == "GET" and path.startswith("scenario_daily"):
            return 200, json.dumps(self.published).encode()
        if method == "GET" and path.startswith("scenario_overrides"):
            return 200, json.dumps(self.overrides).encode()
        if method == "GET" and path.startswith("scenarios"):
            return 200, json.dumps(self.scenarios).encode()
        if method == "POST" and path.startswith("rpc/scenario_publish_run"):
            return 200, b"5"
        if method == "POST" and path.startswith("rpc/scenario_lifecycle_tick"):
            return 200, b"[]"
        if method == "POST":
            return 201, b""
        raise AssertionError(f"unexpected call {method} {url}")

    def writes(self):
        return [(m, u.split("/rest/v1/", 1)[1].split("?")[0]) for m, u, _ in self.calls if m == "POST"]


def make_evidence_221(tmp, day=221):
    """Day 221 snapshots + a manifest in the layout fetch_evidence() writes."""
    dst = os.path.join(tmp, "evidence")
    shutil.copytree(EV221, dst, ignore=shutil.ignore_patterns("*.py", "scenario_d221.json"))
    files = {}
    for sub in ("ev", "other"):
        for name in sorted(os.listdir(os.path.join(dst, sub))):
            rel = f"{sub}/{name}"
            raw = slurp(os.path.join(dst, rel), "rb")
            files[rel] = {"venue": "Polymarket" if sub == "ev" else "Kalshi", "url": "https://example.test/" + name,
                          "read_at": READ_AT_221["Polymarket" if sub == "ev" else "Kalshi"],
                          "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw), "status": 200}
    manifest = {"conflict_day": day, "horizon_end": "2026-10-31", "method_version": "market-anchored-v1",
                "read_started_at": "2026-10-06T16:10:53Z", "read_finished_at": "2026-10-06T16:14:47Z",
                "files": files, "missing": []}
    with open(os.path.join(dst, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
    return dst


class MainFlow(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp)
        self.env = mock.patch.dict(os.environ, {"SUPABASE_URL": "https://db.test", "SUPABASE_SERVICE_KEY": "k",
                                                "GITHUB_SHA": "abc123", "GITHUB_RUN_ID": "99",
                                                "GITHUB_REPOSITORY": "o/r", "GITHUB_SERVER_URL": "https://github.com"})
        self.env.start()
        self.addCleanup(self.env.stop)

    def run_main(self, db, now=dt.datetime(2026, 10, 6, 17, 0, tzinfo=UTC), day=221, extra=()):
        ev = make_evidence_221(self.tmp, day=day)
        with mock.patch.object(sd, "http_request", db), mock.patch.object(sd, "utc_now", lambda: now):
            return sd.main(["run", "--evidence", ev, "--artifact-name", "scenario-evidence-day-221", *extra])

    def test_publishes_run_rows_then_ticks(self):
        db = FakeDB()
        self.assertEqual(self.run_main(db), 0)
        self.assertEqual(db.writes(), [("POST", "scenario_runs"), ("POST", "scenario_daily"),
                                       ("POST", "rpc/scenario_publish_run"), ("POST", "rpc/scenario_lifecycle_tick")])
        run = next(b for m, u, b in db.calls if u.endswith("/scenario_runs"))
        self.assertEqual(run["verdict"], "PUBLISH")
        self.assertEqual(run["conflict_day"], 221)
        self.assertIn("abc123", run["code_ref"])
        self.assertIn("/actions/runs/99", run["evidence_ref"])
        self.assertIn("scenario-evidence-day-221", run["evidence_ref"])
        self.assertIn("sha256:", run["evidence_ref"])
        self.assertTrue(inputs_valid(run["inputs"], False))
        self.assertNotIn("provenance", run)
        rows = next(b for m, u, b in db.calls if u.endswith("/scenario_daily"))
        self.assertEqual(len({tuple(sorted(r)) for r in rows}), 1, "PGRST102: one key set per bulk insert")
        self.assertEqual(sorted((r["scenario_id"], r["probability"]) for r in rows),
                         [("uuid-A", 23), ("uuid-B", 44), ("uuid-C", 5), ("uuid-D", 28), ("uuid-E", None)])
        self.assertTrue(all(r["is_published"] is False and r["run_id"] == run["id"] for r in rows))
        pub = next(b for m, u, b in db.calls if "scenario_publish_run" in u)
        self.assertEqual(pub, {"p_run_id": run["id"], "p_supersede_override": False})
        tick = next(b for m, u, b in db.calls if "scenario_lifecycle_tick" in u)
        self.assertEqual(tick, {"p_as_of_day": 221, "p_job": "scenario_daily"})

    def test_idempotent_when_day_already_published(self):
        db = FakeDB(published=[{"id": "x", "run_id": "38e842ae", "method_version": "market-anchored-v1"}])
        self.assertEqual(self.run_main(db), 0)
        self.assertEqual(db.writes(), [])

    def test_write_error_fails_loudly(self):
        db = FakeDB(fail_on="scenario_daily?")  # GET passes, POST scenario_daily fails
        db.fail_on = None
        orig = db.__call__

        def failing(method, url, headers=None, body=None, timeout=30):
            if method == "POST" and url.endswith("/scenario_daily"):
                db.calls.append((method, url, json.loads(body)))
                return 400, b'{"code":"23514"}'
            return orig(method, url, headers, body, timeout)
        self.assertNotEqual(self.run_main(failing), 0)
        self.assertNotIn(("POST", "rpc/scenario_publish_run"), db.writes())

    def test_publish_rpc_error_fails_loudly(self):
        self.assertNotEqual(self.run_main(FakeDB(fail_on="rpc/scenario_publish_run")), 0)

    def test_refuses_future_day(self):
        db = FakeDB()
        rc = self.run_main(db, day=222)                                      # evidence claims tomorrow
        self.assertNotEqual(rc, 0)
        self.assertEqual(db.calls, [])

    def test_refuses_past_day(self):
        db = FakeDB()
        rc = self.run_main(db, now=dt.datetime(2026, 10, 7, 5, 20, tzinfo=UTC))   # today is 222, evidence 221
        self.assertNotEqual(rc, 0)
        self.assertEqual(db.calls, [])

    def test_refuses_explicit_day_other_than_today(self):
        db = FakeDB()
        self.assertNotEqual(self.run_main(db, extra=("--day", "220")), 0)
        self.assertEqual(db.calls, [])

    def test_keep_frozen_writes_run_only(self):
        ev = make_evidence_221(self.tmp)
        for f in os.listdir(os.path.join(ev, "ev")):          # drop every D market from the snapshot
            if "ceasefire" in f or "kharg" in f or "saudi" in f or "invade" in f or "ground" in f:
                os.remove(os.path.join(ev, "ev", f))
        db = FakeDB()
        with mock.patch.object(sd, "http_request", db), \
                mock.patch.object(sd, "utc_now", lambda: dt.datetime(2026, 10, 6, 17, tzinfo=UTC)):
            rc = sd.main(["run", "--evidence", ev, "--artifact-name", "a"])
        self.assertEqual(rc, 0)
        self.assertEqual(db.writes(), [("POST", "scenario_runs")])
        run = next(b for m, u, b in db.calls if u.endswith("/scenario_runs"))
        self.assertEqual(run["verdict"], "KEEP_FROZEN")

    def test_dry_run_writes_nothing(self):
        db = FakeDB()
        self.assertEqual(self.run_main(db, extra=("--dry-run",)), 0)
        self.assertEqual(db.writes(), [])

    def test_active_input_override_refuses(self):
        db = FakeDB(overrides=[{"id": "o1", "kind": "input"}])
        self.assertNotEqual(self.run_main(db), 0)
        self.assertEqual(db.writes(), [])


class Fetch(unittest.TestCase):
    def test_fetch_saves_raw_bytes_and_manifest(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        served = {}

        def fake(method, url, headers=None, body=None, timeout=30):
            assert method == "GET" and "supabase" not in url
            if "gamma-api.polymarket.com" in url:
                slug = url.split("slug=")[1]
                p = os.path.join(EV221, "ev", slug + ".json")
            else:
                event = url.split("/events/")[1].split("?")[0]
                p = os.path.join(EV221, "other", f"k_{event}.json")
            raw = slurp(p, "rb") if os.path.exists(p) else b"[]"
            served[url] = raw
            return 200, raw
        with mock.patch.object(sd, "http_request", fake), \
                mock.patch.object(sd, "utc_now", lambda: dt.datetime(2026, 10, 6, 16, 10, 53, tzinfo=UTC)):
            out = os.path.join(tmp, "ev")
            self.assertEqual(sd.main(["fetch", "--out", out]), 0)
        man = json.loads(slurp(os.path.join(out, "manifest.json")))
        self.assertEqual(man["conflict_day"], 221)
        self.assertEqual(man["horizon_end"], "2026-10-31")
        self.assertTrue(man["files"])
        for rel, meta in man["files"].items():
            raw = slurp(os.path.join(out, rel), "rb")
            self.assertEqual(hashlib.sha256(raw).hexdigest(), meta["sha256"])
            self.assertEqual(raw, served[meta["url"]])
        readings = sd.load_readings(out, H_OCT, read_at_override=READ_AT_221)
        r = sd.compute(readings, H_OCT, 221)
        self.assertEqual((r["scenario_a"], r["scenario_b"], r["scenario_c"], r["scenario_d"]), (23, 44, 5, 28))

    def test_fetch_failure_exits_non_zero(self):
        tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, tmp)
        with mock.patch.object(sd, "http_request", lambda *a, **k: (503, b"down")), \
                mock.patch.object(sd, "utc_now", lambda: dt.datetime(2026, 10, 6, 16, tzinfo=UTC)), \
                mock.patch.object(sd.time, "sleep", lambda s: None):
            self.assertNotEqual(sd.main(["fetch", "--out", os.path.join(tmp, "ev")]), 0)


if __name__ == "__main__":
    unittest.main()
