# Retired AI workflows — do not move back into .github/workflows/

Retired 2026-10-05 by operator decision. These five workflows called the Anthropic
(and Perplexity) API on every run and burned roughly $100 of credit with almost
nothing to show for it. Run history at retirement:

| Workflow | Runs | Failed | Succeeded |
|---|---|---|---|
| daily-analysis.yml | 93 | 74 | 18 |
| daily_pipeline.yml | 100 | 64 | 36 |
| disinfo-analysis.yml | 22 | 22 | 0 |
| social-analysis.yml | 75 | 61 | 10 |
| strategic-analysis.yml | 33 | 26 | 3 |

Failure mode: the paid model call happened first, then schema validation or a write
to a non-existent table (`disinformation_tracker`) failed and the job exited 1 —
credit spent, nothing written.

**Replacement:** all agent-based analysis now runs as Claude scheduled tasks managed
from the operator's Claude session (on subscription, not metered API credit).
The scripts in `.github/workflows/scripts/` are kept as reference for what each job produced.

Only non-AI collectors remain in GitHub Actions: feeds, markets, social trends,
disinfo claims, deploy, and the manual-only E2E and migration workflows.
