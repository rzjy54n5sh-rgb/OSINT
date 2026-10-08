import { SITE_DESCRIPTION, SITE_NAME, SITE_URL } from '@/lib/site';
import { briefPath, latestBriefs } from '@/lib/seo-feed';
import { decodeHtmlEntities } from '@/lib/html-entities';

/**
 * RSS 2.0 feed of the latest 30 briefs (title, link, guid, pubDate = generated_at,
 * description = lead as plain text). ISR: regenerated at most every 15 minutes, so feed readers
 * never hit Supabase per request.
 */
export const revalidate = 900;

const FEED_SIZE = 30;

const TYPE_TITLES: Record<string, string> = {
  general: 'General Intelligence Brief',
  general_weekly: 'Weekly General Digest',
  horn: 'Horn of Africa & Red Sea Brief',
  egypt: 'Egypt Country Brief',
  uae: 'UAE Country Brief',
  eschatology: 'Eschatology & Geopolitics Brief',
  business: 'Business Opportunities Brief',
};

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Drops characters that are illegal in XML 1.0 (control chars other than tab/LF/CR). */
function xmlSafe(s: string): string {
  // eslint-disable-next-line no-control-regex
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '');
}

/**
 * RSS 2.0 <description> is entity-encoded HTML: readers decode it once and render the result as HTML.
 * Plain text must therefore be HTML-escaped before it is XML-escaped, or a decoded `<img onerror=...>`
 * in a lead would reach the reader as live markup.
 */
function htmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function plainText(html: string | null | undefined): string {
  if (!html) return '';
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

export async function GET(): Promise<Response> {
  const briefs = await latestBriefs(FEED_SIZE);
  const lastBuild = briefs[0]?.generated_at ? new Date(briefs[0].generated_at) : new Date();

  const items = briefs
    .map((b) => {
      const link = `${SITE_URL}${briefPath(b)}`;
      const fallbackTitle = `Day ${b.conflict_day} ${TYPE_TITLES[b.report_type] ?? b.report_type}`;
      const title = plainText(b.title) || fallbackTitle;
      const description = plainText(b.lead);
      const pubDate = b.generated_at ? new Date(b.generated_at).toUTCString() : '';
      return [
        '    <item>',
        `      <title>${xmlEscape(xmlSafe(title))}</title>`,
        `      <link>${xmlEscape(link)}</link>`,
        `      <guid isPermaLink="true">${xmlEscape(link)}</guid>`,
        pubDate ? `      <pubDate>${pubDate}</pubDate>` : '',
        `      <category>${xmlEscape(b.report_type)}</category>`,
        `      <description>${xmlEscape(htmlEscape(xmlSafe(description)))}</description>`,
        '    </item>',
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n');

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    `    <title>${xmlEscape(`${SITE_NAME} — latest briefs`)}</title>`,
    `    <link>${xmlEscape(`${SITE_URL}/briefings`)}</link>`,
    `    <atom:link href="${xmlEscape(`${SITE_URL}/rss.xml`)}" rel="self" type="application/rss+xml" />`,
    `    <description>${xmlEscape(SITE_DESCRIPTION)}</description>`,
    '    <language>en</language>',
    `    <lastBuildDate>${lastBuild.toUTCString()}</lastBuildDate>`,
    '    <ttl>15</ttl>',
    items,
    '  </channel>',
    '</rss>',
    '',
  ]
    .filter((l) => l !== '')
    .join('\n');

  return new Response(xml + '\n', {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
