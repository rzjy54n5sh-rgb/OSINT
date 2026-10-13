#!/usr/bin/env python3
"""Weekly transit history for the three corridor lanes, from IMF PortWatch (public ArcGIS layer).

Writes data/chokepoints/history.json: the last 12 COMPLETE Monday-Sunday weeks per lane, each
{week_start, week_end, transits, index_pct_of_2023, days}. Nothing is estimated: a week with a
missing day is written with transits = null (gaps stay gaps, never interpolated).

Method (weekly_spec v1, same as data/chokepoints/latest.json):
  transits           = sum of PortWatch n_total over the 7 days Mon-Sun
  index_pct_of_2023  = transits / baseline_week * 100, rounded to 0.1
  baseline_week      = FROZEN weekly_spec baseline (scripts/card/lib/model.mjs BASELINE_WEEK):
                       mean daily n_total 1 Jan - 31 Oct 2023 x 7.
A week is "complete" only when it ends on or before the newest date PortWatch has published for
EVERY lane (all lanes share the same 12 weeks, like the card prints one week).

Licence: PortWatch is USE-PROVISIONAL (licence_check.md row 4). Do not resell the raw series.

Usage:
  python3 scripts/chokepoints/pw_history.py [--out data/chokepoints/history.json]
                                            [--weeks 12] [--check-latest data/chokepoints/latest.json]
  --check-latest: exit 3 if the newest history week covers the same dates as latest.json but the
                  transit counts differ (sanity check against the published Chokepoint Weekly).
Standard library only. Exit 0 ok · 1 network / API error · 2 not enough data · 3 latest.json mismatch.
"""
from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import sys
import urllib.parse
import urllib.request

QUERY_URL = (
    "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/"
    "Daily_Chokepoints_Data/FeatureServer/0/query"
)
LAYER_URL = QUERY_URL.rsplit("/query", 1)[0]

# lane id -> (PortWatch portid, frozen baseline week). Must match scripts/card/lib/model.mjs
# BASELINE_WEEK; tests/unit/corridors.check.ts asserts the written file agrees.
LANES = {
    "suez": ("chokepoint1", 515.4),
    "bam_redsea": ("chokepoint4", 522.1),
    "hormuz": ("chokepoint6", 669.4),
}
SOURCE_CREDIT = "Transits: IMF PortWatch (UN Global Platform), AIS-based"
LICENCE = "USE-PROVISIONAL (licence_check.md row 4). Do not resell the raw series."
PAGE = 2000
TIMEOUT_S = 60


def fetch_daily(portid: str, since: dt.date) -> dict[str, int]:
    """date (YYYY-MM-DD) -> n_total for one chokepoint, from `since` onward. Paginates."""
    out: dict[str, int] = {}
    offset = 0
    while True:
        params = {
            "where": f"portid='{portid}' AND date >= DATE '{since.isoformat()}'",
            "outFields": "date,n_total,portid",
            "orderByFields": "date ASC",
            "resultOffset": str(offset),
            "resultRecordCount": str(PAGE),
            "f": "json",
        }
        url = QUERY_URL + "?" + urllib.parse.urlencode(params)
        req = urllib.request.Request(url, headers={"User-Agent": "mena-intel-desk-pw-history/1"})
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as r:
            body = json.load(r)
        if "error" in body:
            raise RuntimeError(f"ArcGIS error for {portid}: {body['error']}")
        feats = body.get("features") or []
        for f in feats:
            a = f.get("attributes") or {}
            d, n = a.get("date"), a.get("n_total")
            if a.get("portid") != portid or n is None:
                continue
            if isinstance(d, (int, float)):  # epoch ms on older layer versions
                d = dt.datetime.fromtimestamp(d / 1000, dt.timezone.utc).date().isoformat()
            d = str(d)[:10]
            if d in out and out[d] != int(n):
                raise RuntimeError(f"{portid}: two different n_total values for {d}")
            out[d] = int(n)
        if not body.get("exceededTransferLimit") or not feats:
            break
        offset += len(feats)
    return out


def complete_weeks(daily_by_lane: dict[str, dict[str, int]], n_weeks: int) -> list[dt.date]:
    """Mondays of the last `n_weeks` Mon-Sun weeks that end on/before every lane's newest date."""
    newest = min(max(dt.date.fromisoformat(d) for d in days) for days in daily_by_lane.values())
    # newest Sunday <= newest common date
    last_sunday = newest - dt.timedelta(days=(newest.weekday() + 1) % 7)
    last_monday = last_sunday - dt.timedelta(days=6)
    return [last_monday - dt.timedelta(weeks=i) for i in range(n_weeks - 1, -1, -1)]


