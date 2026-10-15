# Auto-merge

Pull requests opened by Claude sessions used to wait hours for a manual merge. Auto-merge merges such a PR as soon as objective checks pass, and keeps a human on anything security-sensitive. Asked for by Omar on 2026-10-13.

## How it works

1. **PR CI** (`.github/workflows/pr-ci.yml`) runs on every PR to `main` (opened, new push, reopened, ready for review, labelled). Read-only token, no secrets. It runs:
   - the chokepoint gate, only when the PR changes `data/chokepoints/latest.json`: `scripts/card/check-chokepoints.mjs` runs the daily card's own gate (`scripts/card/lib/gates.mjs`, `allowStale = false`, `now` = the current time) and fails on any chokepoint error
   - the daily card's gate unit tests and the auto-merge script's unit tests
   - `npm ci`, `npm run type-check`, `npm run lint`
   - every `tests/unit/*.check.ts` with a pinned `tsx`
   - `npm run build` with placeholder public values (no real keys)
2. When PR CI finishes, **Auto-merge** (`.github/workflows/auto-merge.yml`) starts. It runs with a write token, so it never checks out or runs PR code. It checks out only `.github/scripts/` from `main` and talks to GitHub through the REST API (`.github/scripts/auto-merge.sh`).
3. If every rule below holds, it merges the exact commit that CI tested, deletes the branch, starts **Deploy** on `main`, and comments on the PR with the time, the CI run and the deploy link. A merge made by the workflow's own token does not start push workflows, so the workflow starts Deploy itself.

Every decision (merge, skip, blocked, error) and the reason for it is written to the Auto-merge run's job summary.

## Rules (all must hold)

| Rule | If it fails |
|---|---|
| PR CI succeeded, on a `pull_request` event, from `.github/workflows/pr-ci.yml` | skip |
| Kill switch off (`AUTO_MERGE_DISABLED` not `true`) | skip |
| PR is open, not a draft, targets `main` | skip |
| Branch is in this repository (no forks) | skip |
| Author is `rzjy54n5sh-rgb` | skip |
| Label **`auto-merge`** is on the PR | skip |
| PR head is still the commit CI tested (no newer push) | skip (the newer push gets its own CI run) |
| GitHub reports it mergeable: no conflict, not blocked by a protection rule (waits up to 60 s for GitHub to compute this) | skip |
| At most 100 files and 3,000 changed lines | blocked, with a comment |
| At most 20 files deleted | blocked, with a comment |
| No human-only path (list below), including a file renamed away from one | blocked, with a comment |
| No other check on the head commit has failed. "Workers Builds: menaosint" is ignored: it is a separate Cloudflare project that fails on every PR. Checks still running are not waited for | blocked, with a comment |

"Skip" is silent. "Blocked" posts one PR comment naming the rule and saying a human merge is needed. The comment is not repeated when it is already on the PR. The merge call passes the tested commit (`sha`), so GitHub refuses it if the branch moved in the meantime.

## Human-only paths

A PR touching any of these is never merged automatically:

- `.github/**` (workflows, these scripts)
- `package.json`, `package-lock.json`, `npm-shrinkwrap.json`, `.npmrc` (anywhere in the tree)
- `wrangler.*` (anywhere), `open-next.config.ts`, `next.config.*`, `middleware.ts`
- `utils/supabase/**`, `supabase/config.toml`
- `.env*` (anywhere)
- `CLAUDE.md`, `CURSOR.md` (anywhere), `.claude/**`, `.cursor/**`, `.claudeignore`
- `workers/**`: the scheduler Worker holds a GitHub dispatch token, and its deploy workflow only runs on a push, which an automatic merge does not trigger
- `scripts/write-supabase-client-env.mjs`, `scripts/check-deployed-assets.mjs`: `deploy.yml` runs these by name on the runner that holds `CLOUDFLARE_API_TOKEN`, so a change here runs with deploy privileges
- `scripts/card/lib/gates.mjs`, `scripts/card/check-chokepoints.mjs`: PR CI runs the chokepoint gate against the PR's own tree, so a PR must not be able to both weaken the gate and be validated by the weakened gate in one run

Database migrations under `supabase/migrations/` **are** allowed: merging a migration does not apply it. Migrations are still applied by hand, as before.

## Who adds the label

Claude adds the `auto-merge` label only after its independent verifier has returned **SHIP** for that PR. Without the label nothing is merged automatically. Omar can add or remove the label on any PR.

## Stopping it

- **Everything:** set the repository variable `AUTO_MERGE_DISABLED` to `true` in GitHub: Settings → Secrets and variables → Actions → **Variables** tab → New repository variable. `true`, `1`, `yes` or `on` (any case) turn it off. Delete the variable, or set it to `false`, to turn it back on.
- **One PR:** remove the `auto-merge` label, or convert the PR to a draft.

## Trust model

Auto-merge removes the wait, not the review. The safeguards are Claude's verifier (SHIP before the label goes on), PR CI, the human-only list for files that change the build, deploy, dependencies, auth or agent instructions, and the kill switch.

**What a merged PR gets to run (read this before applying the label).** A merge triggers `deploy.yml` on `main`. `deploy.yml` runs `npm ci` and then `npm run build:cf` (`next build` via OpenNext) **on a runner that, in its deploy step, holds `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`**. `next build` executes module top-level code from the whole application graph — `app/**`, `components/**`, `lib/**`, `hooks/**`, `stores/**` — none of which is a human-only path. Because `node_modules` and the workspace persist across steps in the one deploy job, build-time code can plant a payload that runs in the later `npx wrangler deploy` step, where the Cloudflare deploy token is present; that token can edit every Worker and its secrets. **The human-only list cannot close this**: it blocks the build *configuration* files, but not the application code that the build executes. Therefore the only real barrier against a malicious or mistaken code PR reaching the Cloudflare deploy token is the verifier returning SHIP. Treat every code PR you label as deploy-token-sensitive, not merely as "runs in the Worker at runtime". If that barrier is not acceptable, split `deploy.yml` so the untrusted `next build` runs in a job with no Cloudflare token and hands only built artifacts to a separate deploy job, or keep deploy on a human merge.

## Notes

- **This PR must be merged by a human.** It touches `.github/`, which is human-only. GitHub only runs a `workflow_run` workflow once its file is on the default branch, so Auto-merge starts working after this PR is merged.
- **Workflow permissions.** Auto-merge declares its own `permissions:` (contents, pull-requests and actions write; checks read). On a personal repository that block is honoured even when Settings → Actions → General → "Workflow permissions" is set to read-only. No setting has to change for that.
- **Branch protection.** If `main` ever gets a protection rule that requires reviews, GitHub reports such PRs as `blocked` and Auto-merge skips them.
- Unit tests for the decision script: `bash .github/scripts/tests/auto-merge.test.sh`. It is offline: a stub replaces `gh` and serves fixture JSON.

## Status

Live on `main` since 2026-10-13 (PR #34, merged 09:59 UTC). First end-to-end test: this note, merged by the Auto-merge workflow.
