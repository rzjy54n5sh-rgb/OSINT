/**
 * /embed/chokepoints — Suez, Bab al-Mandeb, Hormuz from data/chokepoints/latest.json (the Chokepoint Weekly
 * file the daily card reads). No rule is re-implemented here: validity and staleness come from the card's own
 * gate (scripts/card/lib/gates.mjs runGates, chokepoint block only, allowStale) and the view model from
 * scripts/card/lib/model.mjs chokepointView. So:
 *   - gate passes                -> the lanes, values copied from the file;
 *   - only staleness fails       -> the same lanes, greyed, "Not updated since <oldest lane as_of>";
 *     (as_of older than MAX_AGE_DAYS.chokepoints = 8 days, or week_end older than MAX_WEEK_END_AGE_DAYS = 13)
 *   - anything else fails        -> no numbers at all (the card would refuse to render too).
 */
import { runGates as runGatesJs } from '@/scripts/card/lib/gates.mjs';
import { chokepointView } from '@/scripts/card/lib/model.mjs';
import { embedPage, esc, extLink, fmtDate, safeHref } from '@/lib/embed/html';
import { SITE_HOST } from '@/lib/site';

// gates.mjs is plain JS: its options parameter is inferred from the `= {}` default, so type it here.
type GateResult = { ok: boolean; errors: string[]; stale: { chokepoints: boolean; scenarios: boolean; brief: boolean }; notes: string[] };
const runGates = runGatesJs as unknown as (
  bundle: { chokepoints: unknown; registry: unknown[]; daily: unknown[]; brief: unknown; changes: unknown[] },
  opts: { now: Date; allowStale?: boolean },
) => GateResult;

export interface ChokepointLaneEmbed {
  id: string;
  name: string;
  subname: string | null;
  status: string;
  indexPct: number;
  transits: number;
  weekStart: string;
  weekEnd: string;
}

export interface ChokepointsEmbed {
  state: 'ok' | 'stale' | 'invalid';
  lanes: ChokepointLaneEmbed[];
  /** Oldest lane as_of (the gated one), ISO. */
  asOf: string | null;
  week: { start: string; end: string } | null;
  sourceCredit: string | null;
  sourceHome: string | null;
  /** "Not updated since 8 Oct 2026" when stale, else null. */
  staleNote: string | null;
  /** Gate errors for the chokepoint block (never shown to readers; for logs/tests). */
  errors: string[];
}

export function chokepointsEmbedView(file: unknown, now: Date): ChokepointsEmbed {
  const gate = runGates({ chokepoints: file, registry: [], daily: [], brief: null, changes: [] }, { now, allowStale: true });
  // runGates checks every card block; only the chokepoint block's verdict matters here.
  const errors = gate.errors.filter((e) => e.startsWith('chokepoints'));
  if (errors.length > 0 || !file) {
    return { state: 'invalid', lanes: [], asOf: null, week: null, sourceCredit: null, sourceHome: null, staleNote: null, errors: errors.length ? errors : ['chokepoints: file missing'] };
  }
  const v = chokepointView(file);
  const stale = gate.stale.chokepoints === true;
  return {
    state: stale ? 'stale' : 'ok',
    lanes: v.lanes.map((l: Record<string, unknown>) => ({
      id: String(l.id),
      name: String(l.name),
      subname: typeof l.subname === 'string' ? l.subname : null,
      status: String(l.status),
      indexPct: Number(l.index),
      transits: Number(l.transits),
      weekStart: String(l.weekStart),
      weekEnd: String(l.weekEnd),
    })),
    asOf: v.asOf ?? null,
    week: v.commonWeek ?? null,
    sourceCredit: typeof v.sourceCredit === 'string' ? v.sourceCredit : null,
    sourceHome: typeof v.sourceHome === 'string' ? v.sourceHome : null,
    staleNote: stale ? `Not updated since ${fmtDate(v.asOf) ?? 'an unknown date'}` : null,
    errors: [],
  };
}

const WEEK = (w: { start: string; end: string } | null) => {
  if (!w) return null;
  const a = fmtDate(w.start);
  const b = fmtDate(w.end);
  return a && b ? `${a} – ${b}` : null;
};

/** Full widget document. */
export function renderChokepointsEmbed(v: ChokepointsEmbed): string {
  // The site has no chokepoint page yet: the footer links the home page.
  const fullPath = '/';
  const fullLabel = SITE_HOST;
  if (v.state === 'invalid') {
    return embedPage({
      title: 'Chokepoints',
      fullPath,
      fullLabel,
      body: '<p class="k">Chokepoints · weekly transits</p><p class="note">Chokepoint data is unavailable: the latest file did not pass the desk\'s data checks, so no figures are shown.</p>',
    });
  }
  const rows = v.lanes
    .map(
      (l) =>
        '<tr>' +
        `<td>${esc(l.name)}${l.subname ? `<span class="sub">${esc(l.subname)}</span>` : ''}</td>` +
        `<td><span class="st st-${esc(l.status)}">${esc(l.status)}</span></td>` +
        `<td class="num">${esc(l.indexPct.toFixed(1))}%</td>` +
        `<td class="num">${esc(l.transits)}</td>` +
        '</tr>',
    )
    .join('');
  const week = WEEK(v.week);
  const home = safeHref(v.sourceHome);
  const body =
    '<p class="k">Chokepoints · weekly transits</p>' +
    (v.staleNote ? `<p class="stale-banner">${esc(v.staleNote)}</p>` : '') +
    '<div class="data">' +
    '<table><thead><tr><th>Lane</th><th>Status</th><th title="Transits as % of the Jan–Oct 2023 weekly average">% of 2023</th><th>Transits</th></tr></thead>' +
    `<tbody>${rows}</tbody></table>` +
    '</div>' +
    `<p class="meta">${week ? `Week ${esc(week)} · ` : ''}as of ${esc(fmtDate(v.asOf) ?? '—')}` +
    ' · % of the Jan–Oct 2023 weekly average' +
    `${home ? ` · ${extLink(home, 'portwatch.imf.org')}` : ''}</p>`;
  return embedPage({ title: 'Chokepoints', body, fullPath, fullLabel, credit: v.sourceCredit, stale: v.state === 'stale' });
}
