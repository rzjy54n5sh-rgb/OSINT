// Pure functions: raw data bundle -> card view-model. No network, no clock (the caller passes `now`).
// Nothing here writes or invents a value: every printed number is copied from the bundle or is
// arithmetic on bundle values (stated in the card's own notes).

export const DAY_ZERO = Date.UTC(2026, 1, 28); // DAY LOCK: Day 1 = 2026-02-28 (UTC)
const MS_DAY = 86400000;

export function conflictDay(now) {
  const d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((d - DAY_ZERO) / MS_DAY) + 1;
}

export function dateOfDay(day) {
  return new Date(DAY_ZERO + (day - 1) * MS_DAY);
}

/** Whole UTC calendar days between the date of `iso` (or Date) and `now`. */
export function ageDays(when, now) {
  const t = when instanceof Date ? when : new Date(when);
  if (Number.isNaN(t.getTime())) return NaN;
  const a = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
  const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((b - a) / MS_DAY);
}

export const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\/[^\s/$.?#].[^\s]*$/i.test(u);

// ---------------------------------------------------------------------------------------------
// Chokepoints (data/chokepoints/latest.json, written weekly from the Chokepoint Weekly)
// ---------------------------------------------------------------------------------------------
export const LANES = ['suez', 'bam_redsea', 'hormuz'];
export const STATUSES = ['NORMAL', 'ELEVATED', 'DISRUPTED', 'CLOSED'];

// weekly_spec v1 §3.1: baselines are FIXED and published (mean daily n_total 1 Jan-31 Oct 2023 x 7,
// re-computed from the PortWatch API 2026-10-08: 515.42 / 522.10 / 669.38). A file that carries a
// different baseline cannot pass the index check by being self-consistent.
export const BASELINE_WEEK = { suez: 515.4, bam_redsea: 522.1, hormuz: 669.4 };

/** weekly_spec v1 section 3.2. Traffic alone never yields CLOSED. */
export function trafficBand(indexPct) {
  if (indexPct >= 90) return 'NORMAL';
  if (indexPct >= 50) return 'ELEVATED';
  return 'DISRUPTED';
}

export function chokepointView(cp) {
  const lanes = LANES.map((id) => (cp?.lanes || []).find((l) => l.lane === id)).filter(Boolean);
  const weeks = [...new Set(lanes.map((l) => `${l.week_start}|${l.week_end}`))];
  const laneAsOf = lanes.map((l) => l.as_of).filter((x) => typeof x === 'string' && !Number.isNaN(Date.parse(x)))
    .sort((a, b) => Date.parse(a) - Date.parse(b));
  return {
    // Printed "as of" = the OLDEST lane as_of (gated); the file-level as_of is not gated and is ignored.
    asOf: laneAsOf[0] || null,
    sourceName: cp?.source_name,
    sourceCredit: cp?.source_credit,
    sourceHome: cp?.source_home || null,
    issueLabel: cp?.issue_label,
    commonWeek: weeks.length === 1 ? { start: lanes[0].week_start, end: lanes[0].week_end } : null,
    lanes: lanes.map((l) => ({
      id: l.lane,
      name: l.name,
      subname: l.subname || null,
      nameAr: l.name_ar || null,
      subnameAr: l.subname_ar || null,
      status: l.status,
      index: l.index_pct_of_2023,
      transits: l.transits_week,
      prev: Number.isFinite(l.transits_prev_week) ? l.transits_prev_week : null,
      wow: Number.isFinite(l.transits_prev_week) && l.transits_prev_week > 0
        ? Math.round(((l.transits_week - l.transits_prev_week) / l.transits_prev_week) * 100)
        : null,
      weekStart: l.week_start,
      weekEnd: l.week_end,
      asOf: l.as_of,
      sourceUrl: l.source_url,
      override: l.analyst_override || null,
      statusBand: l.status_band || null,
      statusDriver: l.status_driver || null,
      statusSourceUrl: l.status_source_url || null,
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// Scenario odds (scenario_daily + scenarios registry, method market-anchored-v1)
// A, C and D are separate market-implied event probabilities. They can co-occur, so B
// ("none of A, C, D") is not a point: with no assumption about overlap it lies in the
// Frechet range [100 - (A + C + D), 100 - max(A, C, D)]. The published B equals the lower
// bound (the value that is right only if A, C and D are mutually exclusive).
// ---------------------------------------------------------------------------------------------
export const CORE = ['A', 'B', 'C', 'D'];

const round1 = (x) => Math.round(x * 10) / 10;

export function frechetB(a, c, d) {
  const lo = Math.max(0, 100 - (a + c + d));
  const hi = 100 - Math.max(a, c, d);
  return { lo: round1(lo), hi: round1(hi) };
}

/**
 * @param registry rows of `scenarios` (code, name_en, name_ar, group_code, status, display_order)
 * @param daily    published `scenario_daily` rows for ONE conflict_day
 */
export function oddsView(registry, daily) {
  const byId = new Map((registry || []).map((s) => [s.id, s]));
  const rows = (daily || []).map((r) => ({ ...r, sc: byId.get(r.scenario_id) }));
  const get = (code) => rows.find((r) => r.sc?.code === code);
  const val = (code) => {
    const r = get(code);
    if (!r) return null;
    const v = r.probability_raw ?? r.probability;
    return typeof v === 'number' ? v : (v == null ? null : Number(v));
  };
  const a = val('A'), c = val('C'), d = val('D'), bPub = val('B');
  const b = [a, c, d].every((x) => Number.isFinite(x)) ? frechetB(a, c, d) : null;
  const venues = new Set();
  const urls = new Set();
  for (const r of rows) {
    for (const i of Array.isArray(r.inputs) ? r.inputs : []) {
      if (i && i.used && i.venue && isHttpUrl(i.url)) { venues.add(i.venue); urls.add(i.url); }
    }
  }
  const e = get('E');
  const first = rows[0] || {};
  const name = (code) => get(code)?.sc?.name_en || code;
  const nameAr = (code) => get(code)?.sc?.name_ar || null;
  return {
    day: first.conflict_day ?? null,
    horizonEnd: first.horizon_end ?? null,
    method: first.method_version ?? null,
    recordedAt: rows.map((r) => r.recorded_at).filter(Boolean).sort().at(-1) || null,
    venues: [...venues].sort(),
    sourceUrls: [...urls],
    rows: [
      { code: 'A', name: name('A'), nameAr: nameAr('A'), lo: a, hi: a, kind: 'point' },
      { code: 'B', name: name('B'), nameAr: nameAr('B'), lo: b?.lo ?? null, hi: b?.hi ?? null, kind: 'range', published: bPub },
      { code: 'C', name: name('C'), nameAr: nameAr('C'), lo: c, hi: c, kind: 'point' },
      { code: 'D', name: name('D'), nameAr: nameAr('D'), lo: d, hi: d, kind: 'point' },
    ],
    e: e ? { name: name('E'), nameAr: nameAr('E'), value: e.probability_raw ?? e.probability ?? null, nullReason: e.null_reason || null } : null,
    raw: { a, c, d, bPub },
    perClassSources: Object.fromEntries(['A', 'C', 'D'].map((code) => {
      const r = get(code);
      const ok = (Array.isArray(r?.inputs) ? r.inputs : []).filter((i) => i && i.used && i.venue && isHttpUrl(i.url));
      return [code, ok.length];
    })),
  };
}

// ---------------------------------------------------------------------------------------------
// "What changed": top 3 sourced items from the day's General brief. Deterministic rule:
//  - sections of type "analysis" in brief order (the desk's editorial order), one item per subsection;
//  - the first paragraph that has a source with an outlet name and an http(s) URL, none of its
//    sources on the licence AVOID list, and a source dated within 2 days of the brief's day;
//  - negative findings ("No ... could be sourced") are skipped: they are not changes;
//  - the line is the paragraph's first sentence, verbatim, when it is <= MAX_LINE characters,
//    otherwise the subsection heading (also desk-written and covered by the same source).
// Nothing is paraphrased or generated here.
// ---------------------------------------------------------------------------------------------
// Licence AVOID list (licence_check.md rows 5, 6, 11a, 13). Matched against source names AND URLs AND
// the line's own text/heading: a wire story that quotes an LLI or Windward figure is still LLI/Windward data.
export const AVOID_OUTLETS = [
  /lloyd[\s'\u2018\u2019\u02bc`]*s[\s.-]*list/i, /lloydslist/i, /\blli\b/i,
  /straits[\s.-]*live/i, /windward/i, /drewry/i,
];
export const isAvoid = (s) => AVOID_OUTLETS.some((re) => re.test(String(s || '')));
// Party / state outlets (CLAUDE.md "Party sources", DECISION-002 Tier 3, Horn ruling). Backstop for a
// brief source that lacks party_source: true. Al Jazeera is conditional and left to the flag.
export const PARTY_OUTLETS = [
  /\birna\b/i, /irna\.ir/i, /tasnim/i, /\bfars\b/i, /farsnews/i, /press\s?tv/i, /presstv/i, /\bmehr\b/i, /mehrnews/i,
  /\birib\b/i, /kayhan/i, /al[\s-]?mayadeen/i, /al[\s-]?manar/i, /\btass\b/i, /tass\.(com|ru)/i, /xinhua/i, /\bwam\b/i, /wam\.ae/i,
  /\bspa\b/i, /spa\.gov\.sa/i, /the\s+national\b/i, /thenationalnews/i, /al[\s-]?ahram/i, /ahram\.org/i, /\bfana\b/i, /fanabc/i,
  /\bsonna\b/i, /sonna\.so/i, /\bsaba\b/i, /sabanew/i, /\bsana\b/i, /sana\.sy/i, /\brt\.com\b/i, /sputnik/i, /cgtn/i, /global\s?times/i,
];
export const isPartyOutlet = (x) => !!x && (x.party_source === true || PARTY_OUTLETS.some((re) => re.test(`${x.name || ''} ${x.url || ''}`)));
export const MAX_LINE = 160;
const NEGATIVE = /\b(could not be sourced|could be sourced|no sourced|not confirmed)\b/i;
const ABBREV = /\b(?:Mr|Mrs|Ms|Dr|St|Gen|Lt|Col|Maj|Capt|Sgt|Adm|Rep|Sen|Gov|No|Jr|Sr|Inc|Ltd|Co|U\.S|U\.K|U\.N|e\.g|i\.e|vs|approx)\.$/i;

export function firstSentence(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const re = /[.!?]["'”’)]?(?=\s+["'“‘(]?[A-Z0-9])/g;
  let m;
  while ((m = re.exec(t)) !== null) {
    const head = t.slice(0, m.index + m[0].length);
    if (ABBREV.test(head.replace(/["'”’)]$/, ''))) continue;
    return head;
  }
  return t;
}

function dayDiff(isoDate, day) {
  if (!isoDate || !Number.isFinite(day)) return NaN;
  const s = String(isoDate);
  const full = s.length > 10 ? new Date(s) : new Date(s.slice(0, 10) + 'T00:00:00Z');
  if (Number.isNaN(full.getTime())) return NaN;
  const t = Date.UTC(full.getUTCFullYear(), full.getUTCMonth(), full.getUTCDate()); // UTC calendar date
  return Math.round((dateOfDay(day).getTime() - t) / MS_DAY);
}

export function selectChanges(brief, { max = 3, sectionsKey = 'sections' } = {}) {
  const out = [];
  if (!brief || !Array.isArray(brief[sectionsKey])) return out;
  for (const s of brief[sectionsKey]) {
    if (s?.type !== 'analysis') continue;
    for (const ss of s.subsections || []) {
      if (out.length >= max) return out;
      for (const p of ss.paragraphs || []) {
        const srcs = (p.sources || []).filter((x) => x && x.name && isHttpUrl(x.url));
        if (!srcs.length) continue;
        if ((p.sources || []).some((x) => isAvoid(`${x?.name || ''} ${x?.url || ''}`))) continue;
        const fresh = srcs.filter((x) => { const dd = dayDiff(x.published_at, brief.conflict_day); return dd >= 0 && dd <= 2; });
        if (!fresh.length) continue;
        if (NEGATIVE.test(p.text || '')) continue;
        const sentence = firstSentence(p.text);
        const useSentence = sentence.length <= MAX_LINE;
        const line = useSentence ? sentence : String(ss.heading || '');
        if (line.trim().length < 12) continue; // no usable desk-written line
        if (isAvoid(p.text) || isAvoid(ss.heading)) continue; // licence-forbidden figure quoted through another outlet
        const src = fresh.find((x) => !isPartyOutlet(x)) || fresh[0];
        out.push({
          text: line,
          from: useSentence ? 'first-sentence' : 'heading',
          outlet: src.name,
          url: src.url,
          publishedAt: src.published_at,
          partySource: isPartyOutlet(src),
          section: s.id,
          subsection: ss.id,
        });
        break; // one item per subsection
      }
    }
  }
  return out;
}
