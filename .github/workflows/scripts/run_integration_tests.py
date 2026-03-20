#!/usr/bin/env python3
"""
Post-launch data integrity checks (Supabase REST + Edge Function smoke).
GROUP A / GROUP E — safe to run after daily pipeline. Stdlib only.

Usage:
  python run_integration_tests.py --supabase-url "$SUPABASE_URL" --key "$SUPABASE_SERVICE_KEY"
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from datetime import date, datetime, timezone

CONFLICT_START = date(2026, 2, 28)
VALID_CATEGORIES = frozenset(
    {"ALIGNED", "STABLE", "TENSION", "FRACTURE", "INVERSION"}
)
EXPECTED_COUNTRIES = 20
# Sum tolerance for floating scenario percentages from DB
SUM_EPS = 0.51


def locked_conflict_day(override: int | None) -> int:
    if override is not None:
        return max(1, override)
    today = datetime.now(timezone.utc).date()
    return max(1, (today - CONFLICT_START).days + 1)


def supabase_get(url_base: str, key: str, path: str) -> list:
    """GET /rest/v1/{path}; returns JSON list."""
    url = f"{url_base.rstrip('/')}/rest/v1/{path.lstrip('/')}"
    req = urllib.request.Request(
        url,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = r.read()
            if not raw:
                return []
            out = json.loads(raw.decode())
            return out if isinstance(out, list) else [out]
    except urllib.error.HTTPError as e:
        body = e.read().decode()[:500]
        raise RuntimeError(f"HTTP {e.code} for {path}: {body}") from e


def fetch_all_categories(url_base: str, key: str) -> set[str]:
    """Paginate nai_scores.category for DISTINCT-equivalent check."""
    seen: set[str] = set()
    offset = 0
    page = 1000
    while True:
        rows = supabase_get(
            url_base,
            key,
            f"nai_scores?select=category&limit={page}&offset={offset}",
        )
        if not rows:
            break
        for row in rows:
            c = row.get("category")
            if c is not None:
                seen.add(str(c))
        if len(rows) < page:
            break
        offset += page
    return seen


def test_day_lock(url_base: str, key: str, day: int) -> list[str]:
    rows = supabase_get(
        url_base,
        key,
        "nai_scores?select=conflict_day&order=conflict_day.desc&limit=1",
    )
    if not rows:
        return ["day_lock: no rows in nai_scores"]
    max_day = int(rows[0]["conflict_day"])
    if max_day != day:
        return [f"day_lock: max(conflict_day) in nai_scores is {max_day}, expected locked day {day}"]
    return []


def test_category_enum(url_base: str, key: str) -> list[str]:
    cats = fetch_all_categories(url_base, key)
    if not cats:
        return ["category_enum: no categories found in nai_scores"]
    bad = sorted(c for c in cats if c not in VALID_CATEGORIES)
    if bad:
        return [f"category_enum: invalid values {bad!r} (allowed {sorted(VALID_CATEGORIES)!r})"]
    return []


def test_scenario_sums(url_base: str, key: str) -> list[str]:
    rows = supabase_get(
        url_base,
        key,
        "scenario_probabilities?select=conflict_day,scenario_a,scenario_b,scenario_c,scenario_d",
    )
    if not rows:
        return ["scenario_sum: no rows in scenario_probabilities"]
    failures: list[str] = []
    for r in rows:
        cd = r.get("conflict_day")
        a = float(r.get("scenario_a") or 0)
        b = float(r.get("scenario_b") or 0)
        c = float(r.get("scenario_c") or 0)
        d = float(r.get("scenario_d") or 0)
        s = a + b + c + d
        if abs(s - 100) > SUM_EPS:
            failures.append(
                f"scenario_sum: conflict_day={cd} A+B+C+D={s:.2f} (expected 100)"
            )
    return failures


def test_future_contamination(url_base: str, key: str, day: int) -> list[str]:
    failures: list[str] = []
    tables = ("nai_scores", "scenario_probabilities", "country_reports")
    for table in tables:
        rows = supabase_get(
            url_base,
            key,
            f"{table}?select=conflict_day&conflict_day=gt.{day}&limit=1",
        )
        if rows:
            failures.append(
                f"future_contamination: {table} has conflict_day > {day}"
            )
    return failures


def test_country_count(url_base: str, key: str, day: int) -> list[str]:
    rows = supabase_get(
        url_base,
        key,
        f"nai_scores?select=country_code&conflict_day=eq.{day}",
    )
    n = len(rows)
    if n != EXPECTED_COUNTRIES:
        return [
            f"country_count: conflict_day={day} has {n} nai_scores rows, expected {EXPECTED_COUNTRIES}"
        ]
    return []


def test_citations(url_base: str, key: str, day: int) -> list[str]:
    rows = supabase_get(
        url_base,
        key,
        f"country_reports?select=country_code,content_json&conflict_day=eq.{day}",
    )
    if not rows:
        return [f"citation: no country_reports for conflict_day={day}"]
    failures: list[str] = []
    for r in rows:
        cc = r.get("country_code", "?")
        cj = r.get("content_json")
        if isinstance(cj, str):
            try:
                cj = json.loads(cj)
            except json.JSONDecodeError:
                failures.append(f"citation: {cc} content_json not valid JSON")
                continue
        if not isinstance(cj, dict):
            failures.append(f"citation: {cc} missing content_json object")
            continue
        risks = cj.get("key_risks") or []
        if not risks:
            failures.append(f"citation: {cc} has empty key_risks")
            continue
        first = str(risks[0])
        if "No sourced data for Day" in first:
            continue
        if "[" not in first:
            failures.append(
                f"citation: {cc} key_risks[0] has no '[' (source tag): {first[:80]!r}…"
            )
    return failures


def test_send_digest_unauthorized(url_base: str) -> list[str]:
    """GROUP E: wrong Bearer → 401 (no valid service key)."""
    base = url_base.rstrip("/")
    fn_url = f"{base}/functions/v1/send-digest"
    body = json.dumps({"trigger": "integration_test"}).encode()
    req = urllib.request.Request(
        fn_url,
        data=body,
        headers={
            "Authorization": "Bearer invalid_key_for_integration_test",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            code = r.status
    except urllib.error.HTTPError as e:
        code = e.code
    except Exception as e:
        return [f"send_digest_401: request failed: {e}"]
    if code != 401:
        return [f"send_digest_401: expected HTTP 401, got {code}"]
    return []


def main() -> int:
    p = argparse.ArgumentParser(description="MENA Intel Desk post-launch integration checks")
    p.add_argument("--supabase-url", required=True, help="Supabase project URL")
    p.add_argument("--key", required=True, help="Supabase service role key")
    p.add_argument(
        "--conflict-day",
        type=int,
        default=None,
        help="Override locked conflict day (default: UTC calendar vs 2026-02-28)",
    )
    args = p.parse_args()

    day = locked_conflict_day(args.conflict_day)

    suites: list[tuple[str, list[str]]] = []

    checks = [
        ("day_lock", lambda: test_day_lock(args.supabase_url, args.key, day)),
        ("category_enum", lambda: test_category_enum(args.supabase_url, args.key)),
        ("scenario_sum", lambda: test_scenario_sums(args.supabase_url, args.key)),
        ("future_contamination", lambda: test_future_contamination(args.supabase_url, args.key, day)),
        ("country_count", lambda: test_country_count(args.supabase_url, args.key, day)),
        ("citation", lambda: test_citations(args.supabase_url, args.key, day)),
        ("send_digest_401", lambda: test_send_digest_unauthorized(args.supabase_url)),
    ]

    for name, fn in checks:
        try:
            errs = fn()
        except Exception as e:
            errs = [f"{name}: exception {e!r}"]
        suites.append((name, errs))

    failed = [(n, e) for n, e in suites if e]

    print(f"Integration tests (locked conflict_day={day}, UTC)")
    for name, errs in suites:
        status = "PASS" if not errs else "FAIL"
        print(f"  [{status}] {name}")
        for line in errs:
            print(f"         - {line}")

    if failed:
        print("\nFailed tests:", ", ".join(n for n, _ in failed), file=sys.stderr)
        return 1
    print("\nAll checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
