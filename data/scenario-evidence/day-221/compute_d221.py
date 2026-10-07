"""market-anchored-v1 scenario mapping. Reads saved raw API snapshots; no network.
Usage: python3 -I compute_d221.py <evidence_dir> <out_json>"""
import json, sys, os
from decimal import Decimal as D, ROUND_FLOOR

EV = sys.argv[1]; OUT = sys.argv[2]
FLOOR_LIQ = D(10000); FLOOR_VOL = D(10000); MAX_SPREAD = D("0.05")
HORIZON = "2026-10-31"

def pm(slug, question):
    e = json.load(open(os.path.join(EV, "ev", slug + ".json")))[0]
    m = next(x for x in e["markets"] if x["question"] == question)
    return dict(venue="Polymarket", question=question, slug=slug,
                url=f"https://polymarket.com/event/{slug}", api_url=f"https://gamma-api.polymarket.com/events?slug={slug}",
                resolution_date=m["endDate"], bid=D(str(m["bestBid"])) if m["bestBid"] is not None else None,
                ask=D(str(m["bestAsk"])) if m["bestAsk"] is not None else None,
                liq=D(str(m.get("liquidity") or 0)), vol=D(str(m.get("volume") or 0)),
                liq_label="liquidity_usd", api_updated=m.get("updatedAt"))

def ks(event, ticker):
    e = json.load(open(os.path.join(EV, "other", f"k_{event}.json")))["event"]
    m = next(x for x in e["markets"] if x["ticker"] == ticker)
    return dict(venue="Kalshi", question=m["title"], slug=ticker,
                url=f"https://api.elections.kalshi.com/trade-api/v2/events/{event}?with_nested_markets=true",
                resolution_date=m["close_time"], bid=D(m["yes_bid_dollars"]), ask=D(m["yes_ask_dollars"]),
                liq=D(m["open_interest_fp"]), vol=D(m["volume_fp"]), liq_label="open_interest_usd",
                api_updated=None)

READ_AT = {"Polymarket": "2026-10-06T16:10:53Z", "Kalshi": "2026-10-06T16:14:47Z"}

# ---- proxy registry: (class, invert, horizon_match, input) ----
P = []
def add(cls, inp, invert=False, horizon_ok=True, note=""):
    inp.update(cls=cls, invert=invert, horizon_ok=horizon_ok, note=note); P.append(inp)

add("A", pm("us-announces-end-of-iranian-blockade-byptptpt-20260713152715080", "US announces end of Iranian blockade by October 31, 2026?"))
add("A", pm("us-iran-hormuz-agreement-byptptpt-20260803235957575", "US-Iran Hormuz Agreement by October 31?"))
add("A", pm("us-iran-final-nuclear-deal-by-20260621201254412", "US-Iran Final Nuclear Deal by October 31, 2026?"))
add("A", ks("KXUSAIRANAGREEMENT-27", "KXUSAIRANAGREEMENT-27-26NOV"))
add("A", pm("strait-of-hormuz-traffic-returns-to-normal-by-october-31-20260810151043583", "Strait of Hormuz traffic returns to normal by October 31?"), note="same-event:HORMUZ_NORMAL")
add("A", ks("KXHORMUZNORM-26MAR17", "KXHORMUZNORM-26MAR17-B261101"), note="same-event:HORMUZ_NORMAL")
add("D", pm("us-iran-ceasefire-continues-throughptptpt", "US x Iran ceasefire continues through October 31?"), invert=True, note="P(US strike on Iran) = 1 - P(ceasefire holds)")
add("D", pm("israel-x-iran-ceasefire-continues-throughptptpt-20260716224448963", "Israel x Iran ceasefire continues through October 31?"), invert=True, note="P(Israel/Iran strike) = 1 - P(ceasefire holds)")
add("D", pm("kharg-island-no-longer-under-iranian-control-by-march-31", "Kharg Island no longer under Iranian control by October 31?"))
add("D", pm("saudi-arabia-military-action-against-iran-by-20260916", "Saudi Arabia military action against Iran by October 31, 2026?"))
add("D", pm("will-the-us-invade-iran-before-2027", "Will the U.S. invade Iran before 2027?"), horizon_ok=False, note="resolves 2026-12-31; no Oct contract")
add("D", pm("israel-ground-operation-in-iran-confirmed-by", "Will Israel launch a ground operation in Iran by December 31, 2026?"), horizon_ok=False, note="resolves 2026-12-31; no Oct contract")
add("C", pm("bab-el-mandeb-strait-effectively-closed-by", "Bab el-Mandeb Strait effectively closed by October 31?"))
add("E", pm("will-iran-target-united-arab-emirates-byptptpt-20260907", "Will Iran target the United Arab Emirates by October 31, 2026?"))

