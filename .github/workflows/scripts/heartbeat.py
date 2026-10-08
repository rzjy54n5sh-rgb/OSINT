"""Append one row to public.job_heartbeats (migration 20261010090000). Never raises.

Usage (one line at the end of a job):  heartbeat.beat("collect-markets", "ok", "13 indicators")

Non-fatal by design: a missing table (migration not applied yet), a network error or missing env
prints one line and returns False; the job's own exit code is never affected. Skipped for
--dry-run invocations and when HEARTBEAT_DISABLED=1. Stdlib only (scenario_daily.py has no deps).
"""
import json
import os
import sys
import urllib.request

_STATUSES = {"ok", "warn", "fail", "skipped"}


def beat(job, status="ok", detail=None, timeout=10):
    try:
        if os.environ.get("HEARTBEAT_DISABLED") == "1" or "--dry-run" in sys.argv:
            return False
        url = os.environ.get("SUPABASE_URL", "").rstrip("/")
        key = os.environ.get("SUPABASE_SERVICE_KEY", "")
        if not url or not key:
            print(f"[heartbeat] {job}: SUPABASE_URL/SUPABASE_SERVICE_KEY not set; not recorded")
            return False
        if status not in _STATUSES:
            status = "warn"
        body = {"job": job, "status": status}
        if detail is not None:
            body["detail"] = str(detail)[:2000]
        req = urllib.request.Request(
            f"{url}/rest/v1/job_heartbeats",
            data=json.dumps(body).encode(),
            method="POST",
            headers={
                "apikey": key,
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
                "Prefer": "return=minimal",
            },
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            ok = 200 <= resp.status < 300
        print(f"[heartbeat] {job}: {status} recorded" if ok else f"[heartbeat] {job}: HTTP {resp.status}")
        return ok
    except Exception as e:  # noqa: BLE001 — a heartbeat must never break the job
        print(f"[heartbeat] {job}: not recorded ({type(e).__name__}: {str(e)[:120]})")
        return False
