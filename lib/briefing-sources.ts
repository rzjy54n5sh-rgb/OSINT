/**
 * Citation helpers for briefing paragraphs.
 * Source shape stored at sections[].subsections[].paragraphs[].sources[]:
 *   { name, url, published_at, tier, party_source }
 * Legacy briefs (before Day 221) have no `sources`; every helper tolerates that.
 */

/** Normalised citation: every field is already type-checked (stored JSON is untrusted). */
export interface ParagraphSource {
  name: string | null;
  url: string | null;
  published_at: string | null;
  tier: number | null;
  party_source: boolean;
}

export interface BriefSource {
  /** 1-based number shown next to every citation of this source in the brief. */
  n: number;
  key: string;
  name: string;
  url: string | null;
  published_at: string | null;
  tier: number | null;
  party_source: boolean;
  /** number of paragraphs citing it */
  cited: number;
}

/** Only http(s) URLs become links (blocks javascript:/data: from stored content). */
export function safeHttpUrl(u: unknown): string | null {
  if (!u || typeof u !== 'string') return null;
  try {
    const p = new URL(u.trim());
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.toString() : null;
  } catch {
    return null;
  }
}

/** Dedup key: scheme+host are case-insensitive (URL parser lowercases them); the path/query keep their case. */
function sourceKey(s: ParagraphSource): string | null {
  const url = safeHttpUrl(s.url);
  if (url) {
    const u = new URL(url);
    u.hash = '';
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  }
  const name = (s.name ?? '').trim().toLowerCase();
  return name ? `name:${name}` : null;
}

interface SectionLike {
  subsections?: ({ paragraphs?: ({ sources?: unknown } | null)[] | null } | null)[] | null;
}

/** Normalise a paragraph's `sources` (missing / null / not-an-array / junk entries -> []). */
export function paragraphSources(raw: unknown): ParagraphSource[] {
  if (!Array.isArray(raw)) return [];
  const out: ParagraphSource[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const r = x as Record<string, unknown>;
    out.push({
      name: typeof r.name === 'string' ? r.name : null,
      url: typeof r.url === 'string' ? r.url : null,
      published_at: typeof r.published_at === 'string' ? r.published_at : null,
      tier: typeof r.tier === 'number' && Number.isFinite(r.tier) ? r.tier : null,
      party_source: r.party_source === true,
    });
  }
  return out;
}

/** Per-brief deduplicated (by URL) source list, numbered in order of first citation. */
export function collectBriefSources(sections: SectionLike[] | null | undefined): {
  list: BriefSource[];
  indexByKey: Map<string, BriefSource>;
} {
  const indexByKey = new Map<string, BriefSource>();
  const list: BriefSource[] = [];
  for (const sec of Array.isArray(sections) ? sections : []) {
    for (const sub of Array.isArray(sec?.subsections) ? sec.subsections : []) {
      for (const para of Array.isArray(sub?.paragraphs) ? sub.paragraphs : []) {
        if (!para) continue;
        const seenInPara = new Set<string>();
        for (const s of paragraphSources(para.sources)) {
          const key = sourceKey(s);
          if (!key) continue;
          let entry = indexByKey.get(key);
          if (!entry) {
            entry = {
              n: list.length + 1,
              key,
              name: (s.name ?? '').trim() || hostOf(s.url) || 'Unnamed source',
              url: safeHttpUrl(s.url),
              published_at: s.published_at,
              tier: s.tier,
              party_source: s.party_source,
              cited: 0,
            };
            indexByKey.set(key, entry);
            list.push(entry);
          } else if (s.party_source) {
            entry.party_source = true;
          }
          if (!seenInPara.has(key)) {
            entry.cited += 1;
            seenInPara.add(key);
          }
        }
      }
    }
  }
  return { list, indexByKey };
}

export function sourceLookupKey(s: ParagraphSource): string | null {
  return sourceKey(s);
}

export function hostOf(u: unknown): string {
  const safe = safeHttpUrl(u);
  if (!safe) return '';
  try {
    return new URL(safe).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

const PERSPECTIVE_TEXT: Record<string, string> = {
  us_israel: 'US / ISRAEL VIEW',
  iran_irgc: 'IRAN / IRGC VIEW',
  gulf: 'GULF STATES VIEW',
  resistance: 'RESISTANCE AXIS VIEW',
  neutral: 'NEUTRAL / INDEPENDENT',
  both: 'ALL PARTIES',
};

/** Readable label for a paragraph `perspective` tag; unknown values are humanised, never dropped. */
export function perspectiveLabel(p: string | null | undefined): string | null {
  if (!p || typeof p !== 'string') return null;
  const k = p.trim().toLowerCase();
  if (!k) return null;
  return PERSPECTIVE_TEXT[k] ?? `${k.replace(/[_-]+/g, ' ').toUpperCase()} VIEW`;
}
