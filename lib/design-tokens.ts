/**
 * Design system v2 ("Night desk", 2026-10-13) — the colour values that must exist in TypeScript too:
 * chart libraries and map styles take hex strings, not CSS variables. CSS reads the same values from
 * the custom properties in app/globals.css; tests/unit/tokens.check.ts asserts both match the spec.
 *
 * Rules carried by these values (System artboard):
 *  - Lane status: glyph + word + colour, always together (never colour alone).
 *  - War Posture has its own four-band scale; it is never a status colour. EG / AE / SA get no colour,
 *    no band and no number (outline only).
 *  - Scenario colours are identity (who), not good/bad: no red, no green. B is always drawn as a range.
 *  - Gold is the brand accent (logo, focus ring, the one primary CTA), never a data colour.
 */
export type Theme = 'dark' | 'light';

export const LANE_STATUSES = ['NORMAL', 'ELEVATED', 'DISRUPTED', 'CLOSED', 'UNKNOWN'] as const;
export type LaneStatusCode = (typeof LANE_STATUSES)[number];

export const STATUS_GLYPHS: Record<LaneStatusCode, string> = {
  NORMAL: '●',
  ELEVATED: '▲',
  DISRUPTED: '◆',
  CLOSED: '■',
  UNKNOWN: '○',
};

/** [text/border colour, tint background] per theme. */
export const STATUS_COLORS: Record<Theme, Record<LaneStatusCode, readonly [string, string]>> = {
  dark: {
    NORMAL: ['#4CC97A', '#11281C'],
    ELEVATED: ['#F2B640', '#2E2410'],
    DISRUPTED: ['#FF8A4C', '#341A10'],
    CLOSED: ['#FF6B81', '#3A1219'],
    UNKNOWN: ['#9AA6B5', '#1C232D'],
  },
  light: {
    NORMAL: ['#0E7A3E', '#E6F4EC'],
    ELEVATED: ['#8A5300', '#FDF1DC'],
    DISRUPTED: ['#B23E0B', '#FCE9DF'],
    CLOSED: ['#B0102C', '#FBE4E8'],
    UNKNOWN: ['#5B6573', '#EEF0F3'],
  },
};

/** War Posture scale: four bands on the 0–100 E scale (0 = immediate ceasefire, 100 = escalation). */
export const POSTURE_BANDS = [
  { band: 1, min: 0, max: 30 },
  { band: 2, min: 31, max: 60 },
  { band: 3, min: 61, max: 80 },
  { band: 4, min: 81, max: 100 },
] as const;
export type PostureBand = (typeof POSTURE_BANDS)[number]['band'];

export const POSTURE_SCALE: Record<Theme, Record<PostureBand, string>> = {
  dark: { 1: '#6FA8F0', 2: '#98A3B3', 3: '#E8A066', 4: '#FF7F3F' },
  light: { 1: '#2F6FC0', 2: '#7B8594', 3: '#B8611F', 4: '#C2410C' },
};

/** Countries published as stated positions only: never a score, band, rank or posture colour. */
export const POSTURE_NO_GRADE = ['EG', 'AE', 'SA'] as const;

export function isPostureNoGrade(countryCode: string | null | undefined): boolean {
  return typeof countryCode === 'string' && (POSTURE_NO_GRADE as readonly string[]).includes(countryCode.toUpperCase());
}

/** Band for a 0–100 score; null for anything off the scale. */
export function postureBand(score: number | null | undefined): PostureBand | null {
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) return null;
  const v = Math.round(score);
  return POSTURE_BANDS.find((b) => v >= b.min && v <= b.max)?.band ?? null;
}

/** Scale colour for a score; null when there is no score or the country is EG / AE / SA. */
export function postureScaleColor(
  score: number | null | undefined,
  opts: { theme?: Theme; countryCode?: string | null } = {},
): string | null {
  if (isPostureNoGrade(opts.countryCode)) return null;
  const band = postureBand(score);
  return band === null ? null : POSTURE_SCALE[opts.theme ?? 'dark'][band];
}

/** Scenario identity colours. E has none: it is unmeasured (drawn as a dashed outline). */
export const SCENARIO_IDENTITY: Record<Theme, Record<'A' | 'B' | 'C' | 'D', string>> = {
  dark: { A: '#4DA6FF', B: '#D6B370', C: '#36B8C8', D: '#A78BFA' },
  light: { A: '#1F6FC2', B: '#8C6A1F', C: '#0F7C8A', D: '#6D4FD1' },
};

/** Neutral used for unmeasured scenarios and dynamic scenarios without an identity colour. */
export const SCENARIO_UNMEASURED: Record<Theme, string> = { dark: '#8593A3', light: '#5E6875' };
