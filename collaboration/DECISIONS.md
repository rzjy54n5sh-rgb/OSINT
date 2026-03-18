# MENA Intel Desk — Decision Log

> Every significant strategic or methodological decision is logged here.
> Purpose: prevent re-litigation of settled questions, give Claude context on why things are built the way they are.
> Format: Decision number, date, what was decided, why, and what would cause a reversal.

---

## How to Use This File

- Log a decision here whenever a debate closes, a strategic choice is made, or a methodology rule is locked
- Include the reversal condition — what evidence or circumstance would cause you to revisit this
- Never delete entries. If a decision is reversed, add a "REVERSED" note with date and reason

---

## Decision Template

(Use the structure below when logging a new decision.)

---

## Decisions

### DECISION-004 — Soft Launch Sequence (March 2026)
**Date:** 2026-03-17
**Made by:** Omar
**Context:** All 14 platform phases verified. Platform is production-ready.

**Decision:**
- Day 1: Share with 5 trusted people only. No public link.
- Day 3-5: Fix any issues. Adjust tier flags in /admin/tier-features (no redeployment needed).
- Day 7: Soft public launch.
- Week 2: First real subscriber — verify Stripe live mode end-to-end.
- Month 1: Tune pipeline and sources via admin panel. No code changes.

**Reasoning:**
Platform verified but untested at real-world load. Gradual rollout allows fixing issues
before they affect paying subscribers. Admin panel controls all tier features at runtime —
no redeployment needed for any configuration change.

**Reversal condition:**
If an urgent newsworthy development demands immediate public launch, this sequence
can be compressed. Decision remains active as default rollout posture.

**Status:** ACTIVE

---

### DECISION-003 — Platform Architecture Finalized (March 2026)
**Date:** 2026-03-17
**Made by:** Omar
**Context:** 14-phase platform build completed and verified.

**Decision:**
- Stack: Next.js 15.2.3+ / Supabase / Cloudflare Workers (OpenNext) / Stripe / Resend
- Auth: @supabase/ssr only — @supabase/auth-helpers-nextjs deprecated and removed
- Email: Resend (HTTP-based, Cloudflare Workers compatible) — Nodemailer rejected (incompatible)
- Deployment: Cloudflare Workers via OpenNext — NOT Cloudflare Pages (Workers = full Node.js runtime)
- wrangler.jsonc: compatibility_date 2025-05-05+ with nodejs_compat flag (earlier dates break process.env)
- CVE-2025-29927: patched at Next.js level (15.2.3+) AND Cloudflare WAF header strip rule
- Admin agent: does NOT touch scenario_probabilities or disinformation_tracker (structural neutrality)
- Scenario detection: writes status=candidate only — admin approval required before going live
- No global Supabase clients anywhere — new client per request (Cloudflare Workers requirement)
- Defense-in-depth auth: middleware Layer 1 + per-page server check Layer 2 (CVE defense)

**Reasoning:**
Each decision above was made to resolve a specific failure mode discovered during build.
Full rationale documented in MENA_MASTER_PLAN_V2.md and MENA_PROJECT_INSTRUCTIONS_V3.md.
See PLATFORM_BUILD.md in this folder for collaborator-facing summary.

**Reversal condition:**
Stack changes would require a full re-evaluation. No reversals anticipated for core architecture.
Stripe, Resend, and Cloudflare choices are locked until a clear business case for switching.

**Status:** ACTIVE

---

### DECISION-002 — Source Tier Reclassification (March 2026)
**Date:** 2026-03-15
**Made by:** Omar
**From:** Colleague stress-test report (SOURCE_OBJECTIVITY_STRESS_TEST.pdf)

**Decision:**
- Al Jazeera English demoted to Tier 2 for Egypt/UAE analysis
- Financial Times promoted to conditional Tier 1 for economic/energy analysis
- Middle East Eye demoted to Tier 3 for Egypt-specific analysis
- Bias notes added to Reuters, AP, ISW, Bellingcat
- Arabic & Regional Sources section added to SOURCES.md
- Source Universe Audit Requirement added as mandatory pre-publish check
- 7 new Arabic/regional RSS feeds added to ingestion pipeline

**Reasoning:**
Adversarial stress-test revealed that the original source universe was exclusively English-language
Western outlets. This creates upstream bias that contaminates analysis before methodology is even
applied. The AJE conflict of interest with Egypt and UAE — the platform's two primary country
exposures — was the most critical finding requiring immediate action.

**Reversal condition:**
AJE reclassification would be reconsidered if Qatar-Egypt/UAE relations normalize significantly.
FT conditional Tier 1 would be reconsidered if FT's MENA economic coverage quality declines.

**Status:** ACTIVE

### DECISION-003 — Platform Build Architecture (March 2026)

**Date:** 2026-03-17
**Made by:** Omar
**Context:** 14-phase full-stack build of the MENA Intel Desk platform, completed and verified March 17, 2026.

**Decisions made:**

**Infrastructure:**
- Cloudflare Workers via OpenNext (not Cloudflare Pages) — full Node.js runtime required
- Next.js 15.2.3+ minimum enforced — CVE-2025-29927 patch non-negotiable
- @supabase/ssr replacing @supabase/auth-helpers-nextjs (deprecated, Workers-incompatible)
- Resend for email (not Nodemailer — incompatible with Workers runtime)
- Defense-in-depth auth: middleware + per-page server check on every admin route

**Intelligence layer:**
- Structural neutrality enforced at data layer, not just framing
- Velocity computed at display time, never stored in nai_scores table
- scenario_probabilities: one row per conflict_day (not one per scenario)
- Disinformation tracker: CONTESTED status for party-source-only claims, not DEBUNKED
- Scenario detection: candidates require admin approval, never auto-approved

**Admin and RBAC:**
- 5 roles: SUPER_ADMIN, INTEL_ANALYST, USER_MANAGER, FINANCE_MANAGER, CONTENT_REVIEWER
- AI agent inherits logged-in admin role exactly
- AI agent prohibited from touching scenario_probabilities and disinformation_tracker
- Audit log is immutable — no UPDATE or DELETE policy, ever

**Payments:**
- 3 tiers x 3 currencies = 9 Stripe prices
- Customer Portal via Edge Function (users self-serve billing without admin involvement)
- All feature flags in database — admin can toggle without redeployment

**Reversal conditions:**
- Cloudflare Workers → Pages: only if OpenNext drops Workers support
- @supabase/ssr → other: only if Supabase deprecates it
- Stripe Customer Portal: only if Stripe changes the portal API significantly
- Immutable audit log: never — this is a structural integrity requirement

**Status:** ACTIVE

---

### DECISION-004 — Soft Launch Sequence (March 2026)

**Date:** 2026-03-17
**Made by:** Omar
**Context:** All 14 phases verified. Platform is production-ready. Deciding launch sequence.

**Decision:**
Phase the launch rather than going public immediately:
- Days 1-3: 5 trusted users only, observe usage, fix what breaks
- Days 3-5: Tune tier feature flags in /admin/tier-features (no redeployment)
- Day 7: Soft public launch, monitor /admin/feed and /admin/pipeline
- Week 2: First real subscriber, verify Stripe live mode end-to-end
- Month 1: Tune pipeline cron and article sources via admin panel (no code changes)

**Reasoning:**
Real users break things that test users do not. The admin panel feature flag system
is designed precisely for this — adjusting what free/informed/pro tiers can see
without requiring a deployment. It is faster to tune live than to test exhaustively
before launch.

**Reversal condition:** If a critical security issue is found post-launch, take platform
offline immediately and fix before re-opening. Do not patch around a security issue.

**Status:** ACTIVE
