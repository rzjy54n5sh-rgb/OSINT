/**
 * /embed/brief/latest?type=<code> — headline of the latest brief of a type + its first 3 sourced bullets +
 * a link to the brief. The row is read by lib/seo-feed.ts latestBriefOfType(); this module is pure.
 *
 * Bullet rule (deterministic, nothing paraphrased or generated):
 *   - the brief's "list" sections, in order (the overnight brief's ranked "Changes" list); a brief without a
 *     list section uses the first sourced paragraph of each subsection instead, in brief order;
 *   - a paragraph qualifies only with >= 1 source carrying an outlet name and an http(s) URL, and with no
 *     licence-AVOID outlet or figure in its sources or text (scripts/card/lib/model.mjs isAvoid, the card's list);
 *   - the bullet is the paragraph's first sentence, verbatim (model.mjs firstSentence), with the outlet linked:
 *     the first non-party source, else the first source, flagged as party/state.
 * Staleness: the card's brief age limit (gates.mjs MAX_AGE_DAYS.brief, whole UTC days from the brief's
 * conflict day) greys the widget with "Not updated since <date>".
 */
import { MAX_AGE_DAYS } from '@/scripts/card/lib/gates.mjs';
import { ageDays, dateOfDay, firstSentence, isAvoid, isHttpUrl, isPartyOutlet } from '@/scripts/card/lib/model.mjs';
import { briefTitle } from '@/lib/brief-types';
import { embedPage, esc, extLink, fmtDate, safeHref } from '@/lib/embed/html';

export interface BriefRowLike {
  conflict_day: number;
  report_type: string;
  title?: string | null;
  lead?: string | null;
  quality?: string | null;
  generated_at?: string | null;
  sections?: unknown;
}

export interface BriefBullet {
  text: string;
  outlet: string;
  url: string;
  partySource: boolean;
}

export interface BriefEmbed {
  state: 'ok' | 'stale' | 'empty';
  type: string;
  typeTitle: string;
  day: number | null;
  /** UTC date of the conflict day, YYYY-MM-DD. */
  date: string | null;
  title: string | null;
  /** Site path of the full brief (or /briefings when there is none). */
  path: string;
  bullets: BriefBullet[];
  quality: string | null;
  staleNote: string | null;
}

export const MAX_BULLETS = 3;
const MIN_LINE = 12;

type Para = { text?: unknown; sources?: unknown };
type Sub = { paragraphs?: unknown };
type Sec = { type?: unknown; subsections?: unknown };
type Src = { name?: unknown; url?: unknown; party_source?: unknown };

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

function bulletFrom(p: Para): BriefBullet | null {
  const all = arr<Src>(p.sources).filter((s) => s && typeof s === 'object');
  const srcs = all.filter((s) => typeof s.name === 'string' && s.name.trim() && isHttpUrl(s.url));
  if (!srcs.length) return null;
  if (all.some((s) => isAvoid(`${s.name ?? ''} ${s.url ?? ''}`))) return null;
  const text = typeof p.text === 'string' ? p.text : '';
  if (isAvoid(text)) return null;
  const line = firstSentence(text);
  if (line.trim().length < MIN_LINE) return null;
  const src = srcs.find((s) => !isPartyOutlet(s)) ?? srcs[0];
  return { text: line, outlet: String(src.name).trim(), url: String(src.url), partySource: isPartyOutlet(src) };
}

/** First `max` qualifying bullets of a brief's sections (rule in the header). */
export function briefBullets(sections: unknown, max = MAX_BULLETS): BriefBullet[] {
  const secs = arr<Sec>(sections).filter((s) => s && typeof s === 'object');
  const lists = secs.filter((s) => s.type === 'list');
  const out: BriefBullet[] = [];
  if (lists.length) {
    for (const s of lists) {
      for (const ss of arr<Sub>(s.subsections)) {
        for (const p of arr<Para>(ss?.paragraphs)) {
          if (out.length >= max) return out;
          const b = p && bulletFrom(p);
          if (b) out.push(b);
        }
      }
    }
    return out;
  }
  for (const s of secs) {
    for (const ss of arr<Sub>(s.subsections)) {
      if (out.length >= max) return out;
      for (const p of arr<Para>(ss?.paragraphs)) {
        const b = p && bulletFrom(p);
        if (b) {
          out.push(b);
          break; // one per subsection
        }
      }
    }
  }
  return out;
}

export function briefEmbedView(row: BriefRowLike | null, type: string, now: Date): BriefEmbed {
  const typeTitle = briefTitle(type);
  if (!row || !Number.isInteger(row.conflict_day)) {
    return { state: 'empty', type, typeTitle, day: null, date: null, title: null, path: '/briefings', bullets: [], quality: null, staleNote: null };
  }
  const day = row.conflict_day;
  const date = dateOfDay(day).toISOString().slice(0, 10);
  const stale = ageDays(dateOfDay(day), now) > MAX_AGE_DAYS.brief;
  const title = typeof row.title === 'string' && row.title.trim() ? row.title.trim() : null;
  return {
    state: stale ? 'stale' : 'ok',
    type,
    typeTitle,
    day,
    date,
    title,
    path: `/briefings/${day}/${type}`,
    bullets: briefBullets(row.sections),
    quality: typeof row.quality === 'string' ? row.quality : null,
    staleNote: stale ? `Not updated since ${fmtDate(date)}` : null,
  };
}

const QUALITY_TEXT: Record<string, string> = { auto: 'Auto-generated', reconstructed: 'Reconstructed' };

/** Full widget document. */
export function renderBriefEmbed(v: BriefEmbed): string {
  const kicker = `<p class="k">${esc(v.typeTitle)}${v.day != null ? ` · Day ${esc(v.day)}` : ''}</p>`;
  if (v.state === 'empty') {
    return embedPage({
      title: v.typeTitle,
      fullPath: v.path,
      fullLabel: 'All briefs',
      body: `${kicker}<p class="note">No ${esc(v.typeTitle)} has been published yet.</p>`,
    });
  }
  const bullets = v.bullets.length
    ? '<ul class="b">' +
      v.bullets
        .map((b) => {
          const href = safeHref(b.url);
          const outlet = href ? extLink(href, b.outlet) : esc(b.outlet);
          return `<li>${esc(b.text)}<span class="src">${outlet}${b.partySource ? ' (party/state source)' : ''}</span></li>`;
        })
        .join('') +
      '</ul>'
    : '<p class="note">No item in this brief carries a linked source; read the full brief.</p>';
  const quality = v.quality && v.quality !== 'full' ? ` · ${esc(QUALITY_TEXT[v.quality] ?? v.quality)}` : '';
  const body =
    kicker +
    (v.staleNote ? `<p class="stale-banner">${esc(v.staleNote)}</p>` : '') +
    '<div class="data">' +
    `<h1>${esc(v.title ?? `Day ${v.day} ${v.typeTitle}`)}</h1>` +
    `<p class="meta">${esc(fmtDate(v.date) ?? '')}${quality}</p>` +
    bullets +
    '</div>';
  return embedPage({ title: v.typeTitle, body, fullPath: v.path, fullLabel: 'Read the full brief', stale: v.state === 'stale' });
}