def build(daily_by_lane: dict[str, dict[str, int]], n_weeks: int, retrieved_at: str) -> dict:
    mondays = complete_weeks(daily_by_lane, n_weeks)
    lanes = []
    for lane, (portid, base) in LANES.items():
        daily = daily_by_lane[lane]
        weeks = []
        for mon in mondays:
            days = [(mon + dt.timedelta(days=i)).isoformat() for i in range(7)]
            present = [daily[d] for d in days if d in daily]
            full = len(present) == 7
            transits = sum(present) if full else None
            weeks.append({
                "week_start": days[0],
                "week_end": days[-1],
                "transits": transits,
                "index_pct_of_2023": round(transits / base * 100, 1) if full else None,
                "days": len(present),
            })
        lanes.append({"lane": lane, "portwatch_portid": portid, "baseline_week": base, "weeks": weeks})
    return {
        "schema": "chokepoints-history/v1",
        "retrieved_at": retrieved_at,
        "written_by": "scripts/chokepoints/pw_history.py",
        "method": (
            "Weekly transits = PortWatch n_total summed Mon-Sun. Index = transits / frozen 2023 baseline week "
            "(mean daily n_total 1 Jan - 31 Oct 2023 x 7) x 100. A week missing any day has transits null; "
            "nothing is interpolated."
        ),
        "source_name": "IMF PortWatch",
        "source_credit": SOURCE_CREDIT,
        "source_home": "https://portwatch.imf.org",
        "source_url": LAYER_URL,
        "licence": LICENCE,
        "weeks": n_weeks,
        "lanes": lanes,
    }


def check_latest(hist: dict, latest_path: str) -> list[str]:
    with open(latest_path, encoding="utf-8") as f:
        latest = json.load(f)
    problems = []
    for l in latest.get("lanes", []):
        h = next((x for x in hist["lanes"] if x["lane"] == l.get("lane")), None)
        if not h:
            continue
        by_start = {w["week_start"]: w for w in h["weeks"]}
        w = by_start.get(l.get("week_start"))
        if w is None:
            problems.append(f"{l['lane']}: latest.json week {l.get('week_start')} is not in the history window")
            continue
        if w["transits"] != l.get("transits_week"):
            problems.append(f"{l['lane']}: history {w['transits']} != latest.json {l.get('transits_week')} for week {w['week_start']}")
        prev_start = (dt.date.fromisoformat(l["week_start"]) - dt.timedelta(weeks=1)).isoformat()
        pw = by_start.get(prev_start)
        if pw is not None and l.get("transits_prev_week") is not None and pw["transits"] != l["transits_prev_week"]:
            problems.append(f"{l['lane']}: history prev week {pw['transits']} != latest.json transits_prev_week {l['transits_prev_week']}")
    return problems


def main() -> int:
    repo = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--out", default=os.path.join(repo, "data", "chokepoints", "history.json"))
    ap.add_argument("--weeks", type=int, default=12)
    ap.add_argument("--check-latest", default=None)
    args = ap.parse_args()

    since = dt.date.today() - dt.timedelta(weeks=args.weeks + 4)
    retrieved_at = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    try:
        daily = {lane: fetch_daily(portid, since) for lane, (portid, _) in LANES.items()}
    except Exception as e:  # network, HTTP, JSON, ArcGIS error: write nothing
        print(f"pw_history: PortWatch query failed, nothing written: {e}", file=sys.stderr)
        return 1
    empty = [lane for lane, d in daily.items() if not d]
    if empty:
        print(f"pw_history: no PortWatch rows for {', '.join(empty)}; nothing written", file=sys.stderr)
        return 2

    hist = build(daily, args.weeks, retrieved_at)
    if args.check_latest:
        problems = check_latest(hist, args.check_latest)
        if problems:
            print("pw_history: MISMATCH with latest.json, nothing written:\n  " + "\n  ".join(problems), file=sys.stderr)
            return 3
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(hist, f, ensure_ascii=False, indent=2)
        f.write("\n")
    first, last = hist["lanes"][0]["weeks"][0], hist["lanes"][0]["weeks"][-1]
    print(f"pw_history: wrote {args.out}: {args.weeks} weeks {first['week_start']} .. {last['week_end']}")
    for l in hist["lanes"]:
        w = l["weeks"][-1]
        print(f"  {l['lane']:<11} newest {w['week_start']}..{w['week_end']}: {w['transits']} transits, {w['index_pct_of_2023']}%")
    return 0


if __name__ == "__main__":
    sys.exit(main())
