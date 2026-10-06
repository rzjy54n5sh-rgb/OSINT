"""
backfill_market_closes.py
Deterministic, keyless, free backfill of true DAILY CLOSES into Supabase `market_data`
for conflict Days 1..N, replacing the random intraday snapshots the 30-minute collector
left behind. No AI / model API is used anywhere.

Day numbering: Day 1 = 2026-02-28 (UTC), i.e. date(day) = 2026-02-27 + day days. Same
mapping as collect_markets.conflict_day(). Today's day and any later day are NEVER written
(today's bar is still live; the 30-minute collector owns it).

Sources
  * Yahoo chart endpoint (period1/period2, interval=1d, User-Agent REQUIRED else 429) for the
    same symbols / indicator names / units collect_markets.py uses.
  * USD/SAR, USD/AED, USD/IQD from the dated fawazahmed0 currency-api snapshots on jsdelivr.
    Timing rule (scout-verified): the snapshot dated D equals the close of D-1, so the close
    of conflict day D is read from the snapshot dated D+1.
  * NOT written: USD/IRR (terms risk; the daily Claude task owns the open-market rate) and
    USD/EGP (Yahoo/Fawaz are market quotes, not the CBE official close).

Semantics
  * Exchange instruments: trading days only (no weekend/holiday forward-fill). Day 1 (Sat) and
    Day 2 (Sun) therefore have no row; Day 3 (Mon 2026-03-02) is the first, and its change_pct
    is against the Fri 2026-02-27 close fetched as lead-in. FX (Fawaz): every calendar day.
  * change_pct = (close / previous close in the same series - 1) * 100, rounded to 2 dp.
  * created_at is omitted so the column default now() applies. The nightly pg_cron dedup keeps
    the NEWEST row per (indicator, conflict_day) for closed days, so the backfilled close
    (inserted now) automatically beats the older random intraday snapshots, which are left
    untouched here.
  * Idempotent: existing rows whose source contains "daily close" are read via PostgREST
    (indicator, conflict_day) and skipped, so a re-run writes nothing twice.
  * Inserts are grouped by key signature (PostgREST PGRST102: never mix key sets in one array).
  * Exit code: 0 ok / nothing new; 1 if rows were fetched but not (fully) written, or a source
    failed; 2 if nothing could be fetched or arguments/credentials are unusable.

Env: SUPABASE_URL, SUPABASE_SERVICE_KEY (same names as collect_markets.py; read lazily so a
dry run without credentials still works - it then skips the idempotency lookup).

Usage:  python backfill_market_closes.py --start-day 1 --end-day 220 --dry-run true
"""

import argparse
import csv
import datetime
import io
import os
import random
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import requests

EPOCH0 = datetime.date(2026, 2, 27)  # Day 0; Day 1 = 2026-02-28
YAHOO_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0"}
FAWAZ_URLS = (
    "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@{date}/v1/currencies/usd.min.json",
    "https://{date}.currency-api.pages.dev/v1/currencies/usd.min.json",
)
FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
BACKFILL_TAG = "reconstructed backfill 2026-10"
CROSSCHECK_WARN_PCT = 0.5

# (symbol, indicator, unit, kind) - indicator names and units must match collect_markets.py exactly.
YAHOO_SERIES = [
    ("BZ=F", "Brent Crude Oil", "USD/bbl", "futures"),
    ("CL=F", "WTI Crude Oil", "USD/bbl", "futures"),
    ("GC=F", "Gold", "USD/oz", "futures"),
    ("NG=F", "Natural Gas", "USD/MMBtu", "futures"),
    ("^GSPC", "S&P 500", "points", "index"),
    ("^DJI", "Dow Jones", "points", "index"),
    ("XLE", "Energy ETF (XLE)", "USD", "ETF"),
    ("USO", "Oil ETF (USO)", "USD", "ETF"),
    ("^VIX", "VIX (Fear Index)", "index", "index"),
    ("EURUSD=X", "EUR/USD", "rate", "FX spot"),
]
FAWAZ_SERIES = [("sar", "USD/SAR"), ("aed", "USD/AED"), ("iqd", "USD/IQD")]
# Value precision: collector rounds to 2 dp; EUR/USD and the pegged FX pairs need more.
VALUE_DP = {"EUR/USD": 4, "USD/SAR": 4, "USD/AED": 4, "USD/IQD": 4}
ALL_INDICATORS = [i for _, i, _, _ in YAHOO_SERIES] + [i for _, i in FAWAZ_SERIES]


