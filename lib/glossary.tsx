// lib/glossary.tsx
// Central glossary definitions for all technical terms.
// Use with GlossaryTooltip: <GlossaryTooltip term="NAI" definition={GLOSSARY.NAI}>NAI</GlossaryTooltip>

import type React from 'react';

export const GLOSSARY: Record<string, React.ReactNode> = {
  NAI: 'Narrative Alignment Index — a 0–100 score measuring how closely a country\'s observable public behavior aligns with US-led coalition objectives. Higher = more aligned. See Methodology for full derivation.',
  GAP: 'The difference between Expressed (public) and Latent (structural) NAI scores. A GAP above 30 indicates the country is significantly overstating its alignment — historically a precursor to policy reversal.',
  EXPRESSED: 'The Expressed score (0–100) measures what a country is publicly saying and doing: official statements, voting patterns, state media framing, and military posture announcements.',
  LATENT: 'The Latent score (0–100) measures what structural conditions suggest about where a country actually stands: economic dependencies, historical alliances, and elite-level communications.',
  VELOCITY: 'Rate of change in the Expressed score between the current and previous conflict day. ↑ = becoming more aligned. ↓ = drifting away. A ↓↓ movement in one day flags a significant triggering event.',
  ALIGNED: 'NAI 65–100. Active coalition partner. Public and structural behavior are broadly consistent with US-led objectives.',
  STABLE: 'NAI 50–64. Publicly supportive but managing domestic or regional constraints. Typical of Gulf states balancing Western alignment with regional stability.',
  TENSION: 'NAI 35–49. Mixed signals. The country is visibly balancing between coalition pressure and competing economic, demographic, or historical interests.',
  FRACTURE: 'NAI 20–34. Significant divergence. Possible active obstruction of coalition logistics, conflicting diplomatic signals, or intense internal pressure to break with the coalition.',
  INVERSION: 'NAI below 20. Expressed and structural positions have inverted — what the country says publicly is sharply contradicted by what its behavior indicates. Highest-risk category.',
  SCENARIO_A: 'Managed Exit — Oman or backchannel diplomacy produces a renewable cessation of direct strikes. Nuclear program under enhanced IAEA monitoring. Hormuz reopens.',
  SCENARIO_B: 'Controlled Escalation — Conflict expands into a multi-front proxy war (Lebanon, Houthis, Iraqi militias) while remaining below the nuclear threshold.',
  SCENARIO_C: 'Humanitarian Crisis — Extended conflict triggers a secondary economic and humanitarian crisis that forces a premature ceasefire without a verifiable resolution.',
  SCENARIO_D: 'Regional War — A mass-casualty triggering event activates full US war authorization. Saudi Arabia and UAE drawn in. Hormuz closed indefinitely.',
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
