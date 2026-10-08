// Data-quality gates. Deterministic code, no model. The card refuses to render (exit non-zero) when
// any gate fails, unless the failure is staleness AND the caller passed allowStale, in which case the
// stale block is rendered greyed with its own "as of" date.
import {
  LANES, STATUSES, CORE, ageDays, conflictDay, dateOfDay, isHttpUrl, trafficBand, frechetB, BASELINE_WEEK, isAvoid,
} from './model.mjs';

export const MAX_AGE_DAYS = { chokepoints: 8, scenarios: 2, brief: 1 };
// The DATA period matters, not only when it was pulled: PortWatch lags ~4 days and the file is weekly,
// so the newest complete Mon-Sun week is at most ~12 days old at the end of a cycle.
export const MAX_WEEK_END_AGE_DAYS = 13;
const FUTURE_SLACK_MS = 5 * 60 * 1000;

const isIso = (s) => typeof s === 'string' && !Number.isNaN(Date.parse(s));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
const fin = (x) => typeof x === 'number' && Number.isFinite(x);

/**
 * @returns {{ok:boolean, errors:string[], stale:{chokepoints:boolean,scenarios:boolean,brief:boolean}, notes:string[]}}
 */
export function runGates({ chokepoints, registry, daily, brief, changes }, { now, allowStale = false } = {}) {
  const errors = [];
  const notes = [];
  const stale = { chokepoints: false, scenarios: false, brief: false };
  const today = conflictDay(now);

  const staleCheck = (block, age, label) => {
    if (!Number.isFinite(age)) { errors.push(`${block}: as_of is missing or not a date (${label})`); return; }
    if (age < 0) { errors.push(`${block}: as_of ${label} is in the future`); return; }
    if (age > MAX_AGE_DAYS[block]) {
      const msg = `${block}: as_of ${label} is ${age} day(s) old; allowed ${MAX_AGE_DAYS[block]}`;
      if (allowStale) { stale[block] = true; notes.push(`STALE (rendered greyed): ${msg}`); }
      else errors.push(`STALE ${msg}`);
    }
  };

  // ---- Chokepoints -------------------------------------------------------------------------
  if (!chokepoints || chokepoints.schema !== 'chokepoints/v1') {
    errors.push('chokepoints: file missing or schema is not "chokepoints/v1"');
  } else {
    if (!chokepoints.source_credit) errors.push('chokepoints: source_credit missing');
    if (isAvoid(chokepoints.source_credit) || isAvoid(chokepoints.source_name)) errors.push('chokepoints: source is on the licence AVOID list');
    const lanes = Array.isArray(chokepoints.lanes) ? chokepoints.lanes : [];
    for (const id of LANES) if (lanes.filter((x) => x?.lane === id).length > 1) errors.push(`chokepoints.${id}: lane appears more than once`);
    const weeks = new Set(LANES.map((id) => lanes.find((x) => x?.lane === id)).filter(Boolean).map((l) => `${l.week_start}|${l.week_end}`));
    if (weeks.size > 1) errors.push(`chokepoints: lanes cover different weeks (${[...weeks].join(', ')}); the card prints one week`);
    for (const id of LANES) {
      const l = lanes.find((x) => x?.lane === id);
      if (!l) { errors.push(`chokepoints.${id}: lane missing`); continue; }
      const p = `chokepoints.${id}`;
      if (!l.name) errors.push(`${p}: name missing`);
      if (!isHttpUrl(l.source_url)) errors.push(`${p}: source_url missing or not http(s)`);
      else if (isAvoid(l.source_url)) errors.push(`${p}: source_url is on the licence AVOID list`);
      if (!STATUSES.includes(l.status)) errors.push(`${p}: status "${l.status}" not one of ${STATUSES.join('/')}`);
      if (!fin(l.index_pct_of_2023) || l.index_pct_of_2023 < 0 || l.index_pct_of_2023 > 200) errors.push(`${p}: index_pct_of_2023 malformed (${l.index_pct_of_2023})`);
      if (!Number.isInteger(l.transits_week) || l.transits_week < 0) errors.push(`${p}: transits_week malformed (${l.transits_week})`);
      if (!isDate(l.week_start) || !isDate(l.week_end) || l.week_end < l.week_start) errors.push(`${p}: week_start/week_end malformed`);
      if (!isIso(l.as_of)) errors.push(`${p}: as_of missing or not ISO-8601`);
      else if (isDate(l.week_end) && l.week_end > l.as_of.slice(0, 10)) errors.push(`${p}: week_end ${l.week_end} is after as_of ${l.as_of}`);
      // Internal consistency: printed index and status must follow from the printed counts (weekly_spec §3).
      if (fin(l.baseline_week) && Math.abs(l.baseline_week - BASELINE_WEEK[id]) > 0.5) errors.push(`${p}: baseline_week ${l.baseline_week} differs from the frozen weekly_spec baseline ${BASELINE_WEEK[id]}`);
      if (!['traffic', 'security'].includes(l.status_band)) errors.push(`${p}: status_band must be "traffic" or "security"`);
      if (l.status_band === 'security') {
        // weekly_spec §3: the card must say which band set the status, and a security status is never PortWatch's.
        if (!l.status_driver || String(l.status_driver).length < 10) errors.push(`${p}: a security-band status needs a status_driver (printed on the card)`);
        if (!isHttpUrl(l.status_source_url)) errors.push(`${p}: a security-band status needs status_source_url (UKMTO / MARAD / SCA / JMIC page)`);
        else if (isAvoid(l.status_source_url) || isAvoid(l.status_driver)) errors.push(`${p}: security-band source is on the licence AVOID list`);
      }
      if (fin(l.baseline_week) && l.baseline_week > 0 && Number.isInteger(l.transits_week) && fin(l.index_pct_of_2023)) {
        const idx = (l.transits_week / l.baseline_week) * 100;
        if (Math.abs(idx - l.index_pct_of_2023) > 0.15) errors.push(`${p}: index ${l.index_pct_of_2023}% does not match transits/baseline = ${idx.toFixed(1)}%`);
      } else errors.push(`${p}: baseline_week missing, cannot verify index`);
      if (fin(l.index_pct_of_2023) && STATUSES.includes(l.status)) {
        const band = trafficBand(l.index_pct_of_2023);
        const rank = (s) => STATUSES.indexOf(s);
        if (l.analyst_override) {
          if (typeof l.analyst_override !== 'string' || l.analyst_override.length < 10) errors.push(`${p}: analyst_override must carry the written reason printed on the card`);
        } else if (l.status_band === 'traffic' && l.status !== band) {
          errors.push(`${p}: status ${l.status} but traffic band for ${l.index_pct_of_2023}% is ${band}`);
        } else if (rank(l.status) < rank(band)) {
          errors.push(`${p}: status ${l.status} is milder than its traffic band ${band} (status = worse of the two bands)`);
        } else if (l.status_band !== 'traffic' && rank(l.status) > rank(band) && !l.status_driver) {
          errors.push(`${p}: status ${l.status} set by the security band needs a status_driver`);
        }
      }
      if (isIso(l.as_of)) {
        if (Date.parse(l.as_of) > now.getTime() + FUTURE_SLACK_MS) errors.push(`${p}: as_of ${l.as_of} is in the future`);
        else staleCheck('chokepoints', ageDays(l.as_of, now), `${l.as_of} (${id})`);
      }
      if (isDate(l.week_end)) {
        const wAge = ageDays(l.week_end + 'T00:00:00Z', now);
        if (wAge > MAX_WEEK_END_AGE_DAYS) {
          const msg = `chokepoints: ${id} data week ends ${l.week_end}, ${wAge} day(s) ago; allowed ${MAX_WEEK_END_AGE_DAYS}`;
          if (allowStale) { stale.chokepoints = true; notes.push(`STALE (rendered greyed): ${msg}`); } else errors.push(`STALE ${msg}`);
        }
      }
    }
    // One stale lane greys the block once; de-duplicate notes.
  }

  // ---- Scenarios ---------------------------------------------------------------------------
  const reg = Array.isArray(registry) ? registry : [];
  const rows = Array.isArray(daily) ? daily : [];
  if (!rows.length) errors.push('scenarios: no published scenario_daily rows');
  else {
    const days = new Set(rows.map((r) => r.conflict_day));
    if (days.size !== 1) errors.push(`scenarios: rows span several conflict days (${[...days].join(',')})`);
    const day = rows[0].conflict_day;
    if (!Number.isInteger(day)) errors.push('scenarios: conflict_day malformed');
    if (rows.some((r) => r.is_published !== true)) errors.push('scenarios: an unpublished row reached the card');
    if (rows.some((r) => r.method_version !== 'market-anchored-v1')) errors.push('scenarios: method_version is not market-anchored-v1 on every row');
    if (!isDate(rows[0].horizon_end)) errors.push('scenarios: horizon_end missing');
    const byId = new Map(reg.map((s) => [s.id, s]));
    const v = {};
    for (const code of CORE) {
      const r = rows.find((x) => byId.get(x.scenario_id)?.code === code);
      if (!r) { errors.push(`scenarios.${code}: no published row for Day ${day}`); continue; }
      const x = r.probability_raw ?? r.probability;
      const n = typeof x === 'string' ? (x.trim() === '' ? NaN : Number(x)) : x;
      if (!fin(n) || n < 0 || n > 100) { errors.push(`scenarios.${code}: probability ${x} malformed (must be 0-100)`); continue; }
      v[code] = n;
      if (code !== 'B') {
        const used = (Array.isArray(r.inputs) ? r.inputs : []).filter((i) => i && i.used && i.venue);
        if (!used.length) errors.push(`scenarios.${code}: no used market input recorded`);
        if (used.some((i) => !isHttpUrl(i.url))) errors.push(`scenarios.${code}: a used market input has no source URL`);
      }
    }
    // E is printed as a number whenever it has one, so it needs the same checks as A-D.
    const eRow = rows.find((x) => byId.get(x.scenario_id)?.code === 'E');
    if (eRow) {
      const ex = eRow.probability_raw ?? eRow.probability;
      if (ex != null) {
        const en = typeof ex === 'string' && ex.trim() !== '' ? Number(ex) : ex;
        if (!fin(en) || en < 0 || en > 100) errors.push(`scenarios.E: probability ${ex} malformed (must be 0-100)`);
        const used = (Array.isArray(eRow.inputs) ? eRow.inputs : []).filter((i) => i && i.used && i.venue);
        if (!used.length) errors.push('scenarios.E: printed value has no used market input recorded');
        if (used.some((i) => !isHttpUrl(i.url))) errors.push('scenarios.E: a used market input has no source URL');
      }
    }
    if (['A', 'C', 'D'].every((c) => fin(v[c]))) {
      const sum = v.A + v.C + v.D;
      if (sum > 100) errors.push(`scenarios: A+C+D = ${sum.toFixed(1)} > 100, residual B undefined (run should have been KEEP_FROZEN)`);
      const b = frechetB(v.A, v.C, v.D);
      if (!(b.lo <= b.hi) || b.lo < 0 || b.hi > 100) errors.push(`scenarios.B: range ${b.lo}-${b.hi} malformed`);
      if (fin(v.B) && (v.B < b.lo - 0.51 || v.B > b.hi + 0.51)) errors.push(`scenarios.B: published ${v.B} lies outside its range ${b.lo}-${b.hi}`);
    }
    if (Number.isInteger(day)) staleCheck('scenarios', ageDays(dateOfDay(day), now), `Day ${day}`);
    if (Number.isInteger(day) && day > today) errors.push(`scenarios: Day ${day} is after today (Day ${today})`);
  }

  // ---- Brief -------------------------------------------------------------------------------
  if (!brief) {
    errors.push('brief: no General brief found');
  } else {
    if (brief.quality !== 'full') errors.push(`brief: quality "${brief.quality}" is not "full" (retrospective / reconstructed briefs never feed the card)`);
    if (!Number.isInteger(brief.conflict_day)) errors.push('brief: conflict_day malformed');
    else {
      staleCheck('brief', ageDays(dateOfDay(brief.conflict_day), now), `Day ${brief.conflict_day}`);
      if (brief.conflict_day > today) errors.push(`brief: Day ${brief.conflict_day} is after today (Day ${today})`);
    }
    for (const [i, c] of (changes || []).entries()) {
      if (!isHttpUrl(c.url)) errors.push(`brief.change[${i + 1}]: source URL missing`);
      if (!c.outlet) errors.push(`brief.change[${i + 1}]: outlet name missing`);
      if (!c.text || c.text.length < 12) errors.push(`brief.change[${i + 1}]: text missing`);
      if (isAvoid(`${c.text} ${c.outlet} ${c.url}`)) errors.push(`brief.change[${i + 1}]: licence AVOID source or figure`);
    }
    if (!(changes || []).length) notes.push('brief: no sourced item passed the selection rule; card shows "No sourced change today"');
  }

  return { ok: errors.length === 0, errors: [...new Set(errors)], stale, notes: [...new Set(notes)] };
}
