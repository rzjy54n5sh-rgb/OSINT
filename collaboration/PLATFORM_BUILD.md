# MENA Intel Desk — Platform Build Reference
# For collaborators — read this before beginning analytical work.
# Status: ALL 14 PHASES COMPLETE | Verified and pushed March 2026

---

## What This Platform Is

MENA Intel Desk is a live OSINT intelligence platform tracking the US-Iran War 2026.
It is not a news aggregator. It is a structured analytical product with three user tiers,
an automated intelligence pipeline, and an editorial layer governed by structural neutrality.

The platform went from concept to fully verified production-ready build across 14 phases.
This document gives collaborators context to understand what the platform does,
how it works, and what is and is not your role within it.

---

## Architecture in Plain English

The platform has four layers:

### Layer 1 — Data ingestion

An automated Python pipeline runs daily at 06:00 UTC via GitHub Actions.
It pulls from 94+ RSS sources across 26 seeded outlets in 6 languages (EN, AR, FA, HE, FR, DE).
Perplexity Deep Research handles intelligence gathering. Claude handles analysis and structuring.
Source tiers enforced per SOURCES.md. Party sources (CENTCOM, IRGC, IDF, PressTV) are flagged
and require independent corroboration before any claim is marked confirmed.

### Layer 2 — Intelligence database (Supabase)

All intelligence stored in PostgreSQL. Key tables:
- nai_scores: NAI scores for 20 countries, dual-track (expressed vs latent)
- country_reports: Full intelligence briefs per country per conflict day
- scenario_probabilities: A/B/C/D/E probabilities, one row per conflict day
- disinformation_tracker: Claims with verification status and source attribution
- detected_scenarios: New scenarios detected by pipeline (require admin approval)

### Layer 3 — The platform

Next.js 15 frontend on Cloudflare Workers. Three user tiers:
- Free: expressed NAI scores, scenario probability bars, 5 disinformation entries
- Informed ($9/mo): latent scores, gap analysis, Egypt + UAE full reports, scenario detail
- Professional ($29/mo): all countries, API access, downloadable reports

### Layer 4 — The report suite (11 files per day)

5 English .docx + 5 Arabic .docx + 1 SQL platform update, generated daily.
Reports: General Intelligence Brief (350+ paragraphs), Egypt Country Brief,
UAE Country Brief, Eschatology and Geopolitics, Business Opportunities.

---

## The 14 Phases

All 14 phases verified and pushed to main by March 17, 2026 (Day 17 of the conflict).

Phase 1  | CVE patch, Cloudflare Workers migration, environment setup         | VERIFIED
Phase 2  | 8 database migrations: users, subscriptions, RBAC, config, alerts  | VERIFIED
Phase 3  | Supabase client factory, auth middleware, typed API layer           | VERIFIED
Phase 4  | Email system (Resend): 4 templates                                  | VERIFIED
Phase 5  | 10 public Edge Functions: NAI, country, scenarios, disinfo, dispute | VERIFIED
Phase 6  | 6 admin Edge Functions + AI agent panel                             | VERIFIED
Phase 7  | Frontend tier gating on all existing components                     | VERIFIED
Phase 8  | Auth pages, password reset, account page, pricing page              | VERIFIED
Phase 9  | Admin panel layout + 5 core pages                                   | VERIFIED
Phase 10 | 12 remaining admin pages + AI agent (Zustand, role-scoped)          | VERIFIED
Phase 11 | GitHub Actions daily pipeline, scenario detection, alerting          | VERIFIED
Phase 12 | Stripe: 9 prices, 3 currencies, Customer Portal, webhooks           | VERIFIED
Phase 13 | Security hardening: CSP headers, Cloudflare WAF, secret audit       | VERIFIED
Phase 14 | Integration tests, go-live checklist, all 10 hard gates passed      | VERIFIED

---

## Two Claude Systems — Do Not Confuse Them

There are two Claude-powered systems on this project.

1. Your collaboration session (this folder)
   - Strategic analytical partner for Omar
   - Works on IDEAS.md, SCENARIOS.md, DEBATES.md
   - No access to the platform, database, or admin panel
   - Governed by CLAUDE_INSTRUCTIONS.md

2. Admin panel AI agent (embedded in /admin on the platform)
   - Operational assistant for platform management
   - Can trigger pipelines, edit RSS sources, manage users, update config
   - Cannot touch scenarios or disinformation (structural neutrality)
   - Every action logged to immutable audit_log
   - Scoped to the RBAC role of whoever is logged in

---

## RBAC Roles (5 roles)

SUPER_ADMIN (Omar): everything, no restrictions
INTEL_ANALYST: pipeline, NAI scores, country reports, RSS sources, alerts
USER_MANAGER: users, subscriptions, API keys, disputes
FINANCE_MANAGER: payments, pricing config, subscription view
CONTENT_REVIEWER: country reports and feed, view only

The AI agent inherits the logged-in admin role exactly.
Agent NEVER touches: scenario_probabilities, disinformation_tracker (structural neutrality).

---

## Structural Neutrality — The Core Constraint

Structural neutrality is not a marketing claim. It is an architectural rule enforced at
the data layer, not just in framing. It governs everything on this platform.

What it means in practice:
- Both expressed and latent sentiment stored — not just one track
- Casualties ordered by count, highest first (Iran first as of Day 17)
- Iranian civilian harm from US-Israel strikes included in every brief
- Scenario framing requires both acting_party_framing AND affected_party_framing
- Disinformation claims from party sources marked CONTESTED, not DEBUNKED,
  unless independently verified by AFP, Reuters, HRW, NetBlocks, or PolitiFact

