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

## Decisions

---

### DECISION-005 — Platform Build Complete + Launch Readiness (March 2026)
**Date:** 2026-03-18
**Made by:** Omar
**Context:** All 14 platform phases built, tested, verified, and pushed to main on Day 19.

**Decision:**
Platform is declared production-ready. Build is frozen. No new phases.
All future platform work uses post-launch Cursor prompts (not phase numbering).

**What was completed:**
- Next.js 15.2.3+ / Supabase / Cloudflare Workers / Stripe / Resend stack
- 16 Edge Functions deployed (10 public + 6 admin)
- 8 database migrations confirmed (tier_features=18, article_sources=26, platform_alerts=6)
- Admin panel: 16 pages, 5 RBAC roles, AI Agent (role-scoped, audit-logged)
- Tier gating: 18 feature flags, all runtime-configurable via /admin/tier-features
- Automated pipeline: 5 stages, GitHub Actions cron 06:00 UTC, 94+ RSS sources
- Security: CVE-2025-29927 patched, defense-in-depth auth, secrets audit passed
- Full integration test suite passed. All 10 hard gates cleared.

**Current status:** In soft launch sequence (DECISION-004). No code changes unless a bug demands it.

**Reversal condition:** N/A — this is a milestone record, not an ongoing decision.

**Status:** COMPLETE ✅

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

---

### DECISION-003 — Platform Architecture (March 2026)
**Date:** 2026-03-17
**Made by:** Omar
**Context:** 14-phase full-stack build of the MENA Intel Desk platform, completed and verified March 2026.

**Infrastructure decisions:**
- Cloudflare Workers via OpenNext (not Cloudflare Pages) — full Node.js runtime required
- Next.js 15.2.3+ minimum enforced — CVE-2025-29927 patch non-negotiable
- @supabase/ssr replacing @supabase/auth-helpers-nextjs (deprecated, Workers-incompatible)
- Resend for email (not Nodemailer — incompatible with Workers runtime)
- wrangler.jsonc: compatibility_date 2025-05-05+ with nodejs_compat (earlier dates break process.env)
- Defense-in-depth auth: middleware Layer 1 + per-page server check Layer 2 on every admin route
- No global Supabase clients anywhere — new client per request (Cloudflare Workers requirement)

**Intelligence layer decisions:**
- Structural neutrality enforced at data layer, not just framing
- Velocity computed at display time — never stored in nai_scores table (no velocity column)
- scenario_probabilities: one row per conflict_day (not one per scenario)
- Disinformation tracker: CONTESTED for party-source-only claims, not DEBUNKED
- Scenario detection: candidates require admin approval, never auto-approved
- Both acting_party_framing AND affected_party_framing required on all scenario records

**Admin and RBAC decisions:**
- 5 roles: SUPER_ADMIN, INTEL_ANALYST, USER_MANAGER, FINANCE_MANAGER, CONTENT_REVIEWER
- AI agent inherits logged-in admin role exactly
- AI agent prohibited from touching scenario_probabilities and disinformation_tracker (structural neutrality)
- Audit log is immutable — no UPDATE or DELETE policy, ever

**Payments decisions:**
- 3 tiers × 3 currencies = 9 Stripe prices (USD/AED/EGP)
- Customer Portal via Edge Function — users self-serve billing without admin involvement
- All feature flags in database — admin can toggle without redeployment

**Reversal conditions:**
- Cloudflare Workers → Pages: only if OpenNext drops Workers support
- @supabase/ssr → other: only if Supabase deprecates it
- Immutable audit log: never — this is a structural integrity requirement

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

---

### DECISION-001 — Structural Neutrality as Architecture (March 2026)
**Date:** 2026-03-09
**Made by:** Omar
**Context:** Platform founding principle.

**Decision:**
Structural neutrality is an architectural constraint, not a marketing claim. It is enforced
at the data storage layer, the content framing layer, and the UI rendering layer simultaneously.
No single party's framing dominates any output at any tier. Specific rules:
- Casualty counts ordered by total (highest first, regardless of party)
- Khamenei = "killed/martyred" — both framings included, not one
- Iran civilian harm from US-Israel strikes included in all conflict coverage
- Iran's Gulf target rationale (US bases) presented alongside Gulf states' rejection of it
- Disinformation tracker uses CONTESTED for party-source-only claims (not DEBUNKED)
- Scenario descriptions include both acting_party_framing and affected_party_framing

**Reversal condition:** Never. Structural neutrality is the platform's core value proposition.
Any perceived compromise ends the platform's credibility permanently.

**Status:** PERMANENT — cannot be reversed
