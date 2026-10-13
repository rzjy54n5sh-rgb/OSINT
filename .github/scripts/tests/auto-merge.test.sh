#!/usr/bin/env bash
# Unit tests for .github/scripts/auto-merge.sh. Offline: `gh` is replaced by tests/stub/gh, which serves
# fixture JSON built below and records every API call. Run: bash .github/scripts/tests/auto-merge.test.sh
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../auto-merge.sh"
REPO_NAME="rzjy54n5sh-rgb/OSINT"
SHA="0123456789abcdef0123456789abcdef01234567"
OTHER_SHA="fedcba9876543210fedcba9876543210fedcba98"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

pass=0
fail=0
failed_names=()

# ---- fixture builders ----------------------------------------------------------------------------
base_pull() {
  jq -n --arg sha "$SHA" --arg repo "$REPO_NAME" '{
    number: 42, state: "open", draft: false, title: "feat: something",
    user: {login: "rzjy54n5sh-rgb"},
    labels: [{name: "auto-merge"}, {name: "data"}],
    head: {sha: $sha, ref: "feat/x", repo: {full_name: $repo}},
    base: {ref: "main", repo: {full_name: $repo}},
    mergeable: true, mergeable_state: "unstable",
    changed_files: 2, additions: 40, deletions: 3
  }'
}
base_files() {
  jq -n '[
    {filename: "app/page.tsx", status: "modified", additions: 30, deletions: 3},
    {filename: "supabase/migrations/20261013000000_add_x.sql", status: "added", additions: 10, deletions: 0}
  ]'
}
base_checks() {
  jq -n '{total_count: 3, check_runs: [
    {name: "ci", status: "completed", conclusion: "success"},
    {name: "Workers Builds: menaosint", status: "completed", conclusion: "failure"},
    {name: "auto-merge", status: "in_progress", conclusion: null}
  ]}'
}

# new_case NAME: fresh fixture dir with the happy-path fixtures and default env.
new_case() {
  CASE="$1"
  FIX="$WORK/$CASE/fixtures"
  STATE="$WORK/$CASE/state"
  LOG="$WORK/$CASE/calls.log"
  mkdir -p "$FIX" "$STATE"
  : > "$LOG"
  base_pull > "$FIX/GET_pulls_42.json"
  jq -s '.' "$FIX/GET_pulls_42.json" > "$FIX/GET_pulls.json"
  base_files > "$FIX/GET_pulls_42_files.json"
  base_checks > "$FIX/GET_commits_${SHA}_check-runs.json"
  echo '[]' > "$FIX/GET_issues_42_comments.json"
  jq -n --arg sha "$SHA" '{merged: true, sha: "aaaa", message: "Pull Request successfully merged"}' > "$FIX/PUT_pulls_42_merge.json"
  echo '{"id": 1}' > "$FIX/POST_issues_42_comments.json"
  ENV_EVENT="pull_request"
  ENV_CONCLUSION="success"
  ENV_HEAD_SHA="$SHA"
  ENV_HEAD_BRANCH="feat/x"
  ENV_PATH=".github/workflows/pr-ci.yml"
  ENV_PRS='[{"number": 42}]'
  ENV_DISABLED=""
}
# patch_pull JQ_FILTER: edit the PR object (and the open-PR list) in place.
patch_pull() {
  jq "$1" "$FIX/GET_pulls_42.json" > "$FIX/p.tmp" && mv "$FIX/p.tmp" "$FIX/GET_pulls_42.json"
  jq -s '.' "$FIX/GET_pulls_42.json" > "$FIX/GET_pulls.json"
}
# set_files JSON: replace the PR's file list and keep .changed_files consistent with it.
set_files() {
  printf '%s' "$1" > "$FIX/GET_pulls_42_files.json"
  patch_pull ".changed_files = $(jq 'length' "$FIX/GET_pulls_42_files.json")"
}

