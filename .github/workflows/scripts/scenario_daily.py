"""
scenario_daily.py — deterministic daily scenario job, method market-anchored-v1. NO model / AI API.

Two steps (the workflow runs them in this order, uploading the evidence artifact in between, so the
artifact named in evidence_ref exists before anything is written to the database):

  fetch --out DIR
      GET the registry's Polymarket Gamma and Kalshi v2 public endpoints, save every raw response byte
      for byte under DIR (ev/<slug>.json, other/k_<event>.json, the Day 221 evidence layout) plus
      DIR/manifest.json (url, read_at, sha256 per file). Exit 1 if any request fails.

  run --evidence DIR --artifact-name NAME [--dry-run] [--day N]
      DAY LOCK: refuses unless the evidence day == --day (if given) == today
      ((UTC date - 2026-02-28).days + 1). Computes exactly per scenario_method.md (market-anchored-v1)
      from the saved bytes only, then via PostgREST:
        - a day that already has a published reading -> exit 0, nothing written (idempotent)
        - an active INPUT override for today -> exit 3 (this job does not apply overrides; operator run)
        - INSERT scenario_runs (inputs = full table, used + excluded; code_ref; evidence_ref)
        - verdict KEEP_FROZEN -> exit 0 (run row only, nothing published)
        - INSERT scenario_daily (one row per live A-E scenario, unpublished)
        - rpc scenario_publish_run(run_id, false)   (never supersedes an operator output override)
        - rpc scenario_lifecycle_tick(day, 'scenario_daily')
      Any HTTP error on a write -> exit 1. --dry-run prints the payloads and writes nothing.

Never writes scenario_probabilities (derived by the registry's sync trigger).

Method rulings encoded (scenario_method.md §1): horizon = nearest month-end contract with >= 14 days
left; YES bid/ask midpoint (complement for "ceasefire continues"); floor spread <= 0.05, liquidity
(Kalshi: open interest) >= $10k, volume >= $10k, resolution = H; class = max qualifying proxy;
same-event merge by venue weight; C via the Hormuz gate (0.90); B residual; A-D disjoint; Hamilton
rounding (ties: larger raw, then D, C, A, B); E independent, NULL without a qualifying market, half-up;
A or D without a qualifying market -> KEEP_FROZEN; C without one -> 0 + PUBLISH_WITH_FLAG.
Job-spec choice (stricter than method §1.7/§1.9, which would publish with a flag): a + c + d > 1
-> KEEP_FROZEN with a flag (precedence D > C > A > B is still computed and stored for audit).
"""
import argparse
import calendar
import datetime as dt
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
import uuid
from decimal import ROUND_FLOOR, ROUND_HALF_UP, Decimal as D

METHOD_VERSION = "market-anchored-v1"
CONFLICT_START = dt.date(2026, 2, 28)
FLOOR_LIQ = D(10000)
FLOOR_VOL = D(10000)
MAX_SPREAD = D("0.05")
HORMUZ_GATE = D("0.90")
MIN_DAYS_LEFT = 14
JOB_NAME = "scenario_daily"
CORE = ("A", "B", "C", "D")
OVERFLOW_VERDICT = "KEEP_FROZEN"   # job spec; method §1.7/§1.9 alone would be PUBLISH_WITH_FLAG
WEIGHT = {"Polymarket": D(1), "Kalshi": D(1), "PredictIt": D(1), "Metaculus": D("0.5"),
          "Good Judgment Open": D("0.5"), "Manifold": D("0.2")}
MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September",
          "October", "November", "December"]
GAMMA = "https://gamma-api.polymarket.com/events?slug={}"
KALSHI = "https://api.elections.kalshi.com/trade-api/v2/events/{}?with_nested_markets=true"
USER_AGENT = "mena-intel-desk scenario_daily (+https://github.com/rzjy54n5sh-rgb/OSINT)"
SCRIPT_REL = ".github/workflows/scripts/scenario_daily.py"

# ---------------------------------------------------------------------------------------------------
# Proxy registry (scenario_method.md §1.5 / §3). Order = order of the published input table.
# event: Polymarket event slug or Kalshi event ticker; a dict keys a per-horizon event (ISO date -> id)
# for venues that list one event per month. The market inside the event is chosen by horizon (H).
# ---------------------------------------------------------------------------------------------------
REGISTRY = [
    dict(cls="A", venue="Polymarket", event="us-announces-end-of-iranian-blockade-byptptpt-20260713152715080"),
    dict(cls="A", venue="Polymarket", event="us-iran-hormuz-agreement-byptptpt-20260803235957575"),
    dict(cls="A", venue="Polymarket", event="us-iran-final-nuclear-deal-by-20260621201254412"),
    dict(cls="A", venue="Kalshi", event="KXUSAIRANAGREEMENT-27"),
    dict(cls="A", venue="Polymarket", same_event="HORMUZ_NORMAL", event={
        "2026-10-31": "strait-of-hormuz-traffic-returns-to-normal-by-october-31-20260810151043583",
        "2026-11-30": "strait-of-hormuz-traffic-returns-to-normal-by-november-30-20260810151158765",
        "2026-12-31": "strait-of-hormuz-traffic-returns-to-normal-by-december-31"}),
    dict(cls="A", venue="Kalshi", event="KXHORMUZNORM-26MAR17", same_event="HORMUZ_NORMAL"),
    dict(cls="D", venue="Polymarket", event="us-iran-ceasefire-continues-throughptptpt", invert=True,
         note="P(US strike on Iran) = 1 - P(ceasefire holds)"),
    dict(cls="D", venue="Polymarket", event="israel-x-iran-ceasefire-continues-throughptptpt-20260716224448963",
         invert=True, note="P(Israel/Iran strike) = 1 - P(ceasefire holds)"),
    dict(cls="D", venue="Polymarket", event="kharg-island-no-longer-under-iranian-control-by-march-31"),
    dict(cls="D", venue="Polymarket", event="saudi-arabia-military-action-against-iran-by-20260916"),
    dict(cls="D", venue="Polymarket", event="will-the-us-invade-iran-before-2027"),
    dict(cls="D", venue="Polymarket", event="israel-ground-operation-in-iran-confirmed-by"),
    dict(cls="C", venue="Polymarket", event="bab-el-mandeb-strait-effectively-closed-by"),
    dict(cls="E", venue="Polymarket", event="will-iran-target-united-arab-emirates-byptptpt-20260907"),
]


