/**
 * Brief line-up — the one place the site lists report types (strategy agreed with the operator
 * 2026-10-08; registry rows in supabase/migrations/20261012090000_brief_lineup_and_scenario_labels.sql).
 *
 * Current line-up:
 *   overnight           daily   what changed since the evening, written before the Gulf working day
 *   general             daily   flagship General Intelligence Brief
 *   horn                daily   Horn of Africa & Red Sea
 *   egypt_gulf_economy  daily   Egypt & Gulf Economy (replaces separate egypt / uae / business going forward)
 *   eschatology         WEEKLY  displayed as "Religion, Ideology & Mobilisation" (URL code unchanged)
 *   general_weekly      weekly  retrospective digests (shown only on days that have one)
 *
 * Archive (no new rows; old rows stay readable at their URLs — history is never deleted or rewritten):
 *   egypt, uae, business (business displayed as "Economic Impact & Market Access").
 *
 * Server- and client-safe: constants only, no I/O.
 */

export type BriefCadence = 'daily' | 'weekly';
export type BriefLineup = 'current' | 'archive';

export interface BriefTypeMeta {
  /** report_types.code = the URL segment /briefings/{day}/{code}. Never renamed (old URLs keep working). */
  code: string;
  /** Full title, e.g. for <title>, RSS items and the reader header. */
  title: string;
  /** Upper-case card label. */
  label: string;
  /** Short upper-case label for the home strip. */
  shortLabel: string;
  emoji: string;
  /** Text colour: a theme token (≥ 4.5:1 on --surface, tests/unit/tokens.check.ts). Never append alpha digits. */
  color: string;
  readTime: string;
  cadence: BriefCadence;
  lineup: BriefLineup;
  /** A type introduced by the 2026-10 line-up: it may have no row yet, and its page then shows an honest empty state. */
  isNew?: boolean;
  /** Earlier display name, shown on the reader so archived URLs still make sense. */
  formerTitle?: string;
  /** One line on what the brief covers (used on the empty state and the index). */
  blurb: string;
}

export const BRIEF_TYPES: readonly BriefTypeMeta[] = [
  {
    code: 'overnight',
    title: 'Overnight Brief',
    label: 'OVERNIGHT',
    shortLabel: 'OVERNIGHT',
    emoji: '◐',
    color: 'var(--accent-blue)',
    readTime: '2 min',
    cadence: 'daily',
    lineup: 'current',
    isNew: true,
    blurb:
      'What changed since the previous evening, written before the Gulf working day: five verified items, the chokepoint status line and the market strip.',
  },
  {
    code: 'general',
    title: 'General Intelligence Brief',
    label: 'GENERAL INTELLIGENCE BRIEF',
    shortLabel: 'GENERAL',
    emoji: '◆',
    color: 'var(--accent-gold)',
    readTime: '20–30 min',
    cadence: 'daily',
    lineup: 'current',
    blurb: 'The flagship daily brief: the war, its fronts, civilian harm on every front, diplomacy and markets.',
  },
  {
    code: 'general_weekly',
    title: 'Weekly General Digest',
    label: 'WEEKLY GENERAL DIGEST',
    shortLabel: 'WEEKLY DIGEST',
    emoji: '◇',
    color: 'var(--accent-gold)',
    readTime: '20–30 min',
    cadence: 'weekly',
    lineup: 'current',
    blurb: 'Retrospective digest of a span of days, stored on the last day of the span.',
  },
  {
    code: 'horn',
    title: 'Horn of Africa & Red Sea Brief',
    label: 'HORN OF AFRICA & RED SEA',
    shortLabel: 'HORN OF AFRICA',
    emoji: '◍',
    color: 'var(--accent-teal)',
    readTime: '12–18 min',
    cadence: 'daily',
    lineup: 'current',
    blurb: 'Ethiopia, Eritrea, Sudan, Somalia, Djibouti and the Red Sea corridor.',
  },
  {
    code: 'egypt_gulf_economy',
    title: 'Egypt & Gulf Economy Brief',
    label: 'EGYPT & GULF ECONOMY',
    shortLabel: 'EGYPT & GULF ECONOMY',
    emoji: '◈',
    color: 'var(--accent-green)',
    readTime: '10–15 min',
    cadence: 'daily',
    lineup: 'current',
    isNew: true,
    blurb:
      'Egypt, the UAE and the Gulf economies in one brief: currency, energy, shipping, Suez and market access. Replaces the separate Egypt, UAE and business briefs.',
  },
  {
    code: 'eschatology',
    title: 'Religion, Ideology & Mobilisation (weekly)',
    label: 'RELIGION, IDEOLOGY & MOBILISATION',
    shortLabel: 'RELIGION & IDEOLOGY',
    emoji: '◎',
    color: 'var(--accent-purple)',
    readTime: '10–15 min',
    cadence: 'weekly',
    lineup: 'current',
    formerTitle: 'Eschatology & Geopolitics Brief',
    blurb:
      'Weekly: sourced statements by religious and political actors and their political effects. No predictive or prophetic framing.',
  },
  {
    code: 'egypt',
    title: 'Egypt Country Brief',
    label: 'EGYPT COUNTRY BRIEF',
    shortLabel: 'EGYPT',
    emoji: '🇪🇬',
    color: 'var(--accent-green)',
    readTime: '15–20 min',
    cadence: 'daily',
    lineup: 'archive',
    blurb: 'Archive. Egypt coverage continues in the Egypt & Gulf Economy brief.',
  },
  {
    code: 'uae',
    title: 'UAE Country Brief',
    label: 'UAE COUNTRY BRIEF',
    shortLabel: 'UAE',
    emoji: '🇦🇪',
    color: 'var(--accent-blue)',
    readTime: '12–18 min',
    cadence: 'daily',
    lineup: 'archive',
    blurb: 'Archive. UAE coverage continues in the Egypt & Gulf Economy brief.',
  },
  {
    code: 'business',
    title: 'Economic Impact & Market Access Brief',
    label: 'ECONOMIC IMPACT & MARKET ACCESS',
    shortLabel: 'ECONOMIC IMPACT',
    emoji: '◈',
    color: 'var(--text-warning)',
    readTime: '10–15 min',
    cadence: 'daily',
    lineup: 'archive',
    formerTitle: 'Business Opportunities Brief',
    blurb: 'Archive. Economic impact and market access coverage continues in the Egypt & Gulf Economy brief.',
  },
] as const;

/** Every type with a public page at /briefings/{day}/{type}, in display order. */
export const ROUTABLE_BRIEF_TYPES: readonly string[] = BRIEF_TYPES.map((t) => t.code);

export const CURRENT_LINEUP: readonly BriefTypeMeta[] = BRIEF_TYPES.filter((t) => t.lineup === 'current');
export const ARCHIVE_TYPES: readonly BriefTypeMeta[] = BRIEF_TYPES.filter((t) => t.lineup === 'archive');

const BY_CODE = new Map(BRIEF_TYPES.map((t) => [t.code, t]));

export function isRoutableBriefType(code: string): boolean {
  return BY_CODE.has(code);
}

export function briefTypeMeta(code: string): BriefTypeMeta | null {
  return BY_CODE.get(code) ?? null;
}

/** Full title for a code; unknown codes fall back to the raw code (never throws). */
export function briefTitle(code: string): string {
  return BY_CODE.get(code)?.title ?? code;
}
