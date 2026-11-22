"""Ask the Wayback Machine to save every URL the desk cited today; record what it returned.

Why this runs on GitHub Actions: the Claude daily build's cloud sandbox cannot reach
web.archive.org/save (2026-11-22: HTTP 000 there; 302 -> snapshot from a residential IP), so new
citations carry archive_url NULL. This job runs after the daily build and appends one row per URL
to public.source_archives (migration 20261122090100). It never edits a brief or an evidence row.

A snapshot_url is ONLY the Location / Content-Location the Wayback Machine returned. Nothing is
constructed by hand ("dont accept any invented claim"). Stdlib only, no model API.

Usage:
  python archive_sources.py                      # today's citations (DAY LOCK, UTC)
  python archive_sources.py --day 268 --dry-run  # list what would be saved; write nothing
  python archive_sources.py --urls-file f.txt --no-db   # save URLs from a file, print results (test)
"""
import argparse
import datetime as dt
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

import heartbeat

CONFLICT_START = dt.date(2026, 2, 28)
SAVE = "https://web.archive.org/save/"
UA = "mena-intel-desk archive_sources (+https://github.com/rzjy54n5sh-rgb/OSINT)"
SNAP_RE = re.compile(r"^(?:https?://web\.archive\.org)?/web/(\d{14})/(.+)$")
SKIP_HOSTS = ("web.archive.org", "archive.ph", "archive.today", "archive.is")
JOB = "archive-sources"


def conflict_day(today=None):
    return ((today or dt.datetime.now(dt.timezone.utc).date()) - CONFLICT_START).days + 1


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None


_opener = urllib.request.build_opener(_NoRedirect)


def snapshot_from(headers):
    """Return the snapshot URL Wayback reported in Location or Content-Location, else None."""
    for h in ("Location", "Content-Location"):
        v = headers.get(h)
        if not v:
            continue
        m = SNAP_RE.match(v.strip())
        if m:
            return f"https://web.archive.org/web/{m.group(1)}/{m.group(2)}"
    return None


def save(url, timeout=120):
    """-> (status, snapshot_url, http_status, detail). Never raises."""
    req = urllib.request.Request(SAVE + url, headers={"User-Agent": UA})
    try:
        with _opener.open(req, timeout=timeout) as r:
            code, headers = r.status, r.headers
    except urllib.error.HTTPError as e:
        code, headers = e.code, e.headers
    except Exception as e:  # network error, timeout
        return "failed", None, None, f"{type(e).__name__}: {e}"[:500]
    snap = snapshot_from(headers or {})
    if snap:
        return "saved", snap, code, None
    return "failed", None, code, f"HTTP {code}; no snapshot location returned"


class DB:
    def __init__(self, url, key):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.h = {"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"}

    def get(self, path):
        req = urllib.request.Request(self.base + path, headers=self.h)
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.loads(r.read() or b"[]")

    def insert(self, row):
        req = urllib.request.Request(self.base + "source_archives", data=json.dumps(row).encode(), method="POST",
                                     headers=dict(self.h, Prefer="return=minimal"))
        with urllib.request.urlopen(req, timeout=60):
            return True


def _ok_url(u):
    if not isinstance(u, str) or not re.match(r"^https?://", u):
        return False
    host = urllib.parse.urlsplit(u).hostname or ""
    return not any(host == h or host.endswith("." + h) for h in SKIP_HOSTS)


def brief_urls(db, day):
    """URLs cited in day's briefs whose source object has no archive_url -> {url: cited_in}."""
    out = {}
    for b in db.get(f"daily_briefings?conflict_day=eq.{day}&select=report_type,sections"):
        for s in b.get("sections") or []:
            for ss in s.get("subsections") or []:
                for p in ss.get("paragraphs") or []:
                    for src in p.get("sources") or []:
                        u = (src or {}).get("url")
                        if _ok_url(u) and not (src.get("archive_url") or "").strip():
                            out.setdefault(u, f"daily_briefings:{day}:{b['report_type']}")
    return out


def evidence_urls(db, since_days=3):
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=since_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = db.get(f"posture_evidence?archive_url=is.null&captured_at=gte.{since}&select=id,source_url&limit=500")
    return {r["source_url"]: f"posture_evidence:{r['id']}" for r in rows if _ok_url(r.get("source_url"))}


def recently_saved(db, days=7):
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    rows = db.get(f"source_archives?status=eq.saved&requested_at=gte.{since}&select=url&limit=10000")
    return {r["url"] for r in rows}


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int)
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-db", action="store_true")
    ap.add_argument("--urls-file")
    ap.add_argument("--limit", type=int, default=150)
    ap.add_argument("--spacing", type=float, default=10.0, help="seconds between save requests")
    a = ap.parse_args(argv)
    day = a.day or conflict_day()

    db = None
    if not a.no_db:
        url, key = os.environ.get("SUPABASE_URL"), os.environ.get("SUPABASE_SERVICE_KEY")
        if not url or not key:
            print("::error::SUPABASE_URL / SUPABASE_SERVICE_KEY not set")
            return 1
        db = DB(url, key)

    if a.urls_file:
        targets = {l.strip(): "manual" for l in open(a.urls_file) if _ok_url(l.strip())}
    else:
        targets = brief_urls(db, day)
        for u, c in evidence_urls(db).items():
            targets.setdefault(u, c)
    done = recently_saved(db) if db else set()
    queue = [(u, c) for u, c in targets.items() if u not in done][: a.limit]
    print(f"[{JOB}] Day {day}: {len(targets)} cited URLs without archive, {len(done & set(targets))} already "
          f"saved in the last 7 days, {len(queue)} to request (limit {a.limit})")
    if a.dry_run:
        for u, c in queue:
            print(f"  would save {u}  ({c})")
        return 0

    saved = failed = 0
    for i, (u, cited) in enumerate(queue):
        if i:
            time.sleep(a.spacing)
        status, snap, code, detail = save(u)
        if code == 429:
            print(f"[{JOB}] 429 from Wayback; waiting 90 s and retrying once")
            time.sleep(90)
            status, snap, code, detail = save(u)
            if code == 429:
                print(f"[{JOB}] still rate-limited; stopping. Remaining URLs are picked up by the next run.")
                break
        saved += status == "saved"
        failed += status != "saved"
        print(f"  {status:6} {code} {u} -> {snap or detail}")
        if db:
            db.insert({"url": u, "snapshot_url": snap, "status": status, "http_status": code, "detail": detail,
                       "cited_in": cited, "conflict_day": day})
    msg = f"{saved} saved, {failed} failed of {len(queue)} requested (Day {day})"
    print(f"[{JOB}] {msg}")
    heartbeat.beat(JOB, "ok" if (saved or not queue) else "fail", msg)
    return 1 if queue and saved == 0 else 0


if __name__ == "__main__":
    sys.exit(main())
