#!/usr/bin/env bash
# Auto-merge decision and action for .github/workflows/auto-merge.yml (docs/auto-merge.md).
#
# Runs in the base-repository context with a write-scoped GITHUB_TOKEN, so it NEVER checks out, builds
# or executes pull-request code. Everything it knows about the PR comes from the GitHub REST API via
# `gh api`, and every PR-controlled string (branch name, title, file names) is handled as data: passed
# through environment variables and jq, compared, URL-encoded, never evaluated.
#
# Fails closed: any unexpected error stops before the merge call. Decisions (written to $GITHUB_OUTPUT
# as decision=..., and to the job summary):
#   SKIP                  not eligible (silent; e.g. no label, CI failed, kill switch on)
#   BLOCKED               eligible PR that needs a human (one PR comment explains the rule)
#   MERGE                 merged, branch deleted, Deploy dispatched, PR commented
#   MERGED_DEPLOY_FAILED  merged but the Deploy dispatch failed (exit 1: run Deploy by hand)
#   ERROR                 API failure or GitHub refused the merge (exit 1, nothing merged)
#
# Inputs (environment): REPO (owner/name), RUN_EVENT, RUN_CONCLUSION, RUN_HEAD_SHA, RUN_HEAD_BRANCH,
# RUN_PATH, RUN_HTML_URL, RUN_PULL_REQUESTS (JSON array from workflow_run.pull_requests),
# AUTO_MERGE_DISABLED (repo variable; true/1/yes/on = kill switch), GH_TOKEN (for gh),
# optional SERVER_URL, MERGEABLE_POLL_TRIES (12), MERGEABLE_POLL_SLEEP (5 s).
set -Eeuo pipefail

readonly ALLOWED_AUTHOR="rzjy54n5sh-rgb"
readonly LABEL="auto-merge"
readonly BASE_BRANCH="main"
readonly CI_WORKFLOW_PATH=".github/workflows/pr-ci.yml"
readonly DEPLOY_WORKFLOW="deploy.yml"
readonly MAX_FILES=100
readonly MAX_LINES=3000
readonly MAX_DELETED_FILES=20
# Check runs whose failure does not block: "Workers Builds: menaosint" is a separate Cloudflare project
# that fails on every PR (pre-existing, unrelated to this repository's deploy).
readonly IGNORED_CHECKS_JSON='["Workers Builds: menaosint"]'

: "${REPO:?REPO is required}"
SERVER_URL="${SERVER_URL:-https://github.com}"
POLL_TRIES="${MERGEABLE_POLL_TRIES:-12}"
POLL_SLEEP="${MERGEABLE_POLL_SLEEP:-5}"
RUN_HTML_URL="${RUN_HTML_URL:-}"
SUMMARY_FILE="${GITHUB_STEP_SUMMARY:-/dev/null}"
OUTPUT_FILE="${GITHUB_OUTPUT:-/dev/null}"

decided=0
merged=0
pr_number=""

# ---- output helpers ------------------------------------------------------------------------------
# One line, no control characters or backticks: safe to print in markdown and in $GITHUB_OUTPUT.
safe() { printf '%s' "$1" | tr -d '\000-\037\177`' | cut -c1-200; }
note() { printf '%s\n' "$1"; printf -- '- %s\n' "$1" >> "$SUMMARY_FILE"; }

record() { # DECISION REASON
  decided=1
  local reason
  reason="$(safe "$2")"
  printf 'decision=%s\nreason=%s\npr=%s\n' "$1" "$reason" "$pr_number" >> "$OUTPUT_FILE"
  printf '\n**Decision: %s** (%s)\n' "$1" "$reason" >> "$SUMMARY_FILE"
  printf 'DECISION %s: %s\n' "$1" "$reason"
}
skip() { record SKIP "$1"; exit 0; }
fail() { record ERROR "$1"; exit 1; }

# shellcheck disable=SC2317  # invoked by the ERR trap
on_error() {
  local rc=$? line="$1"
  if [ "$decided" = 0 ]; then
    if [ "$merged" = 1 ]; then record ERROR "unexpected failure (exit $rc, line $line) AFTER the merge; check Deploy"
    else record ERROR "unexpected failure (exit $rc, line $line); nothing was merged"; fi
  fi
}
trap 'on_error "$LINENO"' ERR

api() { gh api -H "Accept: application/vnd.github+json" -H "X-GitHub-Api-Version: 2022-11-28" "$@"; }