Official operation names used for all parties:
- US: Operation Epic Fury
- Israel: Operation Roaring Lion
- Iran/IRGC: Operation True Promise IV
- Iran counter-narrative: Operation Epic Mistake
- Hezbollah: joint with Iran under True Promise IV, no separate codename
- Houthis: support front, no formal codename

If your analysis would only pass the NAI rubric from one party's perspective, it fails.

---

## What Collaborators Are NOT Responsible For

Per CLAUDE_INSTRUCTIONS.md:
- Do not write or review code
- Do not access the live platform or Supabase
- Do not publish anything (Omar approves all publications)
- Do not manage the admin panel or pipeline

You are responsible for:
- Scenario probability assessment (submit independently before reading Omar's)
- Stress-testing analytical positions (escalate to DEBATES.md when positions conflict)
- Surfacing blind spots and new angles (log to IDEAS.md with [Next:] tag)
- NAI compliance checks — self-assess every major analysis piece
- Business relevance framing for Egypt and UAE operators

---

## Current Platform Status (Day 17 — March 17, 2026)

Platform:  Live and verified. All 14 phases pushed to main.
Pipeline:  Running daily 06:00 UTC. 94+ sources, 20 countries.
Launch:    Soft launch — 5 trusted users before going public.
Next:      First real subscriber. Stripe live mode verification.

Intelligence snapshot:
- Conflict day:    17 (Day 1 = February 28, 2026)
- Scenario probs:  A=15% | B=50% | C=25% | D=13% | E=25%
- Iran blackout:   380+ hours (NetBlocks — worst ever recorded)
- Brent crude:     $103-106/bbl (+41.5% since Day 1)
- EGP/USD:         52+ record low
- Hormuz:          Effectively closed. Iran mining active.
- Kharg Island:    Military facilities struck March 13. Oil terminals not yet targeted.
- US KIA:          11 (7 combat + 4 KC-135 non-hostile crash)
- Iran KIA:        1,444+ (Iran Health Ministry, unverifiable due to blackout)

See SCENARIOS.md for full probability log.
See IDEAS.md for the active discussion thread.
See DECISIONS.md for the full decision log.# MENA Intel Desk — Platform Build Reference
# For collaborators. Read this to understand what has been built.
# Status: ALL 14 PHASES COMPLETE ✓ | Verified and pushed March 17, 2026

---

## What This Platform Is

MENA Intel Desk is a live OSINT intelligence platform tracking the US-Iran War 2026.
It is a structured analytical product with three user tiers, an automated intelligence
pipeline, and an editorial layer governed by structural neutrality.

The platform went from concept to fully verified production-ready build across 14 phases.
This document gives collaborators context on what the platform does, how it works,
and what is and is not your role within it.

---

## Architecture in Plain English

The platform has four layers.

**Layer 1 — Data ingestion**
An automated Python pipeline runs daily at 06:00 UTC via GitHub Actions.
It pulls from 94+ RSS sources across 26 seeded outlets in 6 languages (EN, AR, FA, HE, FR, DE).
Perplexity handles intelligence gathering. Claude handles analysis and structuring.
Source tiers are enforced per SOURCES.md. Party sources (CENTCOM, IRGC, IDF, PressTV)
require independent corroboration before any claim is marked confirmed.

**Layer 2 — Intelligence database (Supabase)**
All intelligence is stored in PostgreSQL. Key tables:
- nai_scores: NAI scores for 20 countries, dual-track expressed vs latent
- country_reports: Full intelligence briefs per country per conflict day
- scenario_probabilities: A/B/C/D/E probabilities, one row per conflict day
- disinformation_tracker: Claims with verification status and source attribution
- detected_scenarios: New scenarios from pipeline — require admin approval to go live

**Layer 3 — The platform**
Next.js 15 frontend on Cloudflare Workers. Three user tiers:
- Free: expressed NAI scores, scenario probability bars, 5 disinformation entries
- Informed ($9/mo): latent scores, gap analysis, Egypt + UAE full reports, scenario detail
- Professional ($29/mo): all countries, API access, downloadable reports

**Layer 4 — The report suite (11 files per day)**
5 English .docx + 5 Arabic .docx + 1 SQL platform update, generated daily.
Reports: General Intelligence Brief (350+ paragraphs, 7 geopolitical zones),
Egypt Country Brief, UAE Country Brief, Eschatology & Geopolitics, Business Opportunities.

---

## The 14 Phases — What Was Built

All 14 phases verified and pushed to main by March 17, 2026 (conflict Day 17).

Phase 1  — CVE patch, Cloudflare Workers migration, environment setup          VERIFIED
Phase 2  — 8 database migrations: users, subscriptions, RBAC, config, alerts   VERIFIED
Phase 3  — Supabase client factory, auth middleware, typed API layer            VERIFIED
Phase 4  — Email system (Resend): welcome, payment, past-due, alert templates   VERIFIED
Phase 5  — 10 public Edge Functions: NAI, country, scenarios, disinfo, dispute  VERIFIED
Phase 6  — 6 admin Edge Functions: pipeline, users, config, sources, agent      VERIFIED
Phase 7  — Frontend tier gating on all existing components                      VERIFIED
Phase 8  — Auth pages, password reset, account page, pricing page               VERIFIED
Phase 9  — Admin panel layout + 5 core pages                                    VERIFIED
Phase 10 — 12 remaining admin pages + AI agent panel (Zustand, role-scoped)    VERIFIED
Phase 11 — GitHub Actions daily pipeline, scenario detection, failure alerting  VERIFIED
Phase 12 — Stripe: 9 prices, 3 currencies, Customer Portal, webhooks           VERIFIED
Phase 13 — Security hardening: CSP headers, Cloudflare WAF, secret audit       VERIFIED
Phase 14 — Integration tests, go-live checklist, all 10 hard gates passed       VERIFIED
