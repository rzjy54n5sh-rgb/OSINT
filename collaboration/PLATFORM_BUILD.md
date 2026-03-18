# PLATFORM BUILD — Collaborator Reference
**Status: ✅ COMPLETE — All 14 phases built, tested, verified, pushed (March 18, 2026)**

> This file is for your context only. You do not build, review, or access the platform.
> It exists so you understand what infrastructure your analytical work runs on.

---

## What This Platform Is

MENA Intel Desk is a live OSINT intelligence platform tracking the US-Iran War 2026.
It is an anonymously-operated subscription intelligence service, not a news outlet.

**Core principle:** Structural neutrality — enforced at the data layer, not just in framing.

**Three user tiers:**
- Free: Basic access (NAI expressed scores, scenario bars, 5 disinformation entries)
- Informed (~$9/month): Egypt + UAE country reports, full NAI, full disinformation tracker
- Professional (~$29/month): All 20+ countries, Arabic reports, API access, full reports

---

## The Stack (for context — not for you to modify)

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 15.2.3+ / TypeScript / Tailwind |
| Database | Supabase PostgreSQL |
| Hosting | Cloudflare Workers (OpenNext) |
| Auth | Supabase Auth (@supabase/ssr) |
| Payments | Stripe (3 tiers × 3 currencies) |
| Email | Resend |
| Edge Functions | 16 total (10 public + 6 admin) |

---

## The Daily Intelligence Pipeline

The platform runs an automated 5-stage pipeline every day at 06:00 UTC:

1. **Fetch** — Perplexity AI pulls from 94+ RSS sources across 20+ countries
2. **Analysis** — Claude Sonnet produces NAI scores and country reports
3. **DB Write** — Results written to Supabase (idempotent — safe to re-run)
4. **Reports** — 11 files generated: 5 English .docx + 5 Arabic .docx + 1 SQL
5. **Scenario Detection** — Checks if a genuinely new scenario (F, G...) has emerged

**Scenario detection rules** (all three required for a new scenario):
1. Named by ≥2 independent sources in today's data
2. New state actor entering OR new instrument category (nuclear/chemical/ground/second front)
3. NOT reducible to existing scenarios A-E

Candidates go to `detected_scenarios` with `status='candidate'` — admin approval required.

---

## What the Admin AI Agent Does (and Does NOT Do)

The admin panel has an AI agent (Claude Sonnet, role-scoped).

**It CAN help with:**
- Adding/removing RSS sources
- Adjusting pipeline schedules
- Tier feature flag changes
- User management
- Reviewing audit logs

**It CANNOT touch (by design):**
- `scenario_probabilities` table — that's the intelligence layer, not the ops layer
- `disinformation_tracker` — same reason
- These live on the public platform frontend under structural neutrality rules

**Your work** (scenario probabilities, disinformation analysis) is independent of this agent.

---

## What This Means for Your Analytical Work

**Nothing changes.** You operate through this `/collaboration/` folder only.

The pipeline produces raw intelligence. You provide the strategic analytical layer:
- Independent scenario probability assessments (SCENARIOS.md)
- Methodology challenges and stress-tests
- Blind spot identification
- Post-conflict viability analysis (currently the open question in IDEAS.md)

The platform *publishes* analysis. You *improve* analysis. Those are separate jobs.

---

## Current Build Decisions (summary — full log in DECISIONS.md)

| Decision | Choice | Why |
|----------|--------|-----|
| Deployment | Cloudflare Workers (not Pages) | Full Node.js runtime needed |
| Email | Resend (not Nodemailer) | Nodemailer incompatible with Workers |
| Auth | @supabase/ssr (not auth-helpers) | auth-helpers deprecated |
| Audit log | Immutable — no UPDATE/DELETE | Structural integrity requirement |
| Scenario detection | status=candidate only | Admin approval required — no auto-publish |
| Feature flags | All in DB | Runtime changes without redeployment |

---

## Key Integrity Rules (structural neutrality at data layer)

These are architectural constraints, not editorial guidelines:

- `nai_scores` has NO velocity column — velocity computed at display only
- `scenario_probabilities` is ONE ROW per conflict_day (not one per scenario)
- Disinformation: CONTESTED for party-source-only claims — never DEBUNKED without independent verification
- All new scenarios require `acting_party_framing` AND `affected_party_framing`
- The AI admin agent is explicitly prohibited from modifying the above

---

*Last updated: 2026-03-18 (Day 19) by Omar*