{
  printf '## Auto-merge\n\n'
  printf -- '- PR CI run: %s\n' "$(safe "$RUN_HTML_URL")"
  printf -- '- event: %s, conclusion: %s\n' "$(safe "${RUN_EVENT:-}")" "$(safe "${RUN_CONCLUSION:-}")"
  printf -- '- head: %s (%s)\n' "$(safe "${RUN_HEAD_SHA:-}")" "$(safe "${RUN_HEAD_BRANCH:-}")"
} >> "$SUMMARY_FILE"

# ---- 1. The triggering run (no API calls) ---------------------------------------------------------
[ "${RUN_EVENT:-}" = "pull_request" ] || skip "PR CI run was triggered by '$(safe "${RUN_EVENT:-}")', not pull_request"
[ "${RUN_CONCLUSION:-}" = "success" ] || skip "PR CI concluded '$(safe "${RUN_CONCLUSION:-}")', not success"
# workflow_run.path is ".github/workflows/pr-ci.yml"; tolerate an "@ref" suffix. A PR cannot pass this by
# adding its own workflow named "PR CI" elsewhere, and editing pr-ci.yml itself is a human-only path.
run_path="${RUN_PATH:-}"
run_path="${run_path%%@*}"
[ "$run_path" = "$CI_WORKFLOW_PATH" ] || skip "completed workflow is '$(safe "${RUN_PATH:-}")', not $CI_WORKFLOW_PATH"
case "$(printf '%s' "${AUTO_MERGE_DISABLED:-}" | tr '[:upper:]' '[:lower:]')" in
  true|1|yes|on) skip "kill switch: repository variable AUTO_MERGE_DISABLED is set" ;;
esac
HEAD_SHA="${RUN_HEAD_SHA:-}"
[[ "$HEAD_SHA" =~ ^[0-9a-f]{40}$ ]] || skip "workflow_run.head_sha is not a 40-hex commit id"
note "ok: PR CI succeeded on $HEAD_SHA; kill switch off"

# ---- 2. Resolve the PR ---------------------------------------------------------------------------
candidates="$(printf '%s' "${RUN_PULL_REQUESTS:-[]}" | jq -r '.[]?.number // empty' 2>/dev/null || true)"
if [ -z "$candidates" ]; then
  # workflow_run.pull_requests is empty for fork PRs and sometimes for others: search open PRs.
  candidates="$(api --paginate "repos/$REPO/pulls?state=open&base=$BASE_BRANCH&per_page=100" \
    | jq -s -r --arg sha "$HEAD_SHA" --arg ref "${RUN_HEAD_BRANCH:-}" \
        'add // [] | .[] | select(.head.sha == $sha and .head.ref == $ref) | .number')"
  note "workflow_run.pull_requests empty; searched open PRs by head SHA and branch"
fi
candidates="$(printf '%s\n' "$candidates" | grep -E '^[0-9]+$' | sort -u || true)"
n_candidates="$(printf '%s' "$candidates" | grep -c . || true)"
[ "$n_candidates" -ge 1 ] || skip "no open PR found for head $HEAD_SHA"
[ "$n_candidates" -eq 1 ] || skip "$n_candidates PRs match head $HEAD_SHA; ambiguous"
pr_number="$candidates"
pr_url="$SERVER_URL/$REPO/pull/$pr_number"
note "PR #$pr_number"

pr_json="$(api "repos/$REPO/pulls/$pr_number")"
pf() { jq -r "$1" <<<"$pr_json"; }

# Prints the first reason the PR is not eligible, or nothing when it is.
ineligible() {
  [ "$(pf '.state // ""')" = "open" ] || { echo "PR is $(pf '.state // "unknown"'), not open"; return; }
  [ "$(pf '.draft')" = "false" ] || { echo "PR is a draft"; return; }
  [ "$(pf '.base.ref // ""')" = "$BASE_BRANCH" ] || { echo "base branch is not $BASE_BRANCH"; return; }
  [ "$(pf '.base.repo.full_name // ""')" = "$REPO" ] || { echo "base repository is not $REPO"; return; }
  [ "$(pf '.head.repo.full_name // ""')" = "$REPO" ] || { echo "head branch is not in $REPO (fork or deleted repository)"; return; }
  [ "$(pf '.user.login // ""')" = "$ALLOWED_AUTHOR" ] || { echo "author is not $ALLOWED_AUTHOR"; return; }
  [ "$(jq -r --arg l "$LABEL" 'any(.labels[]?; .name == $l)' <<<"$pr_json")" = "true" ] || { echo "label '$LABEL' not present"; return; }
  [ "$(pf '.head.sha // ""')" = "$HEAD_SHA" ] || { echo "PR head moved to $(pf '.head.sha // ""' | cut -c1-12); the newer commit gets its own CI run"; return; }
  return 0
}