run_case() {
  OUT="$WORK/$CASE/out.txt"
  SUMMARY="$WORK/$CASE/summary.md"
  GHOUT="$WORK/$CASE/gh_output"
  : > "$SUMMARY"; : > "$GHOUT"
  if [ ! -f "$SCRIPT" ]; then echo "script missing: $SCRIPT" > "$OUT"; RC=127; DECISION=""; return; fi
  env -i PATH="$HERE/stub:/usr/bin:/bin:/usr/local/bin" HOME="$WORK" \
    STUB_FIXTURES="$FIX" STUB_STATE="$STATE" STUB_LOG="$LOG" \
    REPO="$REPO_NAME" SERVER_URL="https://github.com" \
    RUN_EVENT="$ENV_EVENT" RUN_CONCLUSION="$ENV_CONCLUSION" RUN_HEAD_SHA="$ENV_HEAD_SHA" \
    RUN_HEAD_BRANCH="$ENV_HEAD_BRANCH" RUN_PATH="$ENV_PATH" RUN_PULL_REQUESTS="$ENV_PRS" \
    RUN_HTML_URL="https://github.com/$REPO_NAME/actions/runs/1" \
    AUTO_MERGE_DISABLED="$ENV_DISABLED" \
    MERGEABLE_POLL_TRIES="${POLL_TRIES:-3}" MERGEABLE_POLL_SLEEP=0 \
    GITHUB_STEP_SUMMARY="$SUMMARY" GITHUB_OUTPUT="$GHOUT" \
    bash "$SCRIPT" > "$OUT" 2>&1
  RC=$?
  DECISION="$(sed -n 's/^decision=//p' "$GHOUT" | tail -n1)"
}

ok() { pass=$((pass + 1)); printf 'ok   %s\n' "$CASE"; }
bad() { fail=$((fail + 1)); failed_names+=("$CASE"); printf 'FAIL %s: %s\n' "$CASE" "$1"; sed 's/^/       | /' "$OUT" 2>/dev/null | tail -n 15; }
called() { grep -qF -- "$1" "$LOG"; }

# expect DECISION RC [must-call...] -- [must-not-call...]
expect() {
  local want="$1" want_rc="$2"; shift 2
  local mode="call" msg=""
  [ "$DECISION" = "$want" ] || msg="decision '$DECISION' != '$want'"
  [ -z "$msg" ] && [ "$RC" != "$want_rc" ] && msg="exit $RC != $want_rc"
  for a in "$@"; do
    [ -n "$msg" ] && break
    if [ "$a" = "--" ]; then mode="nocall"; continue; fi
    if [ "$mode" = "call" ]; then called "$a" || msg="expected call missing: $a"
    else called "$a" && msg="unexpected call: $a"; fi
  done
  [ -z "$msg" ] && ! grep -q "$want" "$SUMMARY" && msg="job summary does not record $want"
  if [ -z "$msg" ]; then ok; else bad "$msg"; fi
}

MERGE_CALL="PUT repos/$REPO_NAME/pulls/42/merge"
DISPATCH_CALL="POST repos/$REPO_NAME/actions/workflows/deploy.yml/dispatches"
COMMENT_CALL="POST repos/$REPO_NAME/issues/42/comments"

# ---- cases ---------------------------------------------------------------------------------------
new_case happy_path_merges; run_case
expect MERGE 0 "$MERGE_CALL" "field merge_method=merge" "field sha=$SHA" \
  "DELETE repos/$REPO_NAME/git/refs/heads/feat/x" "$DISPATCH_CALL" "field ref=main" "$COMMENT_CALL"
if grep -q '^Merged automatically at [0-9-]* [0-9:]* UTC' "$LOG" && grep -q 'actions/runs/1' "$LOG" && grep -q 'Files changed: 2' "$LOG"; then
  CASE=happy_path_comment_content; ok; else CASE=happy_path_comment_content; bad "merged comment lacks time/run/files"; fi

new_case resolves_pr_by_head_sha_when_pull_requests_empty; ENV_PRS='[]'; run_case
expect MERGE 0 "GET repos/$REPO_NAME/pulls?state=open" "$MERGE_CALL"

new_case no_label_skips; patch_pull '.labels = [{name: "data"}]'; run_case
expect SKIP 0 -- "$MERGE_CALL" "$COMMENT_CALL" "$DISPATCH_CALL"

new_case fork_skips; patch_pull '.head.repo.full_name = "evil/OSINT"'; run_case
expect SKIP 0 -- "$MERGE_CALL" "$COMMENT_CALL"

new_case deleted_fork_null_head_repo_skips; patch_pull '.head.repo = null'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case wrong_author_skips; patch_pull '.user.login = "someone-else"'; run_case
expect SKIP 0 -- "$MERGE_CALL" "$COMMENT_CALL"