# ---------------------------------------------------------------- day <-> date
def today_utc():
    return datetime.datetime.now(datetime.timezone.utc).date()


def day_to_date(day):
    return EPOCH0 + datetime.timedelta(days=day)


def date_to_day(d):
    return (d - EPOCH0).days


def fawaz_snapshot_date(day):
    """Snapshot dated D holds the close of D-1, so the close of day D is in snapshot D+1."""
    return day_to_date(day) + datetime.timedelta(days=1)


def last_writable_day(today):
    return date_to_day(today) - 1


def clamp_days(start_day, end_day, today):
    """Clamp to [1, yesterday]. start > end afterwards means an empty range."""
    return max(1, start_day), min(end_day, last_writable_day(today))


def change_pct(value, prev):
    if not prev:
        return 0.0
    return round((value / prev - 1) * 100, 2)


# ---------------------------------------------------------------- Yahoo
def parse_yahoo_chart(payload):
    """-> {exchange-local date: close}; null closes are skipped."""
    res = payload["chart"]["result"][0]
    off = (res.get("meta") or {}).get("gmtoffset", 0) or 0
    closes = res["indicators"]["quote"][0]["close"]
    out = {}
    for ts, c in zip(res.get("timestamp") or [], closes):
        if c is None:
            continue
        d = (datetime.datetime.fromtimestamp(ts, datetime.timezone.utc) + datetime.timedelta(seconds=off)).date()
        out[d] = float(c)
    return out


def fetch_yahoo_series(symbol, start_day, end_day):
    d1 = day_to_date(start_day) - datetime.timedelta(days=8)  # lead-in so the first change_pct has a prior close
    d2 = day_to_date(end_day) + datetime.timedelta(days=2)
    params = {"interval": "1d",
              "period1": int(datetime.datetime(d1.year, d1.month, d1.day, tzinfo=datetime.timezone.utc).timestamp()),
              "period2": int(datetime.datetime(d2.year, d2.month, d2.day, tzinfo=datetime.timezone.utc).timestamp())}
    for attempt in (1, 2):
        r = requests.get(YAHOO_URL.format(symbol=symbol), headers=YAHOO_HEADERS, params=params, timeout=30)
        if r.status_code == 429 and attempt == 1:
            time.sleep(10)
            continue
        r.raise_for_status()
        return parse_yahoo_chart(r.json())


def build_exchange_rows(indicator, series, start_day, end_day, today):
    meta = {i: (s, u, k) for s, i, u, k in YAHOO_SERIES}[indicator]
    symbol, unit, kind = meta
    start_day, end_day = clamp_days(start_day, end_day, today)
    dp = VALUE_DP.get(indicator, 2)
    rows, prev = [], None
    for d in sorted(series):
        close = series[d]
        day = date_to_day(d)
        if d.weekday() < 5 and start_day <= day <= end_day:
            rows.append({
                "indicator": indicator,
                "value": round(close, dp),
                "change_pct": change_pct(close, prev),
                "unit": unit,
                "source": f"Yahoo Finance daily close ({symbol} {kind}) — {BACKFILL_TAG}",
                "conflict_day": day,
            })
        prev = close
    return rows


# ---------------------------------------------------------------- Fawaz FX
def fetch_fawaz_snapshot(snap_date):
    iso = snap_date.isoformat()
    for url in FAWAZ_URLS:
        for attempt in (1, 2):
            try:
                r = requests.get(url.format(date=iso), timeout=30)
                if r.status_code == 429 and attempt == 1:
                    time.sleep(10)
                    continue
                if r.status_code == 200:
                    return r.json().get("usd") or {}
                break
            except Exception:
                if attempt == 2:
                    break
                time.sleep(2)
    return None


def fetch_fawaz_snapshots(start_day, end_day):
    """{snapshot date: usd rates dict} for every snapshot needed by days start-1..end."""
    dates = [fawaz_snapshot_date(d) for d in range(max(0, start_day - 1), end_day + 1)]
    with ThreadPoolExecutor(max_workers=8) as ex:
        got = list(ex.map(fetch_fawaz_snapshot, dates))
    return {d: g for d, g in zip(dates, got) if g}