why="$(ineligible)"
[ -z "$why" ] || skip "$why"
note "ok: open, not draft, base $BASE_BRANCH, same-repo head, author $ALLOWED_AUTHOR, label $LABEL, head = CI commit"

# GitHub computes mergeability asynchronously: poll until it is known (default 12 x 5 s).
tries=0
while [ "$(pf '.mergeable')" = "null" ]; do
  tries=$((tries + 1))
  [ "$tries" -le "$POLL_TRIES" ] || skip "GitHub has not computed mergeability after $POLL_TRIES polls"
  sleep "$POLL_SLEEP"
  pr_json="$(api "repos/$REPO/pulls/$pr_number")"
done
why="$(ineligible)"
[ -z "$why" ] || skip "$why"
mergeable="$(pf '.mergeable')"
mergeable_state="$(pf '.mergeable_state // "unknown"')"
[ "$mergeable" = "true" ] || skip "PR is not mergeable (conflicts; mergeable_state=$(safe "$mergeable_state"))"
case "$mergeable_state" in
  dirty|blocked|unknown|draft) skip "mergeable_state is '$(safe "$mergeable_state")'" ;;
esac
note "ok: mergeable (mergeable_state=$(safe "$mergeable_state"))"

# ---- 3. What the PR changes ----------------------------------------------------------------------
block() { # RULE DETAIL
  local rule="$1" detail="$2" marker existing body
  marker="<!-- auto-merge:blocked rule=$rule -->"
  existing="$(api --paginate "repos/$REPO/issues/$pr_number/comments?per_page=100" \
    | jq -s -r --arg m "$marker" '[add // [] | .[] | select((.body // "") | contains($m))] | length')"
  if [ "${existing:-0}" -gt 0 ]; then
    note "a comment for rule $rule already exists; not repeating it"
  else
    # shellcheck disable=SC2016  # literal markdown backticks, nothing to expand
    body="$(printf '%s\n**Auto-merge blocked** by rule `%s`: %s\n\nA human merge is needed. Auto-merge never merges changes to workflow, dependency, deploy, auth or agent-instruction files, or very large changes; see `docs/auto-merge.md`.\n\nHead commit: %s. PR CI run: %s\n' \
      "$marker" "$rule" "$detail" "$HEAD_SHA" "$RUN_HTML_URL")"
    if api --method POST "repos/$REPO/issues/$pr_number/comments" -f body="$body" > /dev/null; then
      note "posted blocking comment (rule $rule)"
    else
      note "WARNING: could not post the blocking comment (rule $rule)"
    fi
  fi
  record BLOCKED "rule $rule: $(safe "$detail")"
  exit 0
}

