import type { ReactNode } from 'react';
import { hostOf, paragraphSources, perspectiveLabel, sourceLookupKey, type BriefSource } from '@/lib/briefing-sources';
import type { PartyFlag } from '@/lib/outlet-lookup';
import s from './brief.module.css';

/** Global .chip-* classes (app/globals.css, "SHARED CHIPS"), as used by components/ui/TrustChip. */
const chip = { trust: 'chip-trust', num: 'chip-num', meta: 'chip-meta', party: 'chip-party' } as const;

export interface BriefParagraph {
  text?: unknown;
  perspective?: unknown;
  sources?: unknown;
}
export interface BriefSubsection {
  id?: unknown;
  heading?: unknown;
  paragraphs?: (BriefParagraph | null)[] | null;
}
export interface BriefSection {
  id?: unknown;
  heading?: unknown;
  type?: unknown;
  subsections?: (BriefSubsection | null)[] | null;
}

/** A brief source with its render-time party flag (R1). */
export type ShownSource = BriefSource & { flag: PartyFlag };

const str = (x: unknown): string => (typeof x === 'string' ? x.trim() : '');
const arr = <T,>(x: T[] | null | undefined): T[] => (Array.isArray(x) ? x : []);

/** Stable, unique, URL-safe anchors for the sections (stored ids are untrusted). */
export function sectionAnchors(sections: BriefSection[]): string[] {
  const used = new Set<string>(['sources', 'key-figures']);
  return sections.map((sec, i) => {
    const base = `s-${str(sec?.id).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || i + 1}`;
    let id = base;
    for (let k = 2; used.has(id); k++) id = `${base}-${k}`;
    used.add(id);
    return id;
  });
}

/** Eyebrow = section heading, H2 = first subsection heading (R11: later subsections are H3s, in order). */
export function sectionHeads(sec: BriefSection): { eyebrow: string | null; h2: string } {
  const heading = str(sec?.heading);
  const first = str(arr(sec?.subsections)[0]?.heading);
  if (!first) return { eyebrow: null, h2: heading || 'Section' };
  if (!heading || heading.toLowerCase() === first.toLowerCase()) return { eyebrow: null, h2: first };
  return { eyebrow: heading, h2: first };
}

function PerspectiveTag({ label }: { label: string }) {
  return (
    <span className={s.persp}>
      <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true" focusable="false">
        <path d="M1 6s2-3.5 5-3.5S11 6 11 6 9 9.5 6 9.5 1 6 1 6Z" fill="none" stroke="currentColor" strokeWidth="1.2" />
        <circle cx="6" cy="6" r="1.5" fill="currentColor" />
      </svg>
      PERSPECTIVE · {label}
    </span>
  );
}

export function SourceChip({ src }: { src: ShownSource }) {
  const body = (
    <span className={chip.trust} data-kind="source">
      <span className={`${chip.num} ${chip.meta}`}>
        <span className={s.srOnly}>Source </span>
        {src.n}
      </span>
      <span className={s.chipName}>{src.name}</span>
      {src.tier != null ? (
        <span className={`${chip.num} ${chip.meta}`}>
          <span className={s.srOnly}>, tier </span>
          <span aria-hidden="true">T</span>
          {src.tier}
        </span>
      ) : null}
      {src.flag.label ? <span className={chip.party}>{src.flag.label}</span> : null}
    </span>
  );
  return src.url ? (
    <a className={s.chipLink} href={src.url} target="_blank" rel="noopener noreferrer">
      {body}
    </a>
  ) : (
    body
  );
}

function Paragraph({ para, byKey }: { para: BriefParagraph; byKey: Map<string, ShownSource> }) {
  const text = typeof para.text === 'string' ? para.text : '';
  const persp = typeof para.perspective === 'string' && para.perspective.trim().toLowerCase() !== 'neutral' ? perspectiveLabel(para.perspective) : null;
  const seen = new Set<string>();
  const cited: ShownSource[] = [];
  for (const raw of paragraphSources(para.sources)) {
    const key = sourceLookupKey(raw);
    const entry = key ? byKey.get(key) : undefined;
    if (entry && !seen.has(entry.key)) {
      seen.add(entry.key);
      cited.push(entry);
    }
  }
  if (!text && !cited.length) return null;
  return (
    <div className={s.para}>
      {persp ? <PerspectiveTag label={persp} /> : null}
      {text ? <p className={s.text}>{text}</p> : null}
      {cited.length ? (
        <ul className={s.chips} aria-label="Sources for this paragraph">
          {cited.map((c) => (
            <li key={c.key}>
              <SourceChip src={c} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function BriefSectionView({
  sec,
  anchor,
  byKey,
  figure,
}: {
  sec: BriefSection;
  anchor: string;
  byKey: Map<string, ShownSource>;
  figure?: ReactNode;
}) {
  const { eyebrow, h2 } = sectionHeads(sec);
  const subs = arr(sec?.subsections).filter((x): x is BriefSubsection => !!x && typeof x === 'object');
  return (
    <section id={anchor} data-toc-target="" aria-labelledby={`${anchor}-h`} className={s.section}>
      <div className={s.sectionHead}>
        {eyebrow ? <p className={s.eyebrow}>{eyebrow}</p> : null}
        <h2 id={`${anchor}-h`} className={s.h2}>
          {h2}
        </h2>
      </div>
      {figure}
      {subs.map((sub, i) => (
        <div key={`${str(sub.id)}-${i}`} className={s.sub}>
          {i > 0 && str(sub.heading) ? <h3 className={s.h3}>{str(sub.heading)}</h3> : null}
          {arr(sub.paragraphs).map((p, j) => (p && typeof p === 'object' ? <Paragraph key={j} para={p} byKey={byKey} /> : null))}
        </div>
      ))}
    </section>
  );
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function shortDate(iso: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? `${iso}T00:00:00Z` : iso);
  if (Number.isNaN(t)) return null;
  const d = new Date(t);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** R6: rendered only when the brief has linked sources (no empty heading). */
export function SourcesList({ sources }: { sources: ShownSource[] }) {
  return (
    <section id="sources" data-toc-target="" aria-labelledby="sources-h" className={s.sources}>
      <h2 id="sources-h" className={s.sourcesH}>
        Sources ({sources.length})
      </h2>
      <p className={s.note}>
        Sources flagged State-aligned, Party or Party source report a party&apos;s own position and are not independent
        verification.
      </p>
      <ol className={s.srcList}>
        {sources.map((src) => {
          const date = shortDate(src.published_at);
          const host = src.url ? hostOf(src.url) : '';
          return (
            <li key={src.key} id={`src-${src.n}`} className={s.srcRow}>
              <span className={`${s.num} ${s.muted}`}>{src.n}</span>
              <span className={s.srcName}>
                {src.url ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer">
                    {src.name}
                  </a>
                ) : (
                  src.name
                )}{' '}
                {host ? <span className={s.muted}>{host}</span> : null}{' '}
                {src.flag.label ? <span className={chip.party}>{src.flag.label}</span> : null}
              </span>
              <span className={`${s.num} ${s.srcMeta}`}>
                {src.tier != null ? `T${src.tier} · ` : ''}
                {date ? `${date} · ` : ''}
                <span aria-hidden="true">{src.cited} ¶</span>
                <span className={s.srOnly}>
                  cited in {src.cited} paragraph{src.cited === 1 ? '' : 's'}
                </span>
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
