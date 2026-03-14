// lib/glossary.tsx
// Central glossary definitions for all technical terms.
// Use with GlossaryTooltip: <GlossaryTooltip term="NAI" definition={GLOSSARY.NAI}>NAI</GlossaryTooltip>

import type React from 'react';

export const GLOSSARY: Record<string, React.ReactNode> = {
  NAI: 'Narrative Alignment Index — dual-track sentiment measurement. Expressed score (0–100): official/state narrative alignment. Latent score (0–100): underlying public sentiment. Gap = Expressed minus Latent. Large gaps indicate structural instability.',
  GAP: 'The difference between Expressed (public) and Latent (structural) NAI scores. A GAP above 30 indicates the country is significantly overstating its alignment — historically a precursor to policy reversal.',
  EXPRESSED: 'The Expressed score (0–100) measures what a country is publicly saying and doing: official statements, voting patterns, state media framing, and military posture announcements.',
  LATENT: 'The Latent score (0–100) measures what structural conditions suggest about where a country actually stands: economic dependencies, historical alliances, and elite-level communications.',
  VELOCITY: 'Rate of change in the Expressed score between the current and previous conflict day. ↑ = becoming more aligned. ↓ = drifting away. A ↓↓ movement in one day flags a significant triggering event.',
  ALIGNED: 'NAI 65–100. Active coalition partner. Public and structural behavior are broadly consistent with US-led objectives.',
  STABLE: 'NAI 50–64. Publicly supportive but managing domestic or regional constraints. Typical of Gulf states balancing Western alignment with regional stability.',
  TENSION: 'NAI 35–49. Mixed signals. The country is visibly balancing between coalition pressure and competing economic, demographic, or historical interests.',
  TENSE: 'NAI 35–49. Mixed signals. The country is visibly balancing between coalition pressure and competing economic, demographic, or historical interests.',
  FRACTURE: 'NAI 20–34. Significant divergence. Possible active obstruction of coalition logistics, conflicting diplomatic signals, or intense internal pressure to break with the coalition.',
  FRACTURED: 'NAI 20–34. Significant divergence. Possible active obstruction of coalition logistics, conflicting diplomatic signals, or intense internal pressure to break with the coalition.',
  INVERSION: 'NAI below 20. Expressed and structural positions have inverted — what the country says publicly is sharply contradicted by what its behavior indicates. Highest-risk category.',
  INVERTED: 'NAI below 20. Expressed and structural positions have inverted — what the country says publicly is sharply contradicted by what its behavior indicates. Highest-risk category.',
  SCENARIO_A: 'Managed Exit — Ceasefire within 2 weeks via Xi-Trump framework OR Iran-Oman back-channel. Iran\'s stated condition: closure/drawdown of US regional military bases. Also called "Managed Exit" to avoid language either side would reject.',
  SCENARIO_B: 'Prolonged War — Conflict continues 4+ weeks without diplomatic breakthrough. Most likely scenario as of Day 15. Kharg Island strike and Mojtaba\'s defiant first statement both reduce near-term ceasefire probability.',
  SCENARIO_C: 'Cascade / Dual Closure — Hormuz closure combined with Houthi Red Sea resumption. Near-total halt of regional maritime trade. Egypt enters IMF emergency program. Morgan Stanley projects $2.4B additional Egyptian energy deficit.',
  SCENARIO_D: 'Escalation Spiral — Iran retaliates on Gulf oil infrastructure → Trump destroys Kharg oil terminals → JPMorgan $150/bbl scenario → US domestic inflation crisis → political pressure ends war faster than diplomacy.',
  SCENARIO_E: 'UAE Direct Strike on Iran — UAE hits Iranian missile production sites directly. Unprecedented escalation. Australia evacuation advisory and DIFC emptying signal rising pressure on UAE leadership. Sub-branch: can overlap with Scenario D. Probability independent of A+B+C+D sum.',
  TRUE_PROMISE_IV: 'Operation True Promise IV (وعد صادق ۴) — Iran/IRGC official codename for retaliatory operations against US-Israel strikes. 48+ waves launched as of Day 15. Conducted jointly with Hezbollah. Parallel to US\'s Operation Epic Fury.',
  OPERATION_EPIC_FURY: 'Operation Epic Fury — US Pentagon official codename for US military operations against Iran, launched February 28, 2026. Conducted jointly with Israel\'s Operation Roaring Lion.',
  STRUCTURAL_NEUTRALITY: 'The platform\'s core architectural principle: all parties\' official designations, perspectives, casualties, and justifications are presented equally. Not a marketing claim — it is enforced at the data collection, analysis, and display layers.',
  KHARG_ISLAND: 'Iran\'s primary crude oil export hub, handling ~90% of Iranian oil exports. Located 25km off Iranian coast. Struck by US military March 13 (Day 13) — military facilities only. Oil infrastructure not yet targeted. Trump threatened oil infrastructure strike if Hormuz stays blocked.',
  HORMUZ_STATUS: 'Strait of Hormuz — Iran began mining it Day 1. 16 Iranian mine-laying vessels destroyed by US Navy. Effectively closed as of Day 15. Iran\'s stated leverage tool: "Hormuz is a tool to pressure the enemy" (IRGC). US/business perspective: re-opening = recovery signal.',
  WIRE: 'International wire service — Reuters, AP, AFP. Highest factual reliability baseline. Limited context and analysis.',
  BROADCAST: 'Television and online news broadcaster. Includes Western (BBC, CNN) and regional (Al Jazeera, Al Arabiya) outlets with varying editorial positions.',
  OFFICIAL: 'Government ministry, press office, or official state communication. Primary source for government position — also most subject to deliberate framing.',
  MILITARY: 'Defense ministry or military command communication — Pentagon, IDF, IRGC. Primary source for operational claims; must be read as advocacy documents.',
  ELITE: 'Public statements from individually tracked political and military figures via Telegram, official press offices, or verified social accounts.',
  FINANCIAL: 'Market and energy media tracking conflict-sensitive economic indicators.',
  THINK_TANK: 'Research institution or policy analysis organization. Higher analytical depth; should be read with awareness of institutional positioning.',
  SENTIMENT_POSITIVE: 'The article\'s narrative framing favors de-escalation or coalition objectives. Not a judgment of factual accuracy.',
  SENTIMENT_NEGATIVE: 'The article\'s narrative framing is adverse to coalition objectives or emphasizes civilian/humanitarian harm.',
  SENTIMENT_NEUTRAL: 'Factual or analytical framing without clear narrative alignment.',
  CONFLICT_DAY: 'Days elapsed since the conflict began on February 28, 2026 (Day 1). Used to index all data — articles, NAI scores, scenario probabilities — for historical comparison.',
};
