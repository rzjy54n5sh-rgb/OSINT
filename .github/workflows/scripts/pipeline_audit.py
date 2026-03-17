#!/usr/bin/env python3
"""
pipeline_audit.py — Pipeline run audit (Supabase pipeline_runs + platform_alerts).
Uses only stdlib urllib; no pip dependencies. Phase 11.
"""
import os
import sys
import json
import urllib.request
import urllib.error
from datetime import date, datetime

SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")
RUN_ID_FILE = "/tmp/mena_pipeline_run_id.txt"
CONFLICT_START = date(2026, 2, 28)


def conflict_day_from_override(override: str) -> int:
    if override and override.strip():
        return max(1, int(override.strip()))
    d = date.today()
    return max(1, (d - CONFLICT_START).days + 1)


def supabase(method: str, path: str, body: dict | None = None) -> dict | None:
    url = f"{SUPABASE_URL}/rest/v1{path}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }
    data = json.dumps(body).encode() if body else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            if not raw:
                return None
            return json.loads(raw.decode())
    except urllib.error.HTTPError as e:
        print(f"Supabase HTTP {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
        raise
    except Exception as e:
        print(f"Supabase request failed: {e}", file=sys.stderr)
        raise


def supabase_get(path: str) -> list:
    """GET request; returns list of rows (Supabase returns array)."""
    url = f"{SUPABASE_URL}/rest/v1{path}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Accept": "application/json",
    }, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read()
            if not raw:
                return []
            out = json.loads(raw.decode())
            return out if isinstance(out, list) else [out]
    except urllib.error.HTTPError as e:
        print(f"Supabase GET {e.code}: {e.read().decode()[:500]}", file=sys.stderr)
        return []
    except Exception as e:
        print(f"Supabase GET failed: {e}", file=sys.stderr)
        return []


def cmd_calc_day(override: str) -> None:
    day = conflict_day_from_override(override)
    gh_out = os.environ.get("GITHUB_OUTPUT")
    if gh_out:
        with open(gh_out, "a") as f:
            f.write(f"conflict_day={day}\n")
    print(f"conflict_day={day}")


def cmd_start(day: int, stage: str, triggered_by: str, run_id: str) -> None:
    today = date.today().isoformat()
    if run_id and run_id.strip():
        out = supabase(
            "PATCH",
            f"/pipeline_runs?id=eq.{run_id.strip()}",
            {"status": "running", "started_at": datetime.utcnow().isoformat() + "Z"},
        )
        rid = run_id.strip()
    else:
        row = supabase(
            "POST",
            "/pipeline_runs",
            {
                "run_date": today,
                "conflict_day": day,
                "stage": stage,
                "status": "running",
                "triggered_by": triggered_by,
                "started_at": datetime.utcnow().isoformat() + "Z",
            },
        )
        if isinstance(row, list) and row:
            rid = row[0].get("id")
        elif isinstance(row, dict) and row.get("id"):
            rid = row["id"]
        else:
            rid = ""
    with open(RUN_ID_FILE, "w") as f:
        f.write(rid)
    print(f"Run ID: {rid}")


def cmd_complete(day: int, job_status: str, stages_json: str) -> None:
    if not os.path.isfile(RUN_ID_FILE):
        print("No run ID file; skip complete", file=sys.stderr)
        return
    with open(RUN_ID_FILE) as f:
        rid = f.read().strip()
    if not rid:
        return
    try:
        stages = json.loads(stages_json)
    except json.JSONDecodeError:
        stages = {}
    completed_at = datetime.utcnow().isoformat() + "Z"
    duration_seconds = None
    rows = supabase_get(f"/pipeline_runs?id=eq.{rid}&select=started_at")
    if rows and isinstance(rows[0].get("started_at"), str):
        try:
            started = datetime.fromisoformat(rows[0]["started_at"].replace("Z", "+00:00"))
            completed = datetime.fromisoformat(completed_at.replace("Z", "+00:00"))
            duration_seconds = int((completed - started).total_seconds())
        except Exception:
            pass
    body = {
        "status": "completed" if job_status == "success" else "failed",
        "completed_at": completed_at,
        "stages_completed": stages,
    }
    if duration_seconds is not None:
        body["duration_seconds"] = duration_seconds
    supabase("PATCH", f"/pipeline_runs?id=eq.{rid}", body)
    print("Audit record completed.")