def build_fx_rows(indicator, snaps, start_day, end_day, today):
    """snaps: {snapshot date: value}. Close of day D = value of snapshot dated D+1. Every calendar day;
    a missing snapshot is a gap (never forward-filled)."""
    start_day, end_day = clamp_days(start_day, end_day, today)
    dp = VALUE_DP.get(indicator, 4)
    rows, prev = [], None
    for day in range(max(0, start_day - 1), end_day + 1):
        v = snaps.get(fawaz_snapshot_date(day))
        if v is None:
            continue
        if day >= start_day:
            rows.append({
                "indicator": indicator,
                "value": round(v, dp),
                "change_pct": change_pct(v, prev),
                "unit": "rate",
                "source": "fawazahmed0 currency-api dated snapshot (daily close, snapshot D+1 = close of D) "
                          f"— {BACKFILL_TAG}",
                "conflict_day": day,
            })
        prev = v
    return rows


# ---------------------------------------------------------------- Supabase
def sb_headers(key):
    return {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}


def fetch_existing_keys(base_url, headers, start_day, end_day, page_size=1000):
    """(indicator, conflict_day) pairs that already have a 'daily close' row in the window."""
    keys, offset = set(), 0
    while True:
        params = {"select": "indicator,conflict_day",
                  "source": "ilike.*daily close*",
                  "and": f"(conflict_day.gte.{start_day},conflict_day.lte.{end_day})",
                  "order": "conflict_day.asc,indicator.asc",
                  "limit": str(page_size), "offset": str(offset)}
        r = requests.get(f"{base_url}/rest/v1/market_data", headers=headers, params=params, timeout=30)
        r.raise_for_status()
        page = r.json()
        keys.update((p["indicator"], p["conflict_day"]) for p in page)
        if len(page) < page_size:
            return keys
        offset += page_size


def filter_new(rows, existing):
    new = [r for r in rows if (r["indicator"], r["conflict_day"]) not in existing]
    return new, len(rows) - len(new)


def group_by_signature(rows):
    groups = {}
    for r in rows:
        groups.setdefault(frozenset(r), []).append(r)
    return list(groups.values())


def write_rows(base_url, headers, rows, batch_size=500, ok_rows=None):
    """POST one homogeneous-key array per batch. Returns number of rows accepted."""
    written = 0
    for group in group_by_signature(rows):
        for i in range(0, len(group), batch_size):
            chunk = group[i:i + batch_size]
            resp = requests.post(f"{base_url}/rest/v1/market_data",
                                 headers={**headers, "Prefer": "return=minimal"}, json=chunk, timeout=60)
            if resp.status_code not in (200, 201):
                print(f"  Supabase error: {resp.status_code} — {resp.text[:300]}")
                continue
            written += len(chunk)
            if ok_rows is not None:
                ok_rows.extend(chunk)
    return written


# ---------------------------------------------------------------- FRED cross-check
def fetch_fred_sp500(start_date, end_date):
    params = {"id": "SP500", "cosd": start_date.isoformat(), "coed": end_date.isoformat()}
    for attempt in (1, 2):
        try:
            r = requests.get(FRED_URL, params=params, headers=YAHOO_HEADERS, timeout=45)
            r.raise_for_status()
            out = {}
            for row in csv.reader(io.StringIO(r.text)):
                try:
                    out[datetime.date.fromisoformat(row[0])] = float(row[1])
                except (ValueError, IndexError):
                    continue  # header or "." (no observation)
            return out
        except Exception as e:
            if attempt == 2:
                print(f"  FRED unavailable ({e}) — cross-check skipped")
            else:
                time.sleep(3)
    return {}


def crosscheck_sp500(yahoo, fred, k=5, rng=None):
    """-> [(date, yahoo, fred, diff_pct, warn)] for k random days present in both series."""
    rng = rng or random
    common = sorted(set(yahoo) & set(fred))
    out = []
    for d in sorted(rng.sample(common, min(k, len(common)))):
        diff = abs(yahoo[d] / fred[d] - 1) * 100
        out.append((d, yahoo[d], fred[d], round(diff, 3), diff > CROSSCHECK_WARN_PCT))
    return out


# ---------------------------------------------------------------- orchestration
def _weekdays(start_day, end_day):
    return sum(1 for d in range(start_day, end_day + 1) if day_to_date(d).weekday() < 5)