new_case draft_skips; patch_pull '.draft = true'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case closed_pr_skips; patch_pull '.state = "closed"'; ENV_PRS='[{"number": 42}]'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case base_not_main_skips; patch_pull '.base.ref = "release"'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case head_sha_moved_skips; patch_pull ".head.sha = \"$OTHER_SHA\""; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case touches_workflow_blocked_with_comment
set_files '[{"filename": "app/a.ts", "status": "modified", "additions": 1, "deletions": 0},
            {"filename": ".github/workflows/x.yml", "status": "added", "additions": 5, "deletions": 0}]'
run_case
expect BLOCKED 0 "$COMMENT_CALL" "auto-merge:blocked rule=human-only-path" ".github/workflows/x.yml" -- "$MERGE_CALL" "$DISPATCH_CALL"

new_case blocked_comment_not_repeated
set_files '[{"filename": ".github/workflows/x.yml", "status": "added", "additions": 5, "deletions": 0}]'
jq -n '[{"id": 9, "body": "earlier\n<!-- auto-merge:blocked rule=human-only-path -->\nAuto-merge blocked"}]' > "$FIX/GET_issues_42_comments.json"
run_case
expect BLOCKED 0 "GET repos/$REPO_NAME/issues/42/comments" -- "$COMMENT_CALL" "$MERGE_CALL"

new_case touches_package_lock_blocked
set_files '[{"filename": "package-lock.json", "status": "modified", "additions": 50, "deletions": 50}]'
run_case
expect BLOCKED 0 "$COMMENT_CALL" "package-lock.json" -- "$MERGE_CALL"

new_case touches_nested_package_json_blocked
set_files '[{"filename": "scripts/card/package.json", "status": "modified", "additions": 1, "deletions": 1}]'
run_case
expect BLOCKED 0 "$COMMENT_CALL" -- "$MERGE_CALL"

new_case rename_out_of_github_blocked
set_files '[{"filename": "docs/x.yml", "previous_filename": ".github/workflows/deploy.yml", "status": "renamed", "additions": 0, "deletions": 0}]'
run_case
expect BLOCKED 0 "$COMMENT_CALL" -- "$MERGE_CALL"

for p in "utils/supabase/server.ts" "middleware.ts" "next.config.js" "wrangler.jsonc" "open-next.config.ts" \
         ".env.production" "supabase/config.toml" "CLAUDE.md" "CURSOR.md" "workers/scheduler/src/index.ts" ".claude/settings.json"; do
  new_case "human_only_${p//[^A-Za-z0-9]/_}_blocked"
  set_files "$(jq -n --arg f "$p" '[{filename: $f, status: "modified", additions: 1, deletions: 1}]')"
  run_case
  expect BLOCKED 0 "$COMMENT_CALL" -- "$MERGE_CALL"
done

new_case over_100_files_blocked; patch_pull '.changed_files = 101'
set_files "$(jq -n '[range(0;101) | {filename: "app/f\(.).ts", status: "modified", additions: 1, deletions: 0}]')"
run_case
expect BLOCKED 0 "$COMMENT_CALL" "auto-merge:blocked rule=too-many-files" -- "$MERGE_CALL"

new_case over_3000_lines_blocked; patch_pull '.additions = 2990 | .deletions = 20'; run_case
expect BLOCKED 0 "$COMMENT_CALL" "auto-merge:blocked rule=too-many-lines" -- "$MERGE_CALL"

new_case over_20_deletions_blocked; patch_pull '.changed_files = 21'
set_files "$(jq -n '[range(0;21) | {filename: "public/old\(.).png", status: "removed", additions: 0, deletions: 0}]')"
run_case
expect BLOCKED 0 "$COMMENT_CALL" "auto-merge:blocked rule=too-many-deletions" -- "$MERGE_CALL"

new_case other_check_failed_blocked
jq '.check_runs += [{name: "e2e", status: "completed", conclusion: "failure"}]' "$FIX/GET_commits_${SHA}_check-runs.json" > "$FIX/c.tmp" \
  && mv "$FIX/c.tmp" "$FIX/GET_commits_${SHA}_check-runs.json"
run_case
expect BLOCKED 0 "$COMMENT_CALL" "auto-merge:blocked rule=failed-check" -- "$MERGE_CALL"

new_case kill_switch_skips_without_api_calls; ENV_DISABLED="true"; run_case
expect SKIP 0 -- "GET " "$MERGE_CALL"

new_case kill_switch_uppercase_skips; ENV_DISABLED="TRUE"; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case ci_failure_skips_without_api_calls; ENV_CONCLUSION="failure"; run_case
expect SKIP 0 -- "GET " "$MERGE_CALL"