def cmd_alert(day: int, run_id: str) -> None:
    # PATCH platform_alerts: set pipeline_failure active
    supabase(
        "PATCH",
        "/platform_alerts?key=eq.pipeline_failure",
        {
            "is_active": True,
            "activated_at": datetime.utcnow().isoformat() + "Z",
            "message": f"Pipeline failed Day {day} — Run {run_id}",
        },
    )
    # Email via Resend API (inline HTML)
    admin_email = os.environ.get("ADMIN_EMAIL", "").strip()
    resend_key = os.environ.get("RESEND_API_KEY", "").strip()
    if not admin_email or not resend_key:
        print("ADMIN_EMAIL or RESEND_API_KEY not set; skip email", file=sys.stderr)
        return
    html = f"""
    <p>The Daily Intelligence Pipeline failed.</p>
    <p><strong>Conflict day:</strong> {day}</p>
    <p><strong>Run ID:</strong> {run_id}</p>
    <p>Check GitHub Actions logs for details.</p>
    """
    body = {
        "from": "MENA Intel Desk <onboarding@resend.dev>",
        "to": [admin_email],
        "subject": f"[MENA Intel] Pipeline failed — Day {day}",
        "html": html,
    }
    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=json.dumps(body).encode(),
        headers={
            "Authorization": f"Bearer {resend_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            print("Alert email sent.")
    except urllib.error.HTTPError as e:
        print(f"Resend API error: {e.code} {e.read().decode()[:300]}", file=sys.stderr)


def main() -> None:
    args = sys.argv[1:]
    if not args:
        print("Usage: pipeline_audit.py <calc-day|start|complete|alert> ...", file=sys.stderr)
        sys.exit(1)
    cmd = args[0].lower()
    rest = args[1:]

    if cmd == "calc-day":
        override = rest[0] if rest else ""
        cmd_calc_day(override)
        return
    if cmd == "start":
        day, stage, triggered_by, run_id = 0, "full", "cron", ""
        i = 0
        while i < len(rest):
            if rest[i] == "--day" and i + 1 < len(rest):
                day = int(rest[i + 1])
                i += 2
            elif rest[i] == "--stage" and i + 1 < len(rest):
                stage = rest[i + 1]
                i += 2
            elif rest[i] == "--triggered-by" and i + 1 < len(rest):
                triggered_by = rest[i + 1]
                i += 2
            elif rest[i] == "--run-id" and i + 1 < len(rest):
                run_id = rest[i + 1]
                i += 2
            else:
                i += 1
        cmd_start(day, stage, triggered_by, run_id)
        return
    if cmd == "complete":
        day, job_status, stages_json = 0, "success", "{}"
        i = 0
        while i < len(rest):
            if rest[i] == "--day" and i + 1 < len(rest):
                day = int(rest[i + 1])
                i += 2
            elif rest[i] == "--job-status" and i + 1 < len(rest):
                job_status = rest[i + 1]
                i += 2
            elif rest[i] == "--stages" and i + 1 < len(rest):
                stages_json = rest[i + 1]
                i += 2
            else:
                i += 1
        cmd_complete(day, job_status, stages_json)
        return
    if cmd == "alert":
        day, run_id = 0, ""
        i = 0
        while i < len(rest):
            if rest[i] == "--day" and i + 1 < len(rest):
                day = int(rest[i + 1])
                i += 2
            elif rest[i] == "--run-id" and i + 1 < len(rest):
                run_id = rest[i + 1]
                i += 2
            else:
                i += 1
        cmd_alert(day, run_id)
        return
    print(f"Unknown command: {cmd}", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
