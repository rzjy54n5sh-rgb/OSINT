#!/usr/bin/env python3
"""Recompute Chokepoint Weekly traffic figures from IMF PortWatch (Daily_Chokepoints_Data).

Usage:  python3 -I pw_week.py [WEEK_END_SUNDAY e.g. 2026-10-11]
Prints, per lane: latest complete Mon-Sun week (or the requested one), n_total, n_container,
week-on-week change, traffic index vs the fixed 2023 baseline (weekly_spec.md 3.1) and the traffic band.
Citation required wherever numbers are used: "Sources: UN Global Platform; IMF PortWatch (portwatch.imf.org)."
Licence status: USE-PROVISIONAL (see licence_check.md row 4).
"""
import json, sys, urllib.request, datetime as dt

BASE = "https://services9.arcgis.com/weJ1QsnbMYJlCHdG/arcgis/rest/services/Daily_Chokepoints_Data/FeatureServer/0/query"
LANES = {"chokepoint1": ("Suez Canal", 515.4), "chokepoint4": ("Bab el-Mandeb Strait", 522.1), "chokepoint6": ("Strait of Hormuz", 669.4)}

def fetch(pid, since):
    rows, off = [], 0
    while True:
        q = (f"?where=portid%3D%27{pid}%27%20AND%20date%20%3E%3D%20timestamp%20%27{since}%27"
             f"&outFields=date,n_total,n_container&orderByFields=date%20ASC&returnGeometry=false"
             f"&resultOffset={off}&resultRecordCount=1000&f=json")
        d = json.load(urllib.request.urlopen(BASE + q, timeout=60))
        rows += [f["attributes"] for f in d["features"]]
        if not d.get("exceededTransferLimit"):
            return {dt.date.fromisoformat(r["date"]): r for r in rows}
        off += 1000

def band(t):
    return "NORMAL" if t >= 0.90 else ("ELEVATED" if t >= 0.50 else "DISRUPTED")

def main():
    req = dt.date.fromisoformat(sys.argv[1]) if len(sys.argv) > 1 else None
    since = (dt.date.today() - dt.timedelta(days=60)).isoformat()
    print("retrieved_utc", dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"))
    for pid, (name, basew) in LANES.items():
        s = fetch(pid, since)
        last = max(s)
        end = req or (last - dt.timedelta(days=(last.weekday() + 1) % 7))  # latest Sunday with data
        if end > last:
            print(f"{name}: week ending {end} NOT YET PUBLISHED (latest day {last})"); continue
        def wk(e, k="n_total"):
            return sum(s[x][k] for x in s if e - dt.timedelta(days=6) <= x <= e)
        w, p = wk(end), wk(end - dt.timedelta(days=7))
        t = w / basew
        print(f"{name}: {end - dt.timedelta(days=6)}..{end} total={w} container={wk(end,'n_container')} "
              f"prev={p} wow={(w/p-1)*100:+.1f}% index={t*100:.1f}% band={band(t)} latest_day={last}")

if __name__ == "__main__":
    main()