new_case non_pull_request_event_skips; ENV_EVENT="push"; run_case
expect SKIP 0 -- "GET " "$MERGE_CALL"

new_case other_workflow_file_skips; ENV_PATH=".github/workflows/fake.yml"; run_case
expect SKIP 0 -- "GET " "$MERGE_CALL"

new_case workflow_path_with_ref_suffix_merges; ENV_PATH=".github/workflows/pr-ci.yml@refs/pull/42/merge"; run_case
expect MERGE 0 "$MERGE_CALL"

new_case invalid_head_sha_skips; ENV_HEAD_SHA='abc;touch /tmp/pwned'; run_case
expect SKIP 0 -- "GET " "$MERGE_CALL"

new_case pr_not_found_skips; ENV_PRS='[]'; echo '[]' > "$FIX/GET_pulls.json"; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case mergeable_null_then_true_merges
patch_pull '.mergeable = null | .mergeable_state = "unknown"'
mv "$FIX/GET_pulls_42.json" "$FIX/GET_pulls_42.1.json"
cp "$FIX/GET_pulls_42.1.json" "$FIX/GET_pulls_42.2.json"
base_pull > "$FIX/GET_pulls_42.json"
run_case
expect MERGE 0 "$MERGE_CALL"

new_case mergeable_never_computed_skips; patch_pull '.mergeable = null | .mergeable_state = "unknown"'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case conflict_dirty_skips; patch_pull '.mergeable = false | .mergeable_state = "dirty"'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case blocked_by_protection_skips; patch_pull '.mergeable_state = "blocked"'; run_case
expect SKIP 0 -- "$MERGE_CALL"

new_case api_error_fails_closed; touch "$FIX/GET_pulls_42_files.fail"; run_case
if [ "$DECISION" != "MERGE" ] && [ "$RC" -ne 0 ] && ! called "$MERGE_CALL"; then ok; else bad "decision=$DECISION rc=$RC (want non-zero, no merge)"; fi

new_case merge_refused_by_github_errors; echo '{"merged": false, "message": "Head branch was modified"}' > "$FIX/PUT_pulls_42_merge.json"; run_case
expect ERROR 1 "$MERGE_CALL" -- "$DISPATCH_CALL"

new_case dispatch_failure_reported; touch "$FIX/POST_actions_workflows_deploy.yml_dispatches.fail"; run_case
expect MERGED_DEPLOY_FAILED 1 "$MERGE_CALL" "$DISPATCH_CALL" "$COMMENT_CALL"

# Script-injection: hostile branch name and title must stay data. Note: a literal space is not a valid
# git ref character, so ${IFS} is the realistic form; both are tried.
# shellcheck disable=SC2016  # these strings must NOT expand: they are the hostile input
for evil in '$(touch /tmp/pwned)' '$(touch${IFS}/tmp/pwned)' 'x;touch${IFS}/tmp/pwned;`touch${IFS}/tmp/pwned`'; do
  rm -f /tmp/pwned
  new_case "injection_$(printf '%s' "$evil" | sha1sum | cut -c1-8)"
  jq --arg b "$evil" '.head.ref = $b | .title = "`touch /tmp/pwned` $(touch /tmp/pwned) \"; touch /tmp/pwned"' "$FIX/GET_pulls_42.json" > "$FIX/p.tmp" \
    && mv "$FIX/p.tmp" "$FIX/GET_pulls_42.json" && jq -s '.' "$FIX/GET_pulls_42.json" > "$FIX/GET_pulls.json"
  ENV_HEAD_BRANCH="$evil"
  run_case
  # shellcheck disable=SC2016  # the grep below uses a literal character class
  if [ -e /tmp/pwned ]; then bad "/tmp/pwned was created: code executed"; rm -f /tmp/pwned
  elif [ "$DECISION" != "MERGE" ]; then bad "decision '$DECISION' (hostile names should still merge as data)"
  elif ! grep -q "^DELETE repos/$REPO_NAME/git/refs/heads/" "$LOG"; then bad "branch delete not attempted"
  elif grep -q '^DELETE .*[$();` ]' "$LOG"; then bad "branch name not URL-encoded in DELETE path: $(grep '^DELETE' "$LOG")"
  else ok; fi
done

echo
echo "passed: $pass  failed: $fail"
if [ "$fail" -gt 0 ]; then printf '  - %s\n' "${failed_names[@]}"; exit 1; fi
exit 0
