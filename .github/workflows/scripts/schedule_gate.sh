#!/usr/bin/env bash
# Fallback gate for workflows that the Cloudflare scheduler Worker (workers/scheduler) dispatches.
#
# The GitHub `schedule:` trigger stays as a FALLBACK: it is delayed by hours and can drop runs
# (measured 2026-10-08: collect-markets "every 30 min" ran 4-7 h apart). When the Worker is live,
# its workflow_dispatch runs arrive on time and a late scheduled run would only duplicate them.
#
#   schedule_gate.sh <workflow-file> <window>     window = minutes (e.g. 25) or "utc-day"
#
# Writes run=true|false to $GITHUB_OUTPUT:
#   - any event other than `schedule` (dispatch from the Worker, manual run)  -> run=true
#   - `schedule` and a workflow_dispatch run of the same workflow was created inside the window
#     and is queued/in progress or succeeded                                     -> run=false
#   - otherwise, or if the GitHub API cannot be read (fail open)                -> run=true
# Needs: GH_TOKEN (github.token with actions: read), GITHUB_REPOSITORY, GITHUB_EVENT_NAME.
set -uo pipefail

wf="${1:?workflow file}"
window="${2:?window minutes or utc-day}"
out="${GITHUB_OUTPUT:-/dev/stdout}"

if [ "${GITHUB_EVENT_NAME:-}" != "schedule" ]; then
  echo "run=true" >> "$out"
  exit 0
fi

if [ "$window" = "utc-day" ]; then
  since="$(date -u +%Y-%m-%dT00:00:00Z)"
else
  since="$(date -u -d "-${window} minutes" +%Y-%m-%dT%H:%M:%SZ)"
fi

if ! n="$(gh api -X GET "repos/${GITHUB_REPOSITORY}/actions/workflows/${wf}/runs" \
      -f event=workflow_dispatch -f created=">=${since}" -f per_page=20 \
      --jq '[.workflow_runs[] | select(.status != "completed" or .conclusion == "success")] | length')"; then
  echo "::warning::schedule gate: could not list runs of ${wf}; running the fallback anyway"
  echo "run=true" >> "$out"
  exit 0
fi

if [ "${n:-0}" -gt 0 ]; then
  echo "::notice title=Scheduled run skipped::${n} scheduler-dispatched run(s) of ${wf} since ${since} (queued, running or succeeded); this late GitHub-scheduled run would duplicate them."
  echo "run=false" >> "$out"
else
  echo "No dispatched run of ${wf} since ${since}: the GitHub schedule fallback runs."
  echo "run=true" >> "$out"
fi
