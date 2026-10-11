// HTML template for the daily card. Two layouts: "portrait" 1080x1350 (WhatsApp / Instagram /
// Telegram / LinkedIn feed) and "landscape" 1200x630 (link preview). Flat colours only (chat apps
// recompress), no gradients behind numbers, status never carried by colour alone.
import { STRINGS } from './i18n.mjs';

export const SIZES = {
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
};

// Tokens from strategy/10_design.md §4.4. Gold = brand only. Data colours: one blue–grey–orange ramp.
const T = {
  bg: '#0A0F17', s1: '#111826', s2: '#1A2333', line: '#2A3446',
  hi: '#EEF2F6', mid: '#A9B4C2', lo: '#8592A3', brand: '#E8C547',
  blue: '#3D8BD6', grey: '#8E98A5', amber: '#F0A35A', orange: '#E5662F',
};
const STATUS_COLOUR = { NORMAL: T.blue, ELEVATED: T.amber, DISRUPTED: T.orange, CLOSED: T.orange };
const SCN_COLOUR = { A: T.blue, B: T.grey, C: T.amber, D: T.orange };

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const n1 = (x) => (Math.round(x * 10) / 10).toFixed(1);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const fmtDate = (iso, { year = false } = {}) => {
  const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00Z' : iso);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${year ? ' ' + d.getUTCFullYear() : ''}`;
};
const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`; };
const zoned = (date, tz) => new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);
const weekday = (date, lang = 'en') => new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { timeZone: 'UTC', weekday: lang === 'ar' ? 'long' : 'short' }).format(date);
const arDate = (iso, { year = false } = {}) => new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone: 'UTC', day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}) })
  .format(new Date(String(iso).length === 10 ? iso + 'T00:00:00Z' : iso));
const dateFor = (lang) => (lang === 'ar' ? arDate : fmtDate);
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

function fontFaces(fontDir) {
  const f = (family, file, weight) => `@font-face{font-family:'${family}';src:url('${fontDir}/${file}') format('woff2');font-weight:${weight};font-style:normal;font-display:block}`;
  return [
    f('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2', 400),
    f('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2', 500),
    f('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2', 600),
    f('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2', 700),
    f('IBM Plex Sans', 'ibm-plex-sans/files/ibm-plex-sans-latin-ext-400-normal.woff2', 400),
    f('IBM Plex Mono', 'ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2', 400),
    f('IBM Plex Mono', 'ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2', 500),
    f('IBM Plex Sans Arabic', 'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-400-normal.woff2', 400),
    f('IBM Plex Sans Arabic', 'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-600-normal.woff2', 600),
    f('IBM Plex Sans Arabic', 'ibm-plex-sans-arabic/files/ibm-plex-sans-arabic-arabic-700-normal.woff2', 700),
  ].join('\n');
}

function css(layout, lang) {
  const P = layout === 'portrait';
  const { width, height } = SIZES[layout];
  const ui = lang === 'ar' ? `'IBM Plex Sans Arabic','IBM Plex Sans',sans-serif` : `'IBM Plex Sans','IBM Plex Sans Arabic',sans-serif`;
  return `
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:${width}px;height:${height}px;background:${T.bg};overflow:hidden}
body{color:${T.hi};font-family:${ui};-webkit-font-smoothing:antialiased;text-rendering:geometricPrecision}
.mono,bdi.n{font-family:'IBM Plex Mono',monospace;font-feature-settings:"tnum";font-weight:500}
#card{position:absolute;inset:0;padding:${P ? '40px 60px 30px' : '28px 44px 22px'};display:flex;flex-direction:column}
.top{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:${P ? 18 : 12}px;border-bottom:1px solid ${T.line}}
.brand{display:flex;align-items:center;gap:${P ? 16 : 12}px}
.mark{width:${P ? 22 : 17}px;height:${P ? 22 : 17}px;background:${T.brand};transform:rotate(45deg);border-radius:2px;flex:none;margin:0 6px}
.bname{font-size:${P ? 36 : 28}px;font-weight:700;letter-spacing:.005em;line-height:1.1}
.desc{font-size:${P ? 23 : 19}px;color:${T.mid};margin-top:${P ? 4 : 2}px}
.when{text-align:end}
.when .d{font-size:${P ? 32 : 26}px;color:${T.hi}}
.when .w{font-size:${P ? 21 : 16}px;color:${T.mid};margin-top:2px;white-space:nowrap}
.blk{margin-top:${P ? 18 : 14}px;position:relative}
.bh{display:flex;justify-content:space-between;align-items:baseline;gap:16px;margin-bottom:${P ? 12 : 8}px}
h2{font-size:${P ? 32 : 26}px;font-weight:600;line-height:1.2}
.chip{font-size:${P ? 22 : 18}px;color:${T.mid};white-space:nowrap}
.src{font-size:${P ? 21 : 17}px;color:${T.lo};line-height:1.4;margin-top:${P ? 10 : 6}px}
.stale{filter:grayscale(1);opacity:.55}
.stalebadge{display:inline-block;font-size:${P ? 21 : 16}px;font-weight:600;color:${T.hi};border:1px solid ${T.mid};border-radius:4px;padding:2px 10px;margin-inline-start:12px;vertical-align:middle}
.flt{filter:none;opacity:1}
/* chokepoint tiles */
.tiles{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:${P ? 14 : 12}px}
.tile{background:${T.s1};border:1px solid ${T.line};border-radius:8px;padding:${P ? '16px 18px 14px' : '12px 14px'}}
.lname{font-size:${P ? 25 : 20}px;font-weight:600;line-height:1.15;white-space:nowrap}
.lsub{font-size:${P ? 19 : 15}px;color:${T.lo};font-weight:400}
.st{display:inline-flex;align-items:center;gap:8px;margin-top:${P ? 10 : 8}px;padding:${P ? '4px 12px' : '4px 10px'};border-radius:4px;color:${T.bg};font-size:${P ? 22 : 20}px;font-weight:700;letter-spacing:.01em}
.st.closed{background-image:repeating-linear-gradient(45deg,rgba(10,15,23,.35) 0 4px,transparent 4px 9px)}
.big{font-size:${P ? 54 : 40}px;line-height:1;margin-top:${P ? 12 : 8}px;letter-spacing:-.07em}
.big small{font-size:.5em;letter-spacing:0;margin-inline-start:6px;color:${T.mid}}
.of{font-size:${P ? 20 : 15}px;color:${T.mid};margin-top:${P ? 4 : 3}px}
.bar{position:relative;height:${P ? 12 : 9}px;background:${T.s2};border-radius:3px;margin-top:${P ? 12 : 8}px;direction:ltr}
.bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px}
.bar b{position:absolute;top:-4px;bottom:-4px;width:2px;background:${T.lo}}
.tr{font-size:${P ? 21 : 16}px;color:${T.mid};margin-top:${P ? 10 : 7}px;white-space:nowrap}
.tr bdi.n{letter-spacing:-.03em}
/* what changed */
.chg{list-style:none}
.chg li{display:grid;grid-template-columns:${P ? 28 : 22}px 1fr;gap:${P ? 10 : 8}px;padding:${P ? '9px 0' : '6px 0'};border-top:1px solid ${T.s2}}
.chg li:first-child{border-top:0;padding-top:0}
.chg .k{font-size:${P ? 24 : 18}px;color:${T.lo};padding-top:2px}
.chg .t{font-size:${P ? 27 : 20}px;line-height:1.34}
.chg .o{font-size:${P ? 21 : 16}px;color:${T.mid};white-space:nowrap}
.none{font-size:${P ? 27 : 20}px;color:${T.mid}}
/* odds strip */
.odds{display:grid;grid-template-columns:${P ? '40px 290px 1fr 210px' : '32px 1fr auto'};column-gap:${P ? 16 : 12}px;row-gap:${P ? 6 : 4}px;align-items:center}
.odds .trk.l,.odds .axl.l{grid-column:2 / 4;margin-bottom:6px}
.code{width:${P ? 36 : 30}px;height:${P ? 36 : 30}px;border-radius:4px;color:${T.bg};display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-weight:500;font-size:${P ? 21 : 17}px}
.sn{font-size:${P ? 26 : 21}px;white-space:nowrap}
.val{font-size:${P ? 28 : 24}px;text-align:end;white-space:nowrap;letter-spacing:${P ? 0 : '-.03em'}}
.trk{position:relative;height:${P ? 30 : 22}px;direction:ltr}
.trk .ax{position:absolute;left:0;right:0;top:50%;height:2px;margin-top:-1px;background:${T.line}}
.trk .tk{position:absolute;top:25%;bottom:25%;width:1px;background:${T.line}}
.trk .pt{position:absolute;top:50%;width:${P ? 20 : 15}px;height:${P ? 20 : 15}px;border-radius:50%;transform:translate(-50%,-50%);border:2px solid ${T.bg}}
.trk .rg{position:absolute;top:50%;height:${P ? 16 : 12}px;transform:translateY(-50%);border-radius:${P ? 8 : 6}px}
.axl{position:relative;height:${P ? 22 : 18}px;font-size:${P ? 19 : 15}px;color:${T.lo};direction:ltr}
.axl span{position:absolute;transform:translateX(-50%)}
.axl span:first-child{transform:none}
.axl span:last-child{transform:translateX(-100%)}
.wmbox{position:absolute;inset:0;overflow:hidden;pointer-events:none;direction:ltr}
.wm{position:absolute;left:-200px;right:-200px;top:46%;text-align:center;transform:rotate(-18deg);font:700 52px 'IBM Plex Sans',sans-serif;color:rgba(232,197,71,.18);white-space:nowrap}
.onote{font-size:${P ? 21 : 17}px;color:${T.mid};line-height:1.4;margin-top:${P ? 4 : 4}px}
.eline{font-size:${P ? 21 : 15}px;color:${T.mid};margin-top:${P ? 4 : 4}px}
/* footer */
.foot{margin-top:auto;padding-top:${P ? 16 : 10}px;border-top:1px solid ${T.line};display:flex;justify-content:space-between;align-items:center;gap:20px;font-size:${P ? 21 : 18}px;color:${T.mid}}
.ed{display:inline-block;font-weight:600;line-height:1.3;color:${T.hi};border:1px solid ${T.line};border-radius:4px;padding:2px 10px;white-space:nowrap}
.url{color:${T.hi}}
.times{color:${T.lo};white-space:nowrap}
/* landscape two-column */
.cols{display:grid;grid-template-columns:600px 1fr;gap:36px;flex:1;min-height:0}
.rows .row{display:grid;grid-template-columns:214px 140px 1fr;align-items:center;gap:14px;padding:14px 0;border-top:1px solid ${T.s2}}
.rows .row:first-child{border-top:0;padding-top:0}
.rows .lname{font-size:24px}
.rows .st{margin-top:0;justify-content:center}
.rows .big{font-size:44px;margin-top:0;text-align:end}
.rows .tr{margin-top:4px;font-size:17px}
`;
}

function header(S, m) {
  return `<div class="top">
  <div class="brand"><span class="mark" aria-hidden="true"></span><div><div class="bname">${esc(S.brand)}</div><div class="desc">${esc(S.descriptor)}</div></div></div>
  <div class="when"><div class="d">${esc(S.dayWord)} <bdi class="n">${m.today}</bdi></div><div class="w">${esc(m.todayLabel)}</div><div class="w">${m.timesHtml}</div></div>
