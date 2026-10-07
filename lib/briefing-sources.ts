/**
 * Citation helpers for briefing paragraphs.
 * Source shape stored at sections[].subsections[].paragraphs[].sources[]:
 *   { name, url, published_at, tier, party_source }
 * Legacy briefs (before Day 221) have no `sources`; every helper tolerates that.
 */

export interface ParagraphSource {
  name?: string | null;
  url?: string | null;
  published_at?: string | null;
  tier?: number | null;
  party_source?: boolean | null;
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
export function safeHttpUrl(u: string | null | undefined): string | null {
  if (!u || typeof u !== 'string') return null;
  try {
    const p = new URL(u.trim());
    return p.protocol === 'https:' || p.protocol === 'http:' ? p.toString() : null;
  } catch {
    return null;
  }
}

function sourceKey(s: ParagraphSource): string | null {
  const url = safeHttpUrl(s.url);
  if (url) return url.replace(/#.*$/, '').replace(/\/$/, '').toLowerCase();
  const name = (s.name ?? '').trim().toLowerCase();
  return name ? `name:${name}` : null;
}

interface SectionLike {
  subsections?: { paragraphs?: { sources?: unknown }[] }[];
}

/** Normalise a paragraph's `sources` (missing / null / not-an-array / junk entries -> []). */
export function paragraphSources(raw: unknown): ParagraphSource[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is ParagraphSource => !!x && typeof x === 'object');
}

/** Per-brief deduplicated (by URL) source list, numbered in order of first citation. */
export function collectBriefSources(sections: SectionLike[] | null | undefined): {
  list: BriefSource[];
  indexByKey: Map<string, BriefSource>;
} {
  const indexByKey = new Map<string, BriefSource>();
  const list: BriefSource[] = [];
  for (const sec of sections ?? []) {
    for (const sub of sec.subsections ?? []) {
      for (const para of sub.paragraphs ?? []) {
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
              published_at: s.published_at ?? null,
              tier: typeof s.tier === 'number' ? s.tier : null,
              party_source: s.party_source === true,
              cited: 0,
            };
            indexByKey.set(key, entry);
            list.push(entry);
          } else if (s.party_source === true) {
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

export function hostOf(u: string | null | undefined): string {
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
