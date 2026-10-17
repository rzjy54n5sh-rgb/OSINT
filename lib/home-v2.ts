/**
 * Home page v2 (artboards Main.dc.html and Home-Mobile.dc.html): the pure view logic. No React, no I/O,
 * no clock. app/page.tsx reads the data; app/HomeDashboard.tsx renders what these functions return.
 * Every number and sentence printed on the home body comes from a live source through one of these
 * functions, or is fixed explanatory copy; nothing from the artboards' sample data is carried over.
 * Unit tests: tests/unit/home-v2.check.ts.
 */
import { corridorHeadline, fmtPct, formatDay, formatDayTime, type CorridorLane, type CorridorsView } from './corridors';
import { isPostureNoGrade } from './design-tokens';
import { resolveParty, type OutletRegistry, type PartyLabel } from './outlet-lookup';
import { POSTURE_WITHHELD_CODES, isPostureWithheld, type PostureBoard, type PostureEvidenceView, type PostureView } from './posture';
import { countryName, isShownPosition, sortPositions } from './posture-board';

// ---------------------------------------------------------------------------------------------------
// Corridors hero: H1 and standfirst from the ONE corridors view (the strip and relief use the same one)
// ---------------------------------------------------------------------------------------------------

/**
 * Words that turn an exact figure into an editorial approximation. The H1 never puts one of these in
 * front of a number (tests/unit/home-v2.check.ts).
 */
export const ROUNDING_WORDS_BEFORE_NUMBER =
  /\b(?:under|nearly|almost|about|around|roughly|approximately|over|below|above|just|some|close to|more than|less than|fewer than|up to)\s+[\d.,]+/i;

export interface CorridorH1 {
  /** First sentence: shown on every screen (the phone artboard keeps only this one). */
  lead: string;
  /** Second sentence, desktop and tablet only; null when there is no second figure. */
  rest: string | null;
}

/**
 * Exact-number template, lowest index first: "Hormuz traffic is at 2.8% of its 2023 level. Bab al-Mandeb is
 * at 39.6%." The figures are the view's own one-decimal indices (fmtPct), never rounded into words.
 * Stale data is in the past tense ("Last published week: ... was at ..."); withheld data has no figure.
 */
export function corridorH1(v: CorridorsView): CorridorH1 {
  if (v.state === 'withheld') return { lead: corridorHeadline(v), rest: null };
  const lanes = v.lanes
    .filter((l): l is CorridorLane & { index: number } => typeof l.index === 'number' && Number.isFinite(l.index))
    .sort((a, b) => a.index - b.index);
  if (lanes.length === 0) return { lead: 'No corridor figure has been published for the current week.', rest: null };
  const [a, b] = lanes;
  if (v.state === 'stale') {
    return {
      lead: `Last published week: ${a.shortName} traffic was at ${fmtPct(a.index)} of its 2023 level.`,
      rest: b ? `${b.shortName} was at ${fmtPct(b.index)}.` : null,
    };
  }
  return {
    lead: `${a.shortName} traffic is at ${fmtPct(a.index)} of its 2023 level.`,
    rest: b ? `${b.shortName} is at ${fmtPct(b.index)}.` : null,
  };
}

/** "Weekly transits against the 2023 average, week 5–11 Oct 2026. From Chokepoint Weekly #2, data as of 15 Oct 2026, 06:19 UTC." */
export function corridorDek(v: CorridorsView): string {
  if (v.state === 'withheld') return 'No figure is printed until this week’s corridor file passes its data checks.';
  const parts = ['Weekly transits against the 2023 average'];
  if (v.weekLabel) parts[0] += `, week ${v.weekLabel}`;
  const from = [v.issueLabel ? `From ${v.issueLabel}` : null, v.asOfLabel ? `data as of ${v.asOfLabel}` : null].filter(Boolean).join(', ');
  return `${parts[0]}.${from ? ` ${from.charAt(0).toUpperCase()}${from.slice(1)}.` : ''}`;
}