# ------------------------------------------------------------------------------------- small helpers
def utc_now():
    return dt.datetime.now(dt.timezone.utc)


def iso(ts):
    return ts.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def parse_ts(s):
    s = s.strip().replace("Z", "+00:00")
    if "." in s:                                   # 2026-11-01T03:59:00.000+00:00
        head, tail = s.split(".", 1)
        tz = tail[tail.find("+"):] if "+" in tail else ""
        s = head + tz
    t = dt.datetime.fromisoformat(s)
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def conflict_day_for(day):
    return (day - CONFLICT_START).days + 1


def month_end(year, month):
    return dt.date(year, month, calendar.monthrange(year, month)[1])


def horizon_for(day):
    """Nearest month-end with at least 14 days left (method §1.1 roll rule)."""
    h = month_end(day.year, day.month)
    if (h - day).days >= MIN_DAYS_LEFT:
        return h
    y, m = (day.year + 1, 1) if day.month == 12 else (day.year, day.month + 1)
    return month_end(y, m)


def next_roll(h):
    """(roll date, next horizon): the first day on which horizon_for() stops returning h."""
    roll = h - dt.timedelta(days=MIN_DAYS_LEFT - 1)
    return roll, horizon_for(roll)


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def read_json(path):
    with open(path, "rb") as f:
        return json.loads(f.read())


def sha256_file(path):
    with open(path, "rb") as f:
        return sha256_bytes(f.read())


def fmt3(x):
    """Decimal as text with at least 3 decimals (0.23 -> 0.230, 0.02425 -> 0.02425)."""
    x = D(x).normalize()
    if x.as_tuple().exponent > -3:
        x = x.quantize(D("0.001"))
    return format(x, "f")


def fmt_pct(x):
    """Raw percent as text with at least 1 decimal (23.00 -> 23.0, 27.500 -> 27.5)."""
    x = D(x).normalize()
    if x.as_tuple().exponent > -1:
        x = x.quantize(D("0.1"))
    return format(x, "f")


def fmt_usd(x):
    s = f"{x:.0f}"
    return s if D(s) < FLOOR_LIQ or x >= FLOOR_LIQ else format(x.normalize(), "f")   # never print 10000<10000


def event_for(entry, horizon):
    ev = entry["event"]
    return ev.get(horizon.isoformat()) if isinstance(ev, dict) else ev


def evidence_rel(venue, event):
    return f"ev/{event}.json" if venue == "Polymarket" else f"other/k_{event}.json"


def api_url_for(venue, event):
    return GAMMA.format(event) if venue == "Polymarket" else KALSHI.format(event)


