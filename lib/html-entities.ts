/**
 * Decode HTML entities that leak into feed text (RSS summaries often contain `&nbsp;`, `&amp;`,
 * `&#8217;` ...). React escapes text, so without this the user sees the literal entity.
 * Tags are stripped too; whitespace is collapsed. Safe for SSR (no DOM).
 */
const NAMED: Record<string, string> = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  mdash: '—', ndash: '–', hellip: '…', lsquo: '‘', rsquo: '’',
  ldquo: '“', rdquo: '”', laquo: '«', raquo: '»', bull: '•',
  middot: '·', copy: '©', reg: '®', deg: '°', euro: '€', pound: '£',
};

export function decodeHtmlEntities(input: string | null | undefined): string {
  if (!input) return '';
  const out = String(input)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, g: string) => {
      if (g[0] === '#') {
        const code = g[1].toLowerCase() === 'x' ? parseInt(g.slice(2), 16) : parseInt(g.slice(1), 10);
        if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return m;
        try {
          return String.fromCodePoint(code);
        } catch {
          return m;
        }
      }
      return NAMED[g.toLowerCase()] ?? m;
    });
  return out.replace(/\s+/g, ' ').trim();
}
