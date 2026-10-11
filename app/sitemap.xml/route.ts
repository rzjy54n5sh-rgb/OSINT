import { SITE_URL } from '@/lib/site';
import { TRACKED_COUNTRY_CODES } from '@/lib/countries';
import { currentConflictDay } from '@/lib/conflict-calendar';
import { briefPath, briefsSinceDay } from '@/lib/seo-feed';

/**
 * /sitemap.xml as a route handler rather than app/sitemap.ts: Next serves metadata-route
 * sitemaps with `Cache-Control: public, max-age=0, must-revalidate`, which the edge cache never
 * stores, and OpenNext here has no incremental cache — so every crawler hit would re-query
 * Supabase. A route handler with `revalidate` is served with `s-maxage=900` and is cached at the
 * edge like the ISR pages (same as /rss.xml).
 */
export const revalidate = 900;

type ChangeFreq = 'hourly' | 'daily' | 'weekly' | 'monthly';

/** Public, indexable routes (auth, account and utility pages are excluded and marked noindex). */
const STATIC_ROUTES: { path: string; changefreq: ChangeFreq; priority: number }[] = [
  { path: '/', changefreq: 'hourly', priority: 1 },
  { path: '/briefings', changefreq: 'daily', priority: 0.9 },
  { path: '/warroom', changefreq: 'hourly', priority: 0.8 },
  { path: '/nai', changefreq: 'daily', priority: 0.8 },
  { path: '/scenarios', changefreq: 'daily', priority: 0.8 },
  { path: '/countries', changefreq: 'daily', priority: 0.8 },
  { path: '/markets', changefreq: 'hourly', priority: 0.7 },
  { path: '/feed', changefreq: 'hourly', priority: 0.7 },
  { path: '/disinfo', changefreq: 'daily', priority: 0.6 },
  { path: '/social', changefreq: 'daily', priority: 0.5 },
  { path: '/mediaroom', changefreq: 'daily', priority: 0.5 },
  { path: '/analytics', changefreq: 'daily', priority: 0.5 },
  { path: '/timeline', changefreq: 'daily', priority: 0.6 },
  { path: '/pricing', changefreq: 'weekly', priority: 0.7 },
  { path: '/methodology', changefreq: 'weekly', priority: 0.6 },
  { path: '/sources', changefreq: 'weekly', priority: 0.5 },
  { path: '/api-docs', changefreq: 'monthly', priority: 0.4 },
  { path: '/contact', changefreq: 'monthly', priority: 0.5 },
];

/** Briefs from the last 30 conflict days. */
const BRIEF_WINDOW_DAYS = 30;

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function urlEntry(loc: string, opts: { lastmod?: string | null; changefreq: ChangeFreq; priority: number }): string {
  const lastmod = opts.lastmod ? new Date(opts.lastmod) : null;
  return [
    '  <url>',
    `    <loc>${xmlEscape(loc)}</loc>`,
    lastmod && !Number.isNaN(lastmod.getTime()) ? `    <lastmod>${lastmod.toISOString()}</lastmod>` : '',
    `    <changefreq>${opts.changefreq}</changefreq>`,
    `    <priority>${opts.priority.toFixed(1)}</priority>`,
    '  </url>',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function GET(): Promise<Response> {
  const now = new Date();
  const entries: string[] = STATIC_ROUTES.map(({ path, changefreq, priority }) =>
    urlEntry(`${SITE_URL}${path === '/' ? '' : path}`, { changefreq, priority }),
  );

  for (const code of TRACKED_COUNTRY_CODES) {
    entries.push(urlEntry(`${SITE_URL}/countries/${code.toLowerCase()}`, { changefreq: 'daily', priority: 0.6 }));
  }

  // DAY LOCK: the window is anchored on the calendar day, never on a table's max day.
  const fromDay = Math.max(1, currentConflictDay(now) - (BRIEF_WINDOW_DAYS - 1));
  for (const b of await briefsSinceDay(fromDay)) {
    entries.push(
      urlEntry(`${SITE_URL}${briefPath(b)}`, {
        lastmod: b.generated_at,
        changefreq: 'monthly',
        priority: b.report_type === 'general' ? 0.7 : 0.5,
      }),
    );
  }

  const xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    '\n</urlset>\n';

  return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
}