# ---------------------------------------------------------------------------------------- HTTP layer
def http_request(method, url, headers=None, body=None, timeout=30):
    """(status, raw bytes). Network errors raise; HTTP errors return their status."""
    req = urllib.request.Request(url, data=body.encode() if isinstance(body, str) else body, method=method,
                                 headers={"User-Agent": USER_AGENT, **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


# ----------------------------------------------------------------------------------------- fetching
def fetch_evidence(out_dir, now=None):
    """Save the raw API JSON for every registry event at today's horizon. Returns (manifest, failures)."""
    now = now or utc_now()
    horizon = horizon_for(now.date())
    os.makedirs(os.path.join(out_dir, "ev"), exist_ok=True)
    os.makedirs(os.path.join(out_dir, "other"), exist_ok=True)
    files, unconfigured, failures, started = {}, [], [], None
    for entry in REGISTRY:
        event = event_for(entry, horizon)
        if event is None:
            unconfigured.append({"cls": entry["cls"], "venue": entry["venue"],
                                 "reason": f"registry has no {entry['venue']} event configured for horizon {horizon}"})
            continue
        rel = evidence_rel(entry["venue"], event)
        if rel in files:
            continue
        url = api_url_for(entry["venue"], event)
        status, raw, err = None, b"", None
        for attempt in range(3):
            started = started or utc_now()
            try:
                status, raw = http_request("GET", url, headers={"Accept": "application/json"}, timeout=30)
                err = None
            except Exception as e:  # network error
                status, raw, err = None, b"", f"{type(e).__name__}: {e}"
            if status == 200:
                try:
                    json.loads(raw)
                    break
                except ValueError:
                    err = "response is not JSON"
            if attempt < 2:
                time.sleep(10 if status == 429 else 5)
        read_at = utc_now()
        if status != 200 or err:
            failures.append({"url": url, "status": status, "error": err or raw[:200].decode("utf-8", "replace")})
            continue
        with open(os.path.join(out_dir, rel), "wb") as f:
            f.write(raw)
        files[rel] = {"venue": entry["venue"], "event": event, "url": url, "read_at": iso(read_at),
                      "sha256": sha256_bytes(raw), "bytes": len(raw), "status": status}
    reads = sorted(m["read_at"] for m in files.values())
    manifest = {"conflict_day": conflict_day_for(now.date()), "horizon_end": horizon.isoformat(),
                "method_version": METHOD_VERSION, "fetched_by": SCRIPT_REL,
                "read_started_at": iso(started) if started else iso(now),
                "read_finished_at": reads[-1] if reads else iso(now),
                "files": files, "unconfigured": unconfigured, "failures": failures}
    with open(os.path.join(out_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2, sort_keys=True)
    return manifest, failures


# ----------------------------------------------------------------------------- reading the snapshots
def make_reading(cls, bid, ask, liq, vol, venue="Polymarket", question="synthetic", slug="synthetic",
                 resolution_date="2026-11-01T03:59:00Z", invert=False, same_event=None, note=None,
                 horizon_ok=True, closed=False, read_at="2026-10-06T00:00:00Z", last_trade=None,
                 liq_label=None, url=None, api_url=None, extra_fail=None):
    if note is None and same_event:
        note = f"same-event:{same_event}"
    return dict(cls=cls, venue=venue, question=question, slug=slug,
                url=url or f"https://polymarket.com/event/{slug}", api_url=api_url,
                resolution_date=resolution_date, bid=bid, ask=ask, liq=liq, vol=vol,
                liq_label=liq_label or ("open_interest_usd" if venue == "Kalshi" else "liquidity_usd"),
                invert=invert, same_event=same_event, note=note or "", horizon_ok=horizon_ok,
                closed=closed, read_at=read_at, last_trade=last_trade, extra_fail=extra_fail)


def _dec(x):
    return D(str(x)) if x is not None else None


def _horizon_window(h):
    lo = dt.datetime(h.year, h.month, h.day, tzinfo=dt.timezone.utc)
    return lo, lo + dt.timedelta(days=2) - dt.timedelta(seconds=1)


def _pm_question_matches(q, h):
    if re.search(rf"\b{MONTHS[h.month - 1]} {h.day}(?!\d)", q):
        return True
    return h.month == 12 and h.day == 31 and f"before {h.year + 1}" in q


def _select(markets, h, end_of, live, q_ok):
    """(markets at H, display market if none at H). Display = earliest open contract after H."""
    lo, hi = _horizon_window(h)
    at_h = [m for m in markets if lo <= end_of(m) <= hi and q_ok(m)]
    if at_h:
        return at_h, None
    later = sorted((m for m in markets if live(m) and end_of(m) > hi), key=end_of)
    return [], (later[0] if later else None)


def _pm_reading(entry, event, m, read_at):
    return make_reading(
        cls=entry["cls"], venue="Polymarket", question=m["question"], slug=event,
        url=f"https://polymarket.com/event/{event}", api_url=GAMMA.format(event),
        resolution_date=m["endDate"], bid=_dec(m.get("bestBid")), ask=_dec(m.get("bestAsk")),
        liq=D(str(m.get("liquidity") or 0)), vol=D(str(m.get("volume") or 0)), liq_label="liquidity_usd",
        invert=entry.get("invert", False), same_event=entry.get("same_event"), note=entry.get("note"),
        closed=bool(m.get("closed")), read_at=read_at, last_trade=_dec(m.get("lastTradePrice")))


def _kalshi_reading(entry, event, m, read_at):
    url = KALSHI.format(event)
    return make_reading(
        cls=entry["cls"], venue="Kalshi", question=m["title"], slug=m["ticker"], url=url, api_url=url,
        resolution_date=m["close_time"], bid=_dec(m.get("yes_bid_dollars")), ask=_dec(m.get("yes_ask_dollars")),
        liq=D(str(m.get("open_interest_fp") or 0)), vol=D(str(m.get("volume_fp") or 0)),
        liq_label="open_interest_usd", invert=entry.get("invert", False), same_event=entry.get("same_event"),
        note=entry.get("note"), closed=m.get("status") not in ("active", "open"), read_at=read_at,
        last_trade=_dec(m.get("last_price_dollars")))


def load_readings(evidence_dir, horizon, read_at_override=None):
    """Registry x saved snapshots -> readings (one per contract) and 'missing' markers. No network."""
    mpath = os.path.join(evidence_dir, "manifest.json")
    manifest = read_json(mpath) if os.path.exists(mpath) else {"files": {}}
    out = []
    for entry in REGISTRY:
        venue, cls = entry["venue"], entry["cls"]
        event = event_for(entry, horizon)
        if event is None:
            out.append(dict(missing="unconfigured", cls=cls, venue=venue,
                            reason=f"{cls}: registry has no {venue} event configured for horizon {horizon}"))
            continue
        rel = evidence_rel(venue, event)
        path = os.path.join(evidence_dir, rel)
        if not os.path.exists(path):
            out.append(dict(missing="absent", cls=cls, venue=venue, reason=f"{cls}: no snapshot for {venue} {event}"))
            continue
        read_at = (read_at_override or {}).get(venue) or manifest["files"].get(rel, {}).get("read_at")
        if not read_at:
            raise ValueError(f"no read_at for {rel} (manifest missing and no override)")
        data = read_json(path)
        if venue == "Polymarket":
            markets = data[0].get("markets", []) if isinstance(data, list) and data else []
            end_of = lambda m: parse_ts(m["endDate"]) if m.get("endDate") else dt.datetime.min.replace(tzinfo=dt.timezone.utc)  # noqa: E731
            live = lambda m: not m.get("closed")  # noqa: E731
            q_ok = lambda m: _pm_question_matches(m.get("question", ""), horizon)  # noqa: E731
            mk = _pm_reading
        else:
            markets = (data.get("event") or {}).get("markets") or data.get("markets") or []
            end_of = lambda m: parse_ts(m["close_time"])  # noqa: E731
            live = lambda m: m.get("status") in ("active", "open")  # noqa: E731
            q_ok = lambda m: True  # noqa: E731
            mk = _kalshi_reading
        if not markets:
            out.append(dict(missing="empty", cls=cls, venue=venue, reason=f"{cls}: {venue} {event} returned no markets"))
            continue
        at_h, display = _select(markets, horizon, end_of, live, q_ok)
        if at_h:
            for m in at_h:
                r = mk(entry, event, m, read_at)
                if len(at_h) > 1:
                    r["extra_fail"] = f"ambiguous: {len(at_h)} contracts match horizon"
                out.append(r)
        elif display is not None:
            r = mk(entry, event, display, read_at)
            r["horizon_ok"] = False
            resolves = (parse_ts(r["resolution_date"]) - dt.timedelta(hours=6)).date()
            auto = f"resolves {resolves}; no {MONTHS[horizon.month - 1][:3]} contract"
            r["note"] = f"{r['note']}; {auto}" if r["note"] else auto
            out.append(r)
        else:
            out.append(dict(missing="no_open_contract", cls=cls, venue=venue,
                            reason=f"{cls}: {venue} {event} has no contract at {horizon} and no open later contract"))
    return out


# -------------------------------------------------------------------------------------- the method
def hamilton(vals):
    """Largest remainder on percentages; ties -> larger raw value, then D, C, A, B (method §1.8)."""
    pct = {k: v * 100 for k, v in vals.items()}
    fl = {k: int(v.to_integral_value(rounding=ROUND_FLOOR)) for k, v in pct.items()}
    left = 100 - sum(fl.values())
    order = sorted(pct, key=lambda k: (-(pct[k] - fl[k]), -pct[k], "DCAB".index(k)))
    for k in order[:left]:
        fl[k] += 1
    return fl, pct


def _hamilton_rule(pct, ints):
    fl = {k: int(v.to_integral_value(rounding=ROUND_FLOOR)) for k, v in pct.items()}
    rem = {k: pct[k] - fl[k] for k in pct}
    left = 100 - sum(fl.values())
    order = sorted(pct, key=lambda k: (-rem[k], -pct[k], "DCAB".index(k)))
    head = (f"Hamilton rounding (method 1.8): {'/'.join(fmt_pct(pct[k]) for k in CORE)} -> floors "
            f"{'/'.join(str(fl[k]) for k in CORE)} (sum {sum(fl.values())}); ")
    if left == 0:
        return head + "floors already sum to 100"
    winners = order[:left]
    if left < len(order) and rem[order[left - 1]] == rem[order[left]]:
        r = rem[order[left - 1]]
        tie = sorted(k for k in pct if rem[k] == r)
        tie_win = [k for k in winners if k in tie]
        tie_lose = [k for k in tie if k not in tie_win]
        pre = [k for k in winners if k not in tie]
        names = tie[0] if len(tie) == 1 else ", ".join(tie[:-1]) + " and " + tie[-1]
        by_raw = all(pct[w] > pct[x] for w in tie_win for x in tie_lose)
        decider = (f"{' and '.join(tie_win)} {'has' if len(tie_win) == 1 else 'have'} the larger raw value"
                   if by_raw else "order D, C, A, B breaks the tie")
        txt = (f"{', '.join(pre)} take{'s' if len(pre) == 1 else ''} the largest remainder; " if pre else "")
        return head + txt + (f"{names} tie on remainder {format(r.normalize(), 'f')}; {decider} -> "
                             + ", ".join(f"{k} = {ints[k]}" for k in tie_win))
    return head + "largest remainder(s): " + ", ".join(f"{k} = {ints[k]}" for k in winners)


def _evaluate(p):
    p = dict(p)
    has_quote = p["bid"] is not None and p["ask"] is not None
    p["mid"] = (p["bid"] + p["ask"]) / 2 if has_quote else None
    p["spread"] = (p["ask"] - p["bid"]) if has_quote else None
    p["prob"] = (1 - p["mid"]) if (p["invert"] and p["mid"] is not None) else p["mid"]
    fails = []
    if not p["horizon_ok"]:
        fails.append("horizon")
    if p.get("closed"):
        fails.append("market closed at read time (resolved or halted)")
    if p.get("extra_fail"):
        fails.append(p["extra_fail"])
    if p["mid"] is None:
        fails.append("no two-sided quote")
    elif p["spread"] > MAX_SPREAD:
        fails.append(f"spread {p['spread']}")
    if p["liq"] < FLOOR_LIQ:
        fails.append(f"{p['liq_label']} {fmt_usd(p['liq'])}<10000")
    if p["vol"] < FLOOR_VOL:
        fails.append(f"volume {fmt_usd(p['vol'])}<10000")
    p["passes"] = not fails
    p["fail_reasons"] = fails
    return p


def _input_row(p):
    prob, transform = p["prob"], p["note"] or None
    if prob is None and p.get("last_trade") is not None:
        prob = (1 - p["last_trade"]) if p["invert"] else p["last_trade"]
        extra = "no two-sided quote; probability = last trade, display only"
        transform = f"{transform}; {extra}" if transform else extra
    return {"venue": p["venue"], "question": p["question"], "resolution_date": p["resolution_date"],
            "probability": float(prob) if prob is not None else None,
            "yes_bid": float(p["bid"]) if p["bid"] is not None else None,
            "yes_ask": float(p["ask"]) if p["ask"] is not None else None,
            "liquidity": f"{p['liq_label']}={p['liq']:.0f}; volume_usd={p['vol']:.0f}",
            "url": p["url"], "api_url": p.get("api_url") or p["url"], "read_at": p["read_at"],
            "scenario_class": p["cls"], "used": p["passes"],
            "excluded_reason": "; ".join(p["fail_reasons"]) or None, "transform": transform}


def compute(readings, horizon, conflict_day):
    """Pure method: readings -> numbers, verdict, full input table. Decimal arithmetic throughout."""
    missing = [r for r in readings if r.get("missing")]
    P = [_evaluate(r) for r in readings if not r.get("missing")]
    frozen, caveats, info = [], [], []

    rows, kept = [], []
    for p in P:
        row = _input_row(p)
        if row["probability"] is None:
            caveats.append(f"{p['cls']}: {p['venue']} '{p['question']}' has no quote or last trade; omitted from inputs")
            continue
        rows.append(row)
        kept.append((p, row))

    def class_prob(cls):
        ok = [p for p in P if p["cls"] == cls and p["passes"]]
        if not ok:
            return None, {}, None
        groups = {}
        for p in ok:
            key = f"same-event:{p['same_event']}" if p.get("same_event") else p["slug"] + "|" + p["question"]
            groups.setdefault(key, []).append(p)
        ev = {k: sum(WEIGHT[x["venue"]] * x["prob"] for x in g) / sum(WEIGHT[x["venue"]] for x in g)
              for k, g in groups.items()}
        best = max(ev, key=lambda k: ev[k])
        return ev[best], ev, groups[best]

    a, aev, a_src = class_prob("A")
    d, _, d_src = class_prob("D")
    c_raw, _, c_src = class_prob("C")
    e, _, e_src = class_prob("E")

    for cls, v in (("A", a), ("D", d)):
        if v is None:
            frozen.append(f"{cls}: no market reading — residual/zero by rule; core scenario unmeasured (method 1.9)")
    h = aev.get("same-event:HORMUZ_NORMAL")
    gate = {"hormuz_normal": None if h is None else str(h), "threshold": str(HORMUZ_GATE)}
    if c_raw is None:
        c = D(0)
        caveats.append("C: no market reading — zero by rule (method 1.9)")
        gate_rule = "C: no proxy passes the floor -> 0 (method 1.9)"
    elif h is None:
        c = D(0)
        caveats.append("C: Hormuz gate cannot be evaluated (no qualifying Hormuz-normal reading) -> C = 0")
        gate_rule = ("Hormuz gate (method 1.5 C): no qualifying Hormuz-normal reading, gate cannot be "
                     "evaluated -> C = 0 (flagged)")
    elif 1 - h >= HORMUZ_GATE:
        c = c_raw
        gate_rule = (f"Hormuz gate (method 1.5 C): P(not normal by H) = 1 - {fmt3(h)} = {fmt3(1 - h)} >= 0.90, "
                     f"so C = P(Bab el-Mandeb closed)")
    else:
        c = c_raw * (1 - h)
        caveats.append(f"C: Hormuz gate fallback (P(not normal) = {fmt3(1 - h)} < 0.90): independence assumed")
        gate_rule = (f"Hormuz gate (method 1.5 C): P(not normal by H) = 1 - {fmt3(h)} = {fmt3(1 - h)} < 0.90, "
                     f"so C = P(Bab el-Mandeb closed) x P(not normal) = {fmt3(c_raw)} x {fmt3(1 - h)} = {fmt3(c)} "
                     f"(independence assumed, flagged)")
    gate["rule"] = gate_rule

    a0, d0 = a or D(0), d or D(0)
    overflow = a0 + c + d0 > 1
    Dv = min(d0, D(1))
    Cv = min(c, 1 - Dv)
    Av = min(a0, 1 - Dv - Cv)
    Bv = 1 - Av - Cv - Dv
    if overflow:
        frozen.append(f"a+c+d = {fmt3(a0 + c + d0)} > 1: residual B would be negative; precedence D > C > A > B "
                      f"applied for audit only (job spec: {OVERFLOW_VERDICT}; method 1.7/1.9 alone would publish with a flag)")

    for p in P:
        if p["horizon_ok"] and p.get("closed"):
            msg = f"{p['cls']}: '{p['question']}' ({p['venue']}) is closed at H — resolved or halted; operator review"
            (frozen if p["cls"] in CORE else caveats).append(msg)
        if p.get("extra_fail", "") and p["extra_fail"].startswith("ambiguous"):
            msg = f"{p['cls']}: {p['venue']} {p['slug']}: {p['extra_fail']}"
            if msg not in frozen + caveats:
                (frozen if p["cls"] in CORE else caveats).append(msg)
    for m in missing:
        if m["missing"] == "unconfigured":
            caveats.append(m["reason"])
        else:
            (frozen if m["cls"] in CORE else caveats).append(m["reason"])

    ints, raw = hamilton({"A": Av, "B": Bv, "C": Cv, "D": Dv})
    E_int = int((e * 100).to_integral_value(rounding=ROUND_HALF_UP)) if e is not None else None

    verdict = "KEEP_FROZEN" if frozen else ("PUBLISH_WITH_FLAG" if caveats else "PUBLISH")

    e_rows = [row for p, row in kept if p["cls"] == "E"]
    if e is None:
        if e_rows:
            e_reason = ("No E proxy passes the quality floor (method 1.5 E / 1.9): "
                        + "; ".join(f"'{r['question']}' fails {r['excluded_reason']}" for r in e_rows)
                        + "; observed mid is display-only.")
        else:
            e_reason = "No E market is listed for the horizon (method 1.5 E / 1.9); E is unmeasured."
        info.append(f"E NULL: {e_reason}")
    else:
        e_reason = None
    info.append("J1 ratified by operator 2026-10-06: a ceasefire-breaking US/Israeli strike counts toward D")
    venues = {cls: sorted({x["venue"] for x in src}) for cls, src in (("A", a_src), ("C", c_src), ("D", d_src)) if src}
    if venues and len({v for vs in venues.values() for v in vs}) == 1:
        only = next(iter(venues.values()))[0]
        info.append(f"single venue: {', '.join(sorted(venues))} maxima all come from {only}")
    roll, nxt = next_roll(horizon)
    info.append(f"horizon {horizon}; roll to {nxt} on {roll} will step the panel")

    raw_float = {k: float(v) for k, v in raw.items()}
    result = {
        "conflict_day": conflict_day, "scenario_a": ints["A"], "scenario_b": ints["B"], "scenario_c": ints["C"],
        "scenario_d": ints["D"], "scenario_e": E_int, "method_version": METHOD_VERSION,
        "horizon_end": horizon.isoformat(), "inputs": rows, "verdict": verdict,
        "flags": frozen + caveats + info, "raw_percent": raw_float,
        "computed": {"A": ints["A"], "B": ints["B"], "C": ints["C"], "D": ints["D"], "E": E_int,
                     "raw_percent": raw_float, "verdict": verdict, "horizon_end": horizon.isoformat(),
                     "class_probabilities": {"A": None if a is None else str(a), "C_raw": None if c_raw is None else str(c_raw),
                                             "C": str(c), "D": None if d is None else str(d),
                                             "E": None if e is None else str(e)},
                     "hormuz_gate": gate, "overflow": overflow,
                     "verdict_reasons": frozen + caveats},
        "_internal": {"kept": kept, "values": {"A": Av, "B": Bv, "C": Cv, "D": Dv}, "raw": raw, "ints": ints,
                      "gate_rule": gate_rule, "e_reason": e_reason, "e": e},
    }
    return result


def public_result(result):
    return {k: v for k, v in result.items() if not k.startswith("_")}


def build_daily_rows(result, scenario_ids, run_id):
    """One scenario_daily row per scenario code in scenario_ids (A-E), inputs = the basis of THAT number."""
    it = result["_internal"]
    kept, vals, raw, ints = it["kept"], it["values"], it["raw"], it["ints"]
    ham = _hamilton_rule(raw, ints)
    fractional = {k for k in CORE if raw[k] != raw[k].to_integral_value(rounding=ROUND_FLOOR)}
    ham_el = {"from": list(CORE), "kind": "derived", "rule": ham}
    cls_rows = lambda cls: [row for p, row in kept if p["cls"] == cls]  # noqa: E731
    inputs = {}
    inputs["A"] = cls_rows("A") + ([ham_el] if "A" in fractional else [])
    inputs["B"] = [{"from": ["A", "C", "D"], "kind": "derived",
                    "rule": (f"B = 1 - a - c - d = 1 - {fmt3(vals['A'])} - {fmt3(vals['C'])} - {fmt3(vals['D'])} = "
                             f"{fmt3(vals['B'])} (method 1.7 residual; a+c+d <= 1, no precedence)"
                             if not result["computed"]["overflow"] else
                             "B = 0 after precedence D > C > A > B (a+c+d > 1; method 1.7)")}] + \
        ([ham_el] if "B" in fractional else [])
    gate_rows = [dict(row, role="gate") for p, row in kept if p.get("same_event") == "HORMUZ_NORMAL"]
    gate_from = ["HORMUZ_NORMAL"] if gate_rows else ["C"]
    inputs["C"] = cls_rows("C") + gate_rows + [{"from": gate_from, "kind": "derived", "rule": it["gate_rule"]}] + \
        ([ham_el] if "C" in fractional else [])
    inputs["D"] = cls_rows("D") + ([ham_el] if "D" in fractional else [])
    inputs["E"] = cls_rows("E") or [{"from": ["E"], "kind": "derived", "rule": it["e_reason"] or "no E market"}]
    prob = {"A": ints["A"], "B": ints["B"], "C": ints["C"], "D": ints["D"], "E": result["scenario_e"]}
    praw = {k: float(raw[k]) for k in CORE}
    praw["E"] = float(it["e"] * 100) if it["e"] is not None else None
    rows = []
    for code in ("A", "B", "C", "D", "E"):
        if code not in scenario_ids:
            continue
        rows.append({"scenario_id": scenario_ids[code], "conflict_day": result["conflict_day"],
                     "method_version": result["method_version"], "run_id": run_id,
                     "probability": prob[code], "probability_raw": praw[code],
                     "null_reason": it["e_reason"] if (code == "E" and prob[code] is None) else None,
                     "inputs": inputs[code], "horizon_end": result["horizon_end"], "is_published": False})
    return rows


def build_run_row(result, run_id, code_ref, evidence_ref, read_started, read_finished):
    return {"id": run_id, "conflict_day": result["conflict_day"], "method_version": result["method_version"],
            "horizon_end": result["horizon_end"], "read_started_at": read_started, "read_finished_at": read_finished,
            "code_ref": code_ref, "evidence_ref": evidence_ref, "inputs": result["inputs"],
            "computed": result["computed"], "verdict": result["verdict"], "flags": result["flags"],
            "created_by": "github-actions:scenario-daily"}


# ----------------------------------------------------------------------------------------- database
class DBError(RuntimeError):
    pass


class DB:
    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json",
                  "Accept": "application/json"}

    def get(self, path):
        st, raw = http_request("GET", self.base + path, headers=self.h)
        if st != 200:
            raise DBError(f"GET {path.split('?')[0]} -> HTTP {st}: {raw[:300]!r}")
        return json.loads(raw or b"null")

    def post(self, path, payload, minimal=True):
        h = dict(self.h, Prefer="return=minimal") if minimal else self.h
        st, raw = http_request("POST", self.base + path, headers=h, body=json.dumps(payload))
        if st not in (200, 201, 204):
            raise DBError(f"POST {path} -> HTTP {st}: {raw[:500]!r}")
        return json.loads(raw) if raw else None


def live_codes(scenarios, day):
    live = {}
    for s in scenarios:
        if s["status"] != "retired" and s["born_day"] <= day and (s["retired_day"] is None or day < s["retired_day"]):
            live[s["code"]] = s
    return live


# ---------------------------------------------------------------------------------------------- main
def _code_ref():
    sha = os.environ.get("GITHUB_SHA") or "uncommitted-local"
    repo = os.environ.get("GITHUB_REPOSITORY", "rzjy54n5sh-rgb/OSINT")
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    return (f"{server}/{repo}/blob/{sha}/{SCRIPT_REL} git {sha} sha256:{sha256_file(os.path.abspath(__file__))} "
            f"({METHOD_VERSION}; deterministic, no model API)")


def _evidence_ref(evidence_dir, manifest, artifact):
    server = os.environ.get("GITHUB_SERVER_URL", "https://github.com")
    repo = os.environ.get("GITHUB_REPOSITORY", "rzjy54n5sh-rgb/OSINT")
    run = os.environ.get("GITHUB_RUN_ID")
    where = f"{server}/{repo}/actions/runs/{run}" if run else "local run (no Actions run id)"
    venues = sorted({m["venue"] for m in manifest["files"].values()})
    return (f"GitHub Actions run {where} artifact '{artifact}' (raw {', '.join(venues)} API JSON, "
            f"{len(manifest['files'])} files, retention 90 days) manifest.json sha256:"
            f"{sha256_file(os.path.join(evidence_dir, 'manifest.json'))}")


def _summary(result):
    r = result
    print(f"[scenario_daily] Day {r['conflict_day']} horizon {r['horizon_end']} method {r['method_version']}")
    print(f"[scenario_daily] A={r['scenario_a']} B={r['scenario_b']} C={r['scenario_c']} D={r['scenario_d']} "
          f"E={r['scenario_e']}  raw={r['raw_percent']}  verdict={r['verdict']}")
    for f in r["flags"]:
        print(f"  flag: {f}")
    for i in r["inputs"]:
        print(f"  [{i['scenario_class']}] {'USED' if i['used'] else 'EXCL'} {i['venue']:10} {i['question'][:72]:72} "
              f"p={i['probability']} bid/ask={i['yes_bid']}/{i['yes_ask']} {i['excluded_reason'] or ''}")


def cmd_fetch(args):
    now = utc_now()
    manifest, failures = fetch_evidence(args.out, now)
    print(f"[scenario_daily] fetch Day {manifest['conflict_day']} horizon {manifest['horizon_end']}: "
          f"{len(manifest['files'])} files saved to {args.out}")
    for u in manifest["unconfigured"]:
        print(f"::warning::{u['reason']}")
    if failures:
        for f in failures:
            print(f"::error::fetch failed {f['url']} status={f['status']} {f['error']}")
        return 1
    return 0


def cmd_run(args):
    today = utc_now().date()
    day = conflict_day_for(today)
    manifest = read_json(os.path.join(args.evidence, "manifest.json"))
    if args.day is not None and args.day != day:
        print(f"::error::DAY LOCK: --day {args.day} is not today (Day {day}); refusing")
        return 2
    if manifest["conflict_day"] != day:
        print(f"::error::DAY LOCK: evidence is for Day {manifest['conflict_day']}, today is Day {day}; refusing")
        return 2
    horizon = horizon_for(parse_ts(manifest["read_started_at"]).date())
    if horizon.isoformat() != manifest["horizon_end"]:
        print(f"::error::evidence horizon {manifest['horizon_end']} != method horizon {horizon}; refusing")
        return 2
    if manifest.get("failures"):
        print("::error::evidence has fetch failures; refusing to compute on an incomplete snapshot")
        return 2

    url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
    db = DB(url, key) if url and key else None
    if db is None and not args.dry_run:
        print("::error::SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
        return 1
    try:
        live = None
        if db:
            pub = db.get(f"scenario_daily?conflict_day=eq.{day}&is_published=is.true"
                         f"&select=id,run_id,method_version&limit=5")
            if pub:
                print(f"[scenario_daily] Day {day} already has a published reading "
                      f"({pub[0].get('method_version')}, run {pub[0].get('run_id')}); nothing to do (idempotent)")
                return 0
            ovr = db.get(f"scenario_overrides?kind=eq.input&valid_from_day=lte.{day}"
                         f"&or=(valid_to_day.is.null,valid_to_day.gte.{day})&select=id,kind,reason")
            if ovr:
                print(f"::error::input override(s) {[o['id'] for o in ovr]} active for Day {day}; this job does "
                      f"not apply input overrides — operator must run the override computation")
                return 3
            live = live_codes(db.get("scenarios?select=id,code,group_code,status,born_day,retired_day"), day)
            core_live = {c for c, s in live.items() if s["group_code"] == "core"}
            if core_live != set(CORE):
                print(f"::error::live core scenarios {sorted(core_live)} != method {METHOD_VERSION} set A-D; refusing")
                return 4

        readings = load_readings(args.evidence, horizon)
        result = compute(readings, horizon, day)
        _summary(result)
        run_id = str(uuid.uuid4())
        run_row = build_run_row(result, run_id, _code_ref(), _evidence_ref(args.evidence, manifest, args.artifact_name),
                                manifest["read_started_at"], manifest["read_finished_at"])
        ids = {c: s["id"] for c, s in live.items() if c in ("A", "B", "C", "D", "E")} if live else \
            {c: f"<scenario {c} id>" for c in "ABCDE"}
        rows = build_daily_rows(result, ids, run_id) if result["verdict"] != "KEEP_FROZEN" else []

        if args.dry_run:
            print("[scenario_daily] DRY RUN — would write:")
            print("POST scenario_runs " + json.dumps(run_row, indent=1)[:20000])
            if result["verdict"] == "KEEP_FROZEN":
                print("[scenario_daily] verdict KEEP_FROZEN: would publish nothing")
            else:
                print("POST scenario_daily " + json.dumps(rows, indent=1)[:20000])
                print(f"POST rpc/scenario_publish_run {{'p_run_id': '{run_id}', 'p_supersede_override': false}}")
                print(f"POST rpc/scenario_lifecycle_tick {{'p_as_of_day': {day}, 'p_job': '{JOB_NAME}'}}")
            return 0

        db.post("scenario_runs", run_row)
        print(f"[scenario_daily] scenario_runs {run_id} written (verdict {result['verdict']})")
        if result["verdict"] == "KEEP_FROZEN":
            print(f"[scenario_daily] KEEP_FROZEN — Day {day} run recorded, nothing published: "
                  + " | ".join(result["computed"]["verdict_reasons"]))
            return 0
        db.post("scenario_daily", rows)
        print(f"[scenario_daily] {len(rows)} scenario_daily rows written (unpublished)")
        n = db.post("rpc/scenario_publish_run", {"p_run_id": run_id, "p_supersede_override": False}, minimal=False)
        if n != len(rows):
            raise DBError(f"scenario_publish_run published {n} rows, expected {len(rows)}")
        print(f"[scenario_daily] published {n} rows for Day {day}")
        tick = db.post("rpc/scenario_lifecycle_tick", {"p_as_of_day": day, "p_job": JOB_NAME}, minimal=False)
        print(f"[scenario_daily] lifecycle tick: {tick or 'no transitions'}")
        return 0
    except DBError as e:
        print(f"::error::write failed: {e}")
        return 1


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    sub = ap.add_subparsers(dest="cmd", required=True)
    f = sub.add_parser("fetch")
    f.add_argument("--out", required=True)
    r = sub.add_parser("run")
    r.add_argument("--evidence", required=True)
    r.add_argument("--artifact-name", default="scenario-evidence")
    r.add_argument("--dry-run", action="store_true")
    r.add_argument("--day", type=int)
    args = ap.parse_args(argv)
    return cmd_fetch(args) if args.cmd == "fetch" else cmd_run(args)


if __name__ == "__main__":
    sys.exit(main())
