# MENA Intel Desk — Project Overview

> **Last updated:** March 2026  
> **Owner:** Omar  
> **Collaborator:** [Partner Name]  
> **Status:** Active — live platform + ongoing analysis

---

## What Is This Project

MENA Intel Desk is a geopolitical intelligence platform focused on the Middle East and North Africa. It produces structured, neutral, data-driven conflict analysis, scenario forecasting, business risk intelligence, and eschatological trend monitoring — anchored to the current Middle East war cycle that began February 28, 2026 (US–Israel joint strikes on Iran, Operation Epic Fury / Roaring Lion).

This is not opinion journalism. It is systematic intelligence production modeled after ISW, Crisis Group, and ACLED — adapted for business and investment-relevant audiences with Egypt and UAE exposure.

---

## Core Problem We Solve

Since February 28, 2026, the Middle East entered a new regional war cycle involving Iran, Israel, the US, Lebanon, Syria, Yemen, Iraq, the Gulf states, and the Strait of Hormuz. Existing news is noisy, partisan, and not structured for decision-making.

MENA Intel Desk fills the gap: neutral, probabilistic, structured analysis that business leaders and analysts can act on.

---

## Platform Architecture

- **Data Ingestion:** Web search + OSINT stack (ISW, ACLED, Crisis Group, Bellingcat, RSS: Reuters/AP/Al Jazeera/BBC)
- **Analysis Engine:** Claude AI with structured methodology prompts
- **Report Generation:** Word (.docx) formatted intelligence briefs
- **Storage:** Supabase (conflict state, report history, scenario probabilities, NAI scores)
- **Distribution:** Web platform, future subscription tiers

---

## Report Types

1. **General Intelligence Brief** — Cross-theater conflict overview
2. **Egypt Country Brief** — Suez Canal, FX, food security, political stability
3. **UAE Country Brief** — Oil exposure, trade, financial system, real estate
4. **Eschatology & Narrative Analysis** — Religious/apocalyptic narratives shaping actor behavior
5. **Business Opportunities Brief** — Sectors and positions benefiting from conflict dynamics

---

## Conflict Tracking

All reports anchor to a **Conflict Day** counter from February 28, 2026 (Day 1).  
Current: **~Day 15 as of mid-March 2026**

---

## Geographic Focus

Iran, Israel/Gaza, Lebanon/Hezbollah, Yemen/Houthis, Iraq/PMF, Gulf States, Egypt, UAE

---

## Collaboration Model

Omar owns the platform, editorial control, and all publish decisions.  
The collaborator contributes analysis, strategic thinking, and methodology development via this `/collaboration/` folder on GitHub.  
No platform access or coding required from the collaborator.  
All collaboration flows through the markdown files in this folder.  
Claude AI on both sides reads this folder at session start to maintain shared context.

### Folder Structure

| File | Purpose |
|---|---|
| `PROJECT.md` | This file — project overview and context |
| `METHODOLOGY.md` | How we analyze, score, and structure reports |
| `STRATEGY.md` | Monetization, growth, and open strategic questions |
| `SCENARIOS.md` | Live scenario probability tracker — updated each conflict day |
| `SOURCES.md` | Agreed source tiers, bias profiles, red flags |
| `IDEAS.md` | Fast-moving daily log — primary async communication channel |
| `DEBATES.md` | Structured disagreements — formal position challenges |
| `DECISIONS.md` | Log of strategic decisions made and their reasoning |

**Reading order at session start:** PROJECT.md → METHODOLOGY.md → SCENARIOS.md → IDEAS.md → DEBATES.md (if open)