// ---------------------------------------------------------------------------------------------------
// Briefs: top finding (latest general brief) and "Since yesterday" (that day's overnight brief)
// ---------------------------------------------------------------------------------------------------

/** HTML tags and runs of whitespace out of a stored lead (leads are plain text, a few older rows are not). */
export function plainText(s: string | null | undefined): string {
  if (!s?.trim()) return '';
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Abbreviations that never end a sentence (titles, ranks, "vs.", "al.", "No.", "Fig.", months): "Maj. Gen.
 * Turki Al-Maliki", "Rear Adm. Brad Cooper", "Iran vs. Israel", "3 Oct. 2026". Matched on the word before the dot.
 */
export const SENTENCE_ABBREVIATIONS: ReadonlySet<string> = new Set([
  'Maj', 'Gen', 'Lt', 'Col', 'Adm', 'Brig', 'Capt', 'Cdr', 'Sgt', 'Gov', 'Sen', 'Rep', 'Prof', 'Dr', 'St', 'Mr', 'Mrs', 'Ms', 'Jr',
  'vs', 'Vs', 'al', 'No', 'Fig', 'Jan', 'Feb', 'Mar', 'Apr', 'Jun', 'Jul', 'Aug', 'Sep', 'Sept', 'Oct', 'Nov', 'Dec',
]);

/**
 * Where a published text may be split into sentences: after ".", "!" or "?" (and any closing quotes or
 * brackets), before white space and a capital, an opening quote or bracket. Not after an abbreviation in the
 * stop-list, a single initial ("A. Smith") or a dotted abbreviation ("U.S.", "e.g."). Returns the index of the
 * white space at each break.
 */
export function sentenceBreaks(t: string): number[] {
  const out: number[] = [];
  const re = /([.!?])(["”’')\]]*)(?=\s+[A-Z"“‘(\u00C0-\u00DE])/g;
  for (let m = re.exec(t); m; m = re.exec(t)) {
    const word = (/(\S+)$/.exec(t.slice(0, m.index))?.[1] ?? '').replace(/^[("“‘'[]+/, '');
    if (!word || SENTENCE_ABBREVIATIONS.has(word) || /^[A-Za-z]$/.test(word) || word.includes('.')) continue;
    out.push(m.index + 1 + m[2].length);
  }
  return out;
}

/**
 * Every quotation is closed in `t`: straight double quotes paired, “ ” balanced, and ‘ ’ balanced, where a ’
 * between two letters (Iran’s) is an apostrophe, not a closing quote.
 */
export function quotesClosed(t: string): boolean {
  let straight = 0;
  let dbl = 0;
  let sgl = 0;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === '"') straight ^= 1;
    else if (c === '\u201C') dbl++;
    else if (c === '\u201D') dbl = Math.max(0, dbl - 1);
    else if (c === '\u2018') sgl++;
    else if (c === '\u2019' && sgl > 0 && !(/\p{L}/u.test(t[i - 1] ?? '') && /\p{L}/u.test(t[i + 1] ?? ''))) sgl--;
  }
  return straight === 0 && dbl === 0 && sgl === 0;
}

/** First sentence break at or after `min` characters with every quote closed before it, or null. */
function firstBreak(t: string, min: number): number | null {
  for (const at of sentenceBreaks(t)) if (at >= min && quotesClosed(t.slice(0, at))) return at;
  return null;
}

/**
 * A correction notice the desk prepends to a corrected brief's lead ("Corrected 13 Oct 2026, 11:28 UTC: an
 * earlier version cited …; the affected statements have been removed."), split off so it is never shown as the
 * finding itself. The lead's words are unchanged.
 */
export function correctionNotice(lead: string | null | undefined): { notice: { when: string; text: string } | null; lead: string } {
  const t = plainText(lead);
  const m = /^Corrected (.+? UTC): (.+?\.)(?=\s|$)\s*/.exec(t);
  if (!m) return { notice: null, lead: t };
  return { notice: { when: m[1], text: m[2] }, lead: t.slice(m[0].length) };
}

/**
 * Splits a brief's own lead into its first sentence and the rest, without changing a word (sentenceBreaks:
 * abbreviations, initials and open quotes never end a sentence). No safe break → all head.
 */
export function splitLead(lead: string | null | undefined): { head: string; rest: string | null } {
  const t = plainText(lead);
  if (!t) return { head: '', rest: null };
  const at = firstBreak(t, 40);
  if (at === null) return { head: t, rest: null };
  const rest = t.slice(at).trim();
  return { head: t.slice(0, at).trim(), rest: rest || null };
}

/** A cited source as stored in the brief (name, url, the stored per-citation party flag). */
export interface BriefSourceRaw {
  name: string;
  url: string | null;
  party_source: boolean;
}
/** A cited source as shown: its party label resolved like the brief reader (registry, then the stored flag). */
export interface BriefSourceRef {
  name: string;
  url: string | null;
  /** 'State-aligned' | 'Party' | 'Party source', or null for an independent / unknown outlet. */
  label: PartyLabel | null;
}
export interface OvernightItemRaw {
  /** The paragraph as published, whole. */
  text: string;
  sources: BriefSourceRaw[];
}
export interface OvernightItem {
  /** The paragraph as published, whole (kept for checks; the page shows `head`). */
  text: string;
  /** What the home shows: the paragraph's first sentence, cut only at a sentence end outside any quote. */
  head: string;
  /** true when `head` is shorter than `text` (the home then links to the item in the brief). */
  cut: boolean;
  sources: BriefSourceRef[];
}

/** Index of the overnight brief's "changes" section (ranked by consequence), or -1. */
export function changesSectionIndex(sections: unknown): number {
  if (!Array.isArray(sections)) return -1;
  return (sections as Record<string, unknown>[]).findIndex(
    (s) => !!s && typeof s === 'object' && (s.id === 'changes' || (typeof s.heading === 'string' && /change/i.test(s.heading))),
  );
}

/**
 * The first `max` items of the overnight brief's "changes" section, verbatim and in the brief's order, each
 * with the sources the brief cites for it. A brief with no such section gives [] (the home says so).
 */
export function overnightItems(sections: unknown, max = 3): OvernightItemRaw[] {
  const i = changesSectionIndex(sections);
  if (i < 0) return [];
  const sec = (sections as Record<string, unknown>[])[i];
  const subs = Array.isArray(sec?.subsections) ? (sec.subsections as Record<string, unknown>[]) : [];
  const out: OvernightItemRaw[] = [];
  for (const sub of subs) {
    const paras = Array.isArray(sub?.paragraphs) ? (sub.paragraphs as Record<string, unknown>[]) : [];
    for (const p of paras) {
      const text = plainText(typeof p?.text === 'string' ? p.text : '');
      if (!text) continue;
      const sources = (Array.isArray(p.sources) ? (p.sources as Record<string, unknown>[]) : [])
        .filter((s) => s && typeof s.name === 'string' && (s.name as string).trim())
        .map((s) => ({
          name: (s.name as string).trim(),
          url: typeof s.url === 'string' && /^https?:\/\//i.test(s.url) ? s.url : null,
          party_source: s.party_source === true,
        }));
      out.push({ text, sources });
      if (out.length >= max) return out;
    }
  }
  return out;
}

/**
 * The reader's anchor for section `index` (same rule as components/briefing/BriefSections sectionAnchors,
 * kept here so the home does not pull the reader's stylesheet; home-v2.check asserts they agree).
 */
export function briefSectionAnchor(sections: unknown, index: number): string | null {
  if (!Array.isArray(sections) || index < 0 || index >= sections.length) return null;
  const used = new Set<string>(['sources', 'key-figures']);
  let id = '';
  (sections as Record<string, unknown>[]).slice(0, index + 1).forEach((sec, i) => {
    const raw = typeof sec?.id === 'string' ? sec.id.trim() : '';
    const base = `s-${raw.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || i + 1}`;
    id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    used.add(id);
  });
  return id;
}

/**
 * The first sentence of a published paragraph, never cut inside a quotation (sentenceBreaks + quotesClosed).
 * No such end → the whole paragraph. Words unchanged.
 */
export function firstSentence(text: string): { head: string; cut: boolean } {
  const t = plainText(text);
  const at = firstBreak(t, 40);
  if (at === null) return { head: t, cut: false };
  const head = t.slice(0, at).trim();
  return { head, cut: head.length < t.length };
}

/** Shown overnight items: first sentence (quote-safe) and each source's party label, as the brief reader resolves it. */
export function shownOvernightItems(items: OvernightItemRaw[], registry: OutletRegistry): OvernightItem[] {
  return items.map((it) => {
    const { head, cut } = firstSentence(it.text);
    return {
      text: it.text,
      head,
      cut,
      sources: it.sources.map((s) => ({ name: s.name, url: s.url, label: resolveParty({ url: s.url, name: s.name, party_source: s.party_source }, registry).label })),
    };
  });
}

// ---------------------------------------------------------------------------------------------------
// War Posture: scored positions (method v2 only) and the stated-positions-only aside (EG / AE / SA)
// ---------------------------------------------------------------------------------------------------
export interface StatedQuote {
  code: string;
  name: string;
  evidence: PostureEvidenceView | null;
}
export interface HomePostureView {
  schema: PostureBoard['schema'] | null;
  day: number | null;
  /** Scored v2 positions, highest score first (the /nai default order). Never EG / AE / SA. */
  positions: PostureView[];
  total: number;
  /** One line per EG / AE / SA: its newest verbatim statement on any front, or null. No score, ever. */
  stated: StatedQuote[];
}

const evDate = (e: PostureEvidenceView) => e.stated_at ?? e.captured_at ?? '';

export function homePosture(board: PostureBoard | null, max = 6): HomePostureView {
  // Only a War Posture v2 board is a real read for the home: a v1 board means the v2 view could not be read
  // (getPostureBoard falls back), so it is shown as unavailable, never as "nothing coded".
  if (!board || board.schema !== 'v2') return { schema: null, day: null, positions: [], total: 0, stated: [] };
  // isShownPosition already refuses EG / AE / SA; the second filter is belt and braces for the home page.
  const shown = board.rows.filter((r) => isShownPosition(r) && !isPostureNoGrade(r.country_code) && !isPostureWithheld(r.country_code));
  const positions = sortPositions(shown, 'score');
  const stated = [...POSTURE_WITHHELD_CODES]
    .map((code) => {
      const ev = board.rows
        .filter((r) => r.country_code === code && r.evidence && r.evidence.kind === 'statement' && r.stance !== 'uncoded')
        .map((r) => r.evidence as PostureEvidenceView)
        .sort((a, b) => evDate(b).localeCompare(evDate(a)));
      return { code, name: countryName(code), evidence: ev[0] ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return { schema: board.schema, day: board.day, positions: positions.slice(0, max), total: positions.length, stated };
}

// ---------------------------------------------------------------------------------------------------
// Trust strip
// ---------------------------------------------------------------------------------------------------
export interface HomeTrust {
  /** created_at of the newest published correction; null = none, undefined = could not be read. */
  latestCorrection?: string | null;
  /** Forecast ledger counts; undefined = could not be read. */
  forecasts?: { open: number; resolved: number; chainVerified: boolean | null };
}

export function correctionMeta(t: HomeTrust): string {
  if (t.latestCorrection === undefined) return 'Log not available just now';
  if (t.latestCorrection === null) return 'No corrections published yet';
  return `Latest ${formatDayTime(t.latestCorrection) ?? formatDay(t.latestCorrection) ?? t.latestCorrection}`;
}

export function trackRecordMeta(t: HomeTrust): string {
  const f = t.forecasts;
  if (!f) return 'Ledger not available just now';
  const chain = f.chainVerified === true ? 'Ledger verified' : f.chainVerified === false ? 'Ledger check failed' : 'Ledger check pending';
  return `${chain} · ${f.open} open forecast${f.open === 1 ? '' : 's'} · ${f.resolved} resolved`;
}
