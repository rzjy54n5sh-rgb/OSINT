/**
 * Country report narrative — the ONLY `country_reports.content_json` keys the UI reads.
 *
 * The Claude daily build maintains exactly these keys (see the Day 222 rows): assessment,
 * key_risks, stabilizers, sources, data_integrity_note, generated_at. Everything else in the JSON
 * (legacy `nai`, per-country `scenarios`, `social_summary`, `elite_network`, `pipeline_version`, old
 * prose) is Day 1-35 material from retired pipelines and is DROPPED here, on the server, so it can
 * never reach the client or read as current. The War Posture score comes from `nai_scores_v2`,
 * never from this JSON or from `country_reports.nai_score`.
 */

export const NARRATIVE_KEYS = [
  'assessment',
  'key_risks',
  'stabilizers',
  'sources',
  'data_integrity_note',
  'generated_at',
] as const;

export interface NarrativeSource {
  name: string;
  url: string;
  published_at: string | null;
}

export interface CountryNarrative {
  assessment: string | null;
  key_risks: string[];
  stabilizers: string[];
  sources: NarrativeSource[];
  data_integrity_note: string | null;
  generated_at: string | null;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '') : [];

function sourceList(v: unknown): NarrativeSource[] {
  if (!Array.isArray(v)) return [];
  const out: NarrativeSource[] = [];
  for (const s of v) {
    if (!s || typeof s !== 'object') continue;
    const o = s as Record<string, unknown>;
    const url = str(o.url);
    if (!url || !/^https?:\/\//i.test(url)) continue; // a source without a real link is not shown
    out.push({ url, name: str(o.name) ?? new URL(url).hostname, published_at: str(o.published_at) });
  }
  return out;
}

/** Whitelist parse. Returns null when no maintained key carries content. */
export function parseNarrative(content: unknown): CountryNarrative | null {
  if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
  const c = content as Record<string, unknown>;
  const n: CountryNarrative = {
    assessment: str(c.assessment),
    key_risks: strList(c.key_risks),
    stabilizers: strList(c.stabilizers),
    sources: sourceList(c.sources),
    data_integrity_note: str(c.data_integrity_note),
    generated_at: str(c.generated_at),
  };
  const empty =
    !n.assessment && n.key_risks.length === 0 && n.stabilizers.length === 0 && n.sources.length === 0 && !n.data_integrity_note;
  return empty ? null : n;
}