# Returns 0 when PATH must be merged by a human.
human_only() {
  case "$1" in
    .github/*) return 0 ;;
    package.json|*/package.json|package-lock.json|*/package-lock.json) return 0 ;;
    npm-shrinkwrap.json|*/npm-shrinkwrap.json|.npmrc|*/.npmrc) return 0 ;;
    wrangler.*|*/wrangler.*|open-next.config.ts|next.config.*|middleware.ts) return 0 ;;
    utils/supabase/*|supabase/config.toml) return 0 ;;
    .env*|*/.env*) return 0 ;;
    CLAUDE.md|*/CLAUDE.md|CURSOR.md|*/CURSOR.md|.claude/*|.cursor/*|.claudeignore) return 0 ;;
    workers/*) return 0 ;;
  esac
  return 1
}

changed_files="$(pf '.changed_files // 0')"
lines=$(( $(pf '.additions // 0') + $(pf '.deletions // 0') ))
[ "$changed_files" -le "$MAX_FILES" ] || block too-many-files "$changed_files files changed (limit $MAX_FILES)"
[ "$lines" -le "$MAX_LINES" ] || block too-many-lines "$lines lines changed (limit $MAX_LINES)"

files_json="$(api --paginate "repos/$REPO/pulls/$pr_number/files?per_page=100" | jq -s 'add // []')"
listed="$(jq 'length' <<<"$files_json")"
[ "$listed" -le "$MAX_FILES" ] || block too-many-files "$listed files listed (limit $MAX_FILES)"
[ "$listed" -eq "$changed_files" ] || skip "files API listed $listed files but the PR reports $changed_files; not deciding on a partial list"
deleted="$(jq '[.[] | select(.status == "removed")] | length' <<<"$files_json")"
[ "$deleted" -le "$MAX_DELETED_FILES" ] || block too-many-deletions "$deleted files deleted (limit $MAX_DELETED_FILES)"

hits=()
while IFS= read -r -d '' path; do
  if human_only "$path"; then hits+=("$(safe "$path")"); fi
done < <(jq -j '.[] | (.filename, (.previous_filename // empty)) | (. + "\u0000")' <<<"$files_json")
if [ "${#hits[@]}" -gt 0 ]; then
  # shellcheck disable=SC2016  # literal markdown backticks
  shown="$(printf '`%s`, ' "${hits[@]:0:20}")"
  block human-only-path "touches human-only path(s): ${shown%, }"
fi
note "ok: $changed_files files, $lines lines, $deleted deleted, no human-only path"

# ---- 4. Other checks on the head commit (do not wait; only completed failures count) --------------
failed_checks="$(api --paginate "repos/$REPO/commits/$HEAD_SHA/check-runs?filter=latest&per_page=100" \
  | jq -s -r --argjson ignore "$IGNORED_CHECKS_JSON" '
      [.[].check_runs[]?] | .[]
      | select(.status == "completed")
      | select(.conclusion as $c | ["failure", "timed_out", "action_required", "startup_failure"] | index($c))
      | select(.name as $n | $ignore | index($n) | not)
      | .name')"
if [ -n "$failed_checks" ]; then
  block failed-check "check run(s) failed on the head commit: $(printf '%s' "$failed_checks" | tr '\n' ',' | sed 's/,$//')"
fi
note "ok: no failed check runs (ignoring: $(jq -r 'join(", ")' <<<"$IGNORED_CHECKS_JSON"))"

# ---- 5. Merge exactly the CI-tested commit -------------------------------------------------------
merge_json="$(api --method PUT "repos/$REPO/pulls/$pr_number/merge" -f merge_method=merge -f sha="$HEAD_SHA")" \
  || fail "merge API call failed (GitHub refused: head moved, conflict, or protection rule)"
[ "$(jq -r '.merged // false' <<<"$merge_json")" = "true" ] \
  || fail "GitHub did not merge: $(jq -r '.message // "no message"' <<<"$merge_json")"
merged=1
merged_at="$(date -u '+%Y-%m-%d %H:%M:%S UTC')"
note "MERGED PR #$pr_number at $merged_at (merge commit $(jq -r '.sha // ""' <<<"$merge_json"))"

head_ref="$(pf '.head.ref // ""')"
if [ -n "$head_ref" ] && [ "$head_ref" != "$BASE_BRANCH" ] && [ "$(pf '.head.repo.full_name // ""')" = "$REPO" ]; then
  enc_ref="$(jq -rn --arg r "$head_ref" '$r | split("/") | map(@uri) | join("/")')"
  if api --method DELETE "repos/$REPO/git/refs/heads/$enc_ref" > /dev/null; then note "deleted head branch"
  else note "WARNING: could not delete the head branch"; fi
fi

# A merge made with GITHUB_TOKEN does not trigger push workflows; workflow_dispatch is allowed.
deploy_url="$SERVER_URL/$REPO/actions/workflows/$DEPLOY_WORKFLOW"
if api --method POST "repos/$REPO/actions/workflows/$DEPLOY_WORKFLOW/dispatches" -f ref="$BASE_BRANCH" > /dev/null; then
  deploy_ok=1; deploy_line="Deploy dispatched on \`$BASE_BRANCH\`: $deploy_url"
  note "dispatched $DEPLOY_WORKFLOW on $BASE_BRANCH"
else
  deploy_ok=0; deploy_line="**Deploy dispatch FAILED**: run Deploy by hand at $deploy_url"
  note "ERROR: could not dispatch $DEPLOY_WORKFLOW"
fi

body="$(printf '<!-- auto-merge:merged -->\nMerged automatically at %s by the Auto-merge workflow (commit %s).\n\n- PR CI run: %s\n- Files changed: %s\n- %s\n' \
  "$merged_at" "$HEAD_SHA" "$RUN_HTML_URL" "$changed_files" "$deploy_line")"
if api --method POST "repos/$REPO/issues/$pr_number/comments" -f body="$body" > /dev/null; then note "commented on $pr_url"
else note "WARNING: could not comment on the PR"; fi

if [ "$deploy_ok" = 1 ]; then record MERGE "merged PR #$pr_number at $merged_at; Deploy dispatched"; exit 0; fi
record MERGED_DEPLOY_FAILED "merged PR #$pr_number at $merged_at but the Deploy dispatch failed"
exit 1
