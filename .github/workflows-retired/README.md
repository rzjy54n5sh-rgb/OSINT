# Retired AI workflows — do not move back into .github/workflows/

Retired 2026-10-05 by operator decision. These five workflows were the platform's
agent-based analysis layer. Together they burned roughly $100 of Anthropic API
credit with very little written to show for it.

## Run history at retirement

| Workflow | Runs | Failed | Succeeded | Paid API per run? |
|---|---|---|---|---|
| daily-analysis.yml | 93 | 74 | 18 | Yes — 2 Claude calls |
| daily_pipeline.yml | 100 | 64 | 36 | Yes — re-ran daily_analysis.py plus stage4 reports |
| social-analysis.yml | 75 | 61 | 10 | Yes |
| strategic-analysis.yml | 33 | 26 | 3 | Yes |
| disinfo-analysis.yml | 22 | 22 | 0 | **No** — crashed before the paid call |

## Where the money actually went

- **daily_analysis.py ran twice a day.** It was scheduled at 06:00 UTC in both
  `daily-analysis.yml` and `daily_pipeline.yml`, and it never checked whether the day
  was already complete. Both runs paid for two Claude calls every day.
- **The paid calls came before validation.** A strict check (20 countries x 4 scenario
  integers must each sum to exactly 100, among others) then failed and the job exited 1
  after the credit was spent.
- **Strategic and social "successes" are unreliable.** A failed Supabase write only printed
  a warning and exited 0, so a run could pay and write nothing yet show green.

## What did not cost anything

- **disinfo-analysis.yml (0 of 22).** Its first action read `disinformation_tracker`, a table
  that does not exist; the uncaught 404 killed it before the paid call. It was also forbidden
  by the structural-neutrality rule (no AI writes to the disinformation tracker).
- **detect_scenarios.py** never called the API: its input came from `stage1_fetch.py`, a stub
  that always wrote an empty article list. `stage2` and `stage3` were stubs too, so the
  documented "5-stage pipeline" never ran as described.

## Replacement

All agent-based analysis now runs as a Claude scheduled task managed from the operator's
Claude session, on subscription rather than metered API credit. The scripts in
`.github/workflows/scripts/` are kept as reference for what each job was meant to produce.

Only non-AI collectors remain in GitHub Actions: feeds, markets, social trends, disinfo
claims, deploy, plus the manual-only E2E and migration workflows.
