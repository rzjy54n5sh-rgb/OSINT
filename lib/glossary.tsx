// lib/glossary.tsx
// Central glossary definitions for all technical terms.
// Use with GlossaryTooltip: <GlossaryTooltip term="NAI" definition={GLOSSARY.NAI}>NAI</GlossaryTooltip>

import type React from 'react';

export const GLOSSARY: Record<string, React.ReactNode> = {
  NAI: 'Narrative Alignment Index (NAI), War Posture method: whether a state\'s official war posture and its society\'s posture point the same way, on one party-neutral scale (0 = immediate unconditional ceasefire, 50 = conditional or ambivalent, 100 = continue or escalate military action, by any party). Expressed = official position (0–100); Latent = population and non-government elites, as a band from admissible evidence only; Gap = Expressed minus the band midpoint.',
  GAP: 'Expressed score minus the midpoint of the latent band (signed), on the War Posture scale. It shows how far the official posture sits from society\'s; the category is set from the whole band, not from the gap alone.',
  EXPRESSED: 'Expressed (0–100): the government\'s official position on continuing hostilities, from official statements and state communications. 0 = immediate unconditional ceasefire, 100 = continue or escalate.',
  LATENT: 'Latent (band): the population and non-government elites on the same 0–100 scale, as a low–high band from admissible evidence only (polls with pollster, field dates and sample size; protest reporting; opposition votes; independent elite commentary). Empty when there is no admissible evidence — never guessed.',
  VELOCITY: 'Change in the expressed score versus the previous War Posture day. A move toward escalation or toward ceasefire is shown neutrally — neither is "good" or "bad".',
  ALIGNED: 'War Posture category: expressed and latent within 10 points across the whole latent band — government and society move together. Thresholds are conventions, not empirical findings.',
  STABLE: 'War Posture category: expressed and latent 10–19 points apart across the whole latent band — minor divergence.',
  TENSION: 'War Posture category: expressed and latent 20–29 points apart across the whole latent band — visible divergence.',
  TENSE: 'War Posture category: expressed and latent 20–29 points apart across the whole latent band — visible divergence.',
  FRACTURE: 'War Posture category: 30+ points apart, with government and society on the same side of 50 but at very different intensity.',
  FRACTURED: 'War Posture category: 30+ points apart, with government and society on the same side of 50 but at very different intensity.',
  INVERSION: 'War Posture category: 30+ points apart, with government and society on opposite sides of the war question.',
  INVERTED: 'War Posture category: 30+ points apart, with government and society on opposite sides of the war question.',
  SCENARIO_A: 'Managed Exit — within the method horizon: the US announces the end or suspension of the naval blockade of Iran, a US–Iran Hormuz agreement, a US–Iran nuclear deal, or Hormuz traffic returning to normal. Definitions are maintained in the scenario registry (see /scenarios).',
  SCENARIO_B: 'Prolonged War — the status quo (no strikes on Iranian territory, blockade in force, Hormuz closed) continues through the horizon; computed as the residual 100 − A − C − D.',
  SCENARIO_C: 'Cascade — Bab el-Mandeb effectively closed within the horizon while the Strait of Hormuz is still closed.',
  SCENARIO_D: 'Escalation Spiral — within the horizon: a US strike on Iranian territory, an Israel–Iran strike, Kharg Island leaving Iranian control, a US or Israeli ground offensive, or a new state belligerent striking Iran. A ceasefire-breaking strike counts here.',
  SCENARIO_E: 'UAE Direct Strike — an Iranian qualifying strike that targets the UAE within the horizon. Independent of A–D (can overlap, not part of the 100); shown as unmeasured when no market passes the quality floor.',
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
  SENTIMENT_POSITIVE: 'Keyword count: the headline and summary use more de-escalation words (ceasefire, talks, deal…) than violence or crisis words. Describes wording only — not the event, its accuracy or any party\'s position.',
  SENTIMENT_NEGATIVE: 'Keyword count: the headline and summary use more violence or crisis words (strike, missile, killed…) than de-escalation words. Describes wording only — not the event, its accuracy or any party\'s position.',
  SENTIMENT_NEUTRAL: 'Keyword count: violence/crisis words and de-escalation words are balanced or absent.',
  CONFLICT_DAY: 'Days elapsed since the conflict began on February 28, 2026 (Day 1). Used to index all data — articles, NAI scores, scenario probabilities — for historical comparison.',
};