</div>`;
}

function blockHead(S, title, chip, staleAsOf) {
  return `<div class="bh"><h2>${esc(title)}${staleAsOf ? `<span class="stalebadge">${esc(S.staleBadge(staleAsOf))}</span>` : ''}</h2>${chip ? `<span class="chip"><bdi>${esc(chip)}</bdi></span>` : ''}</div>`;
}

function statusChip(S, status) {
  return `<span class="st${status === 'CLOSED' ? ' closed' : ''}" style="background:${STATUS_COLOUR[status]}">${esc(S.status[status])}</span>`;
}

function bar(lane) {
  const w = Math.max(0, Math.min(100, lane.index));
  return `<div class="bar" role="img" aria-label="${n1(lane.index)} percent of 2023 traffic"><i style="width:${w}%;background:${STATUS_COLOUR[lane.status]}"></i><b style="left:50%"></b><b style="left:90%"></b></div>`;
}

const signed = (p) => `${p > 0 ? '+' : p < 0 ? '−' : '±'}${Math.abs(p)}%`;
const trLine = (S, l) => `<bdi class="n">${l.transits}</bdi> ${esc(S.transitsWord)}${l.wow != null ? ` · <bdi class="n">${signed(l.wow)}</bdi> ${esc(S.wowWord)}` : ''}`;

function chokepointTiles(S, cp) {
  return `<div class="tiles">${cp.lanes.map((l) => `<div class="tile">
    <div class="lname">${esc(S.dir === 'rtl' ? l.nameAr || l.name : l.name)}${l.subname ? ` <span class="lsub">${esc(S.dir === 'rtl' ? l.subnameAr || l.subname : l.subname)}</span>` : ''}</div>
    ${statusChip(S, l.status)}
    <div class="big mono"><bdi>${n1(l.index)}<small>%</small></bdi></div>
    <div class="of">${esc(S.ofBaseline)}</div>
    ${bar(l)}
    <div class="tr">${trLine(S, l)}</div>
  </div>`).join('')}</div>`;
}

function chokepointRows(S, cp) {
  return `<div class="rows">${cp.lanes.map((l) => `<div class="row">
    <div><div class="lname">${esc(S.dir === 'rtl' ? l.nameAr || l.name : l.name)}</div><div class="tr">${trLine(S, l)}</div></div>
    ${statusChip(S, l.status)}
    <div><div class="big mono"><bdi>${n1(l.index)}<small>%</small></bdi></div>${bar(l)}</div>
  </div>`).join('')}</div>`;
}

function track(r, cls = '') {
  const ticks = [0, 25, 50, 75, 100].map((x) => `<span class="tk" style="left:${x}%"></span>`).join('');
  const c = SCN_COLOUR[r.code];
  let mark = '';
  if (r.lo != null && r.hi != null) {
    mark = r.kind === 'range' && r.hi > r.lo
      ? `<span class="rg" style="left:${r.lo}%;width:${r.hi - r.lo}%;background:${c}"></span>`
      : `<span class="pt" style="left:${r.lo}%;background:${c}"></span>`;
  }
  return `<div class="trk ${cls}" role="img" aria-label="${r.code} ${r.kind === 'range' ? `${n1(r.lo)} to ${n1(r.hi)}` : n1(r.lo)} percent"><span class="ax"></span>${ticks}${mark}</div>`;
}

const valText = (r) => (r.lo == null ? '—' : r.kind === 'range' && r.hi > r.lo ? `${n1(r.lo)}–${n1(r.hi)}%` : `${n1(r.lo)}%`);

function oddsStrip(S, odds, layout, lang) {
  const P = layout === 'portrait';
  const name = (r) => (lang === 'ar' ? r.nameAr || r.name : r.name);
  const rows = odds.rows.map((r) => P
    ? `<span class="code" style="background:${SCN_COLOUR[r.code]}">${r.code}</span><span class="sn">${esc(name(r))}</span>${track(r)}<span class="val mono"><bdi>${valText(r)}</bdi></span>`
    : `<span class="code" style="background:${SCN_COLOUR[r.code]}">${r.code}</span><span class="sn">${esc(name(r))}</span><span class="val mono"><bdi>${valText(r)}</bdi></span>${track(r, 'l')}`).join('');
  const axis = P
    ? `<span></span><span></span><div class="axl"><span style="left:0%">0</span><span style="left:50%">50</span><span style="left:100%">100%</span></div><span></span>`
    : `<span></span><div class="axl l"><span style="left:0%">0</span><span style="left:50%">50</span><span style="left:100%">100%</span></div>`;
  return `<div class="odds">${rows}${axis}</div>`;
}

function eLine(S, odds, lang) {
  if (!odds.e) return '';
  const nm = lang === 'ar' ? odds.e.nameAr || odds.e.name : odds.e.name;
  return `<div class="eline">${esc(odds.e.value == null ? S.eUnmeasured(nm) : S.eValue(nm, n1(odds.e.value)))}</div>`;
}

function changesList(S, changes, fd = fmtDate) {
  if (!changes.length) return `<div class="none">${esc(S.noChange)}</div>`;
  return `<ol class="chg">${changes.map((c, i) => `<li><span class="k mono">${i + 1}</span><div><div class="t">${esc(c.text)} <span class="o">${esc(c.outlet)}, <bdi>${esc(fd(c.publishedAt))}</bdi>${c.partySource ? ` (${esc(S.partySource)})` : ''}</span></div></div></li>`).join('')}</ol>`;
}

function footer(S, m) {
  return `<div class="foot"><span class="ed">${esc(m.reviewed ? S.reviewed : S.automated)}</span><span class="url">${esc(m.siteUrl)}</span></div>`;
}

/**
 * @param m view-model: { lang, layout, today, now, cp, odds, changes, brief, stale, reviewed, siteUrl, fontDir }
 */
export function renderHtml(m) {
  const S = STRINGS[m.lang];
  const P = m.layout === 'portrait';
  const now = m.now;
  const fd = dateFor(m.lang);
  m.todayLabel = `${weekday(now, m.lang)} ${fd(now.toISOString(), { year: true })}`;
  const b = (t) => `<bdi class="n">${t}</bdi>`;
  m.timesHtml = S.times(b(hhmm(now.toISOString())), b(zoned(now, 'Africa/Cairo')), b(zoned(now, 'Asia/Dubai')));
  m.timesShort = `${hhmm(now.toISOString())} UTC`;

  const cp = m.cp;
  const cpAsOf = fd(cp.asOf, { year: false });
  const cpChip = cp.commonWeek ? S.week(fd(cp.commonWeek.start), fd(cp.commonWeek.end)) : '';
  const overrides = cp.lanes.filter((l) => l.override).map((l) => `${S.override} (${l.name}): ${l.override}.`).join(' ');
  // weekly_spec §3: say which band set the status. A security-band status is not a PortWatch figure.
  const secStatus = cp.lanes.filter((l) => l.statusBand === 'security').map((l) => S.securityStatus(l.name, l.statusDriver, hostOf(l.statusSourceUrl))).join(' ');
  const cpExtra = [secStatus, overrides].filter(Boolean).join(' ');
  const cpSrc = `${cp.sourceCredit} · ${S.asOf(cpAsOf)}. ${S.cpNote}${cpExtra ? ' ' + cpExtra : ''}`;
  const odds = m.odds;
  const oddsAsOf = `Day ${odds.day}`;
  const oddsSrc = S.oddsSource(odds.venues.join(', '), odds.method, odds.day, odds.recordedAt ? hhmm(odds.recordedAt) : '');
  const horizon = fd(odds.horizonEnd);
  const briefT = m.brief?.generated_at ? hhmm(m.brief.generated_at) : null;
  const briefSrc = S.briefSource(m.brief?.conflict_day, briefT);

  const cpBlock = `<section class="blk" id="b-cp">${blockHead(S, S.chokepoints, cpChip, m.stale.chokepoints ? cpAsOf : null)}
    <div class="${m.stale.chokepoints ? 'stale' : ''}">${P ? chokepointTiles(S, cp) : chokepointRows(S, cp)}</div>
    ${P ? `<div class="src">${esc(cpSrc)}</div>` : `<div class="src">${esc(`${cp.sourceCredit} · ${S.asOf(cpAsOf)}. ${secStatus || S.cpNoteShort}`)}</div>`}
  </section>`;
  const chBlock = `<section class="blk" id="b-ch">${blockHead(S, S.whatChanged, briefSrc, m.stale.brief ? `Day ${m.brief?.conflict_day}` : null)}
    <div class="${m.stale.brief ? 'stale' : ''}">${changesList(S, m.changes, fd)}</div>
  </section>`;
  const odBlock = `<section class="blk" id="b-od">${blockHead(S, S.odds(horizon), P ? oddsAsOf : '', m.stale.scenarios ? oddsAsOf : null)}
    <div class="${m.stale.scenarios ? 'stale' : ''}">${oddsStrip(S, odds, m.layout, m.lang)}${P ? `<div class="onote">${esc(S.oddsNote)}</div>${eLine(S, odds, m.lang)}` : ''}</div>
    <div class="src">${esc(P ? oddsSrc : S.oddsSrcShort(odds.venues.join(', '), odds.day))}</div>
  </section>`;

  const body = P
    ? `${header(S, m)}${cpBlock}${chBlock}${odBlock}${footer(S, m)}`
    : `${header(S, m)}<div class="cols"><div>${cpBlock}</div><div>${odBlock}</div></div>
       <div class="foot"><span><span class="ed">${esc(m.reviewed ? S.reviewed : S.automated)}</span> &nbsp;${esc(S.changesTeaser(m.changes.length, m.brief?.conflict_day))}</span><span class="times">${esc(m.siteUrl)}</span></div>`;

  return `<!doctype html><html lang="${m.lang}" dir="${S.dir}"><head><meta charset="utf-8"><title>MENA Intel Desk daily card</title>
<style>${fontFaces(m.fontDir)}${css(m.layout, m.lang)}</style></head>
<body><main id="card" data-layout="${m.layout}">${body}${m.watermark ? `<div class="wmbox" aria-hidden="true"><div class="wm">${esc(m.watermark)}</div></div>` : ''}</main></body></html>`;
}