def run(args):
    today = today_utc()
    start_day, end_day = clamp_days(int(args.start_day), int(args.end_day), today)
    dry = bool(args.dry_run)
    print(f"[backfill_market_closes] today={today} (Day {date_to_day(today)}); window Day {start_day}..{end_day} "
          f"= {day_to_date(start_day)}..{day_to_date(end_day)}; dry_run={dry}")
    if start_day > end_day:
        print(f"ERROR: empty window (last writable day is {last_writable_day(today)}).")
        return 2

    base = (os.environ.get("SUPABASE_URL") or "").rstrip("/")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or ""
    have_creds = bool(base and key)
    if not have_creds and not dry:
        print("ERROR: SUPABASE_URL / SUPABASE_SERVICE_KEY not set.")
        return 2
    headers = sb_headers(key) if have_creds else {}

    built, failures, sp500_series = {}, [], {}
    for symbol, indicator, _, _ in YAHOO_SERIES:
        try:
            series = fetch_yahoo_series(symbol, start_day, end_day)
            built[indicator] = build_exchange_rows(indicator, series, start_day, end_day, today)
            if symbol == "^GSPC":
                sp500_series = series
        except Exception as e:
            print(f"  Yahoo error for {symbol}: {e}")
            failures.append(symbol)
        time.sleep(1)

    snaps = fetch_fawaz_snapshots(start_day, end_day)
    if not snaps:
        failures.append("fawaz")
    for code, indicator in FAWAZ_SERIES:
        vals = {d: float(s[code]) for d, s in snaps.items() if s.get(code) is not None}
        built[indicator] = build_fx_rows(indicator, vals, start_day, end_day, today)

    all_rows = [r for i in ALL_INDICATORS for r in built.get(i, [])]
    if not all_rows:
        print("ERROR: nothing fetched from any source.")
        return 2

    existing = set()
    if have_creds:
        existing = fetch_existing_keys(base, headers, start_day, end_day)
    else:
        print("  (no Supabase credentials: idempotency lookup skipped, assuming no existing rows)")
    to_write, skipped = filter_new(all_rows, existing)

    ok_rows = []
    written = 0
    if not dry and to_write:
        written = write_rows(base, headers, to_write, ok_rows=ok_rows)
    wrote_keys = {(r["indicator"], r["conflict_day"]) for r in (to_write if dry else ok_rows)}

    print(f"\nCoverage (Day {start_day}..{end_day}) — {'DRY RUN, nothing written' if dry else 'LIVE'}")
    print(f"{'indicator':<20}{'fetched':>8}{'exists':>8}{'written':>9}{'gaps':>6}  note")
    for ind in ALL_INDICATORS:
        rows = built.get(ind, [])
        is_fx = ind in {i for _, i in FAWAZ_SERIES}
        expected = (end_day - start_day + 1) if is_fx else _weekdays(start_day, end_day)
        ex = sum(1 for r in rows if (ind, r["conflict_day"]) in existing)
        w = sum(1 for r in rows if (ind, r["conflict_day"]) in wrote_keys)
        note = "FX calendar days" if is_fx else "weekdays; gaps = holidays/missing bars"
        print(f"{ind:<20}{len(rows):>8}{ex:>8}{w:>9}{max(0, expected - len(rows)):>6}  {note}")
    print(f"\nTotal fetched {len(all_rows)}, already present {skipped}, "
          f"{'would write' if dry else 'written'} {len(to_write) if dry else written}")

    print("\nSample rows:")
    pool = to_write or all_rows
    for r in random.Random(42).sample(pool, min(5, len(pool))):
        print("  ", {k: r[k] for k in ("indicator", "conflict_day", "value", "change_pct", "unit")}, "|", r["source"])

    if sp500_series:
        print("\nCross-check S&P 500 (Yahoo ^GSPC vs FRED SP500), 5 random days:")
        fred = fetch_fred_sp500(day_to_date(start_day) - datetime.timedelta(days=8),
                                day_to_date(end_day) + datetime.timedelta(days=2))
        window = {d: v for d, v in sp500_series.items() if start_day <= date_to_day(d) <= end_day}
        for d, y, f, diff, warn in crosscheck_sp500(window, fred):
            print(f"   {d} Day {date_to_day(d)}: yahoo={y:.2f} fred={f:.2f} diff={diff:.3f}%"
                  + ("  WARNING: > 0.5%" if warn else ""))

    if failures:
        print(f"\nWARNING: sources failed: {failures}")
    if not dry:
        if to_write and written < len(to_write):
            print(f"ERROR: wrote {written} of {len(to_write)} rows.")
            return 1
        if failures:
            return 1
    return 0


def _bool(s):
    return str(s).strip().lower() in ("1", "true", "yes", "y")


def main(argv=None):
    p = argparse.ArgumentParser(description=__doc__.split("\n")[1])
    p.add_argument("--start-day", dest="start_day", type=int, default=1)
    p.add_argument("--end-day", dest="end_day", type=int, default=220)
    p.add_argument("--dry-run", dest="dry_run", type=_bool, default=True)
    return run(p.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