WEIGHT = {"Polymarket": D(1), "Kalshi": D(1), "PredictIt": D(1), "Metaculus": D("0.5"), "GJOpen": D("0.5"), "Manifold": D("0.2")}

for p in P:
    p["mid"] = (p["bid"] + p["ask"]) / 2 if p["bid"] is not None and p["ask"] is not None else None
    p["spread"] = (p["ask"] - p["bid"]) if p["mid"] is not None else None
    p["prob"] = (1 - p["mid"]) if (p["invert"] and p["mid"] is not None) else p["mid"]
    fails = []
    if not p["horizon_ok"]: fails.append("horizon")
    if p["mid"] is None: fails.append("no two-sided quote")
    else:
        if p["spread"] > MAX_SPREAD: fails.append(f"spread {p['spread']}")
    if p["liq"] < FLOOR_LIQ: fails.append(f"{p['liq_label']} {p['liq']:.0f}<10000")
    if p["vol"] < FLOOR_VOL: fails.append(f"volume {p['vol']:.0f}<10000")
    p["passes"] = not fails; p["fail_reasons"] = fails

def class_prob(cls):
    ok = [p for p in P if p["cls"] == cls and p["passes"]]
    if not ok: return None, []
    groups = {}
    for p in ok:
        key = p["note"] if p["note"].startswith("same-event:") else p["slug"]
        groups.setdefault(key, []).append(p)
    ev = {}
    for k, g in groups.items():
        w = sum(WEIGHT[x["venue"]] for x in g)
        ev[k] = sum(WEIGHT[x["venue"]] * x["prob"] for x in g) / w
    best = max(ev, key=lambda k: ev[k])
    return ev[best], [(k, ev[k]) for k in ev]

a, aev = class_prob("A"); d, dev = class_prob("D"); c_raw, cev = class_prob("C"); e, eev = class_prob("E")
hormuz_closed = 1 - dict(aev)["same-event:HORMUZ_NORMAL"]
c = c_raw if hormuz_closed >= D("0.90") else c_raw * hormuz_closed
a = a or D(0); d = d or D(0); c = c or D(0)
# precedence D > C > A > B if overflow
Dv = min(d, D(1)); Cv = min(c, 1 - Dv); Av = min(a, 1 - Dv - Cv); Bv = 1 - Av - Cv - Dv

def hamilton(vals):  # vals: dict name->Decimal fraction
    pct = {k: v * 100 for k, v in vals.items()}
    fl = {k: int(v.to_integral_value(rounding=ROUND_FLOOR)) for k, v in pct.items()}
    left = 100 - sum(fl.values())
    order = sorted(pct, key=lambda k: (-(pct[k] - fl[k]), -pct[k], "DCAB".index(k)))
    for k in order[:left]: fl[k] += 1
    return fl, pct

ints, raw = hamilton({"A": Av, "B": Bv, "C": Cv, "D": Dv})
E_int = int((e * 100).to_integral_value()) if e is not None else None

out = {"conflict_day": 221, "scenario_a": ints["A"], "scenario_b": ints["B"], "scenario_c": ints["C"],
       "scenario_d": ints["D"], "scenario_e": E_int, "method_version": "market-anchored-v1",
       "horizon_end": HORIZON,
       "inputs": [{"venue": p["venue"], "question": p["question"], "resolution_date": p["resolution_date"],
                   "probability": float(p["prob"]) if p["prob"] is not None else None,
                   "yes_bid": float(p["bid"]) if p["bid"] is not None else None,
                   "yes_ask": float(p["ask"]) if p["ask"] is not None else None,
                   "liquidity": f"{p['liq_label']}={p['liq']:.0f}; volume_usd={p['vol']:.0f}",
                   "url": p["url"], "api_url": p.get("api_url", p["url"]), "read_at": READ_AT[p["venue"]], "scenario_class": p["cls"],
                   "used": p["passes"], "excluded_reason": "; ".join(p["fail_reasons"]) or None,
                   "transform": p["note"] or None} for p in P],
       "verdict": "PUBLISH"}
json.dump(out, open(OUT, "w"), indent=2)
print("class event probs  A:", aev, "\n D:", dev, "\n C:", cev, "\n E:", eev)
print("hormuz_closed =", hormuz_closed, "-> C gate", "PASS" if hormuz_closed >= D("0.90") else "FAIL")
print("raw pct:", {k: str(v) for k, v in raw.items()})
print("ints:", ints, "E:", E_int)
for p in P: print(f"  [{p['cls']}] {'USED' if p['passes'] else 'EXCL'} {p['venue']:10} {p['question'][:70]:70} mid={p['mid']} prob={p['prob']} {p['fail_reasons']}")
