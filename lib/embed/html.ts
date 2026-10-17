/**
 * Shared shell for the /embed/* widgets (iframes for media and partners). Each widget is a route handler
 * returning a tiny standalone HTML document: no site chrome, no scripts, no web fonts, no cookies, no
 * analytics, the v2 light theme (System artboard: "light for reading, print and embeds"), and an attribution footer linking the
 * full page on the site. Framing headers are set by middleware.ts (lib/security-headers.ts isEmbedPath),
 * not here: on OpenNext, middleware headers win over route headers.
 *
 * Pure string building (server- and test-safe). Every interpolated value goes through esc().
 */
import { SITE_NAME, SITE_URL } from '@/lib/site';
import { STATUS_COLORS, SURFACE_COLORS } from '@/lib/design-tokens';

/**
 * Same TTL as the root layout cap (app/layout.tsx `revalidate = 900`): Workers Cache keeps a widget for
 * 15 minutes; the SWR part mirrors what Next emits for ISR pages (expireTime 86400 - 900). Browsers keep it
 * 5 minutes so a partner page that is reloaded does not refetch every time.
 */
export const EMBED_REVALIDATE_SECONDS = 900;
export const EMBED_CACHE_CONTROL = `public, max-age=300, s-maxage=${EMBED_REVALIDATE_SECONDS}, stale-while-revalidate=${86400 - EMBED_REVALIDATE_SECONDS}`;
/** Error / not-found answers: cached briefly so a transient Supabase failure is not pinned for 15 minutes. */
export const EMBED_ERROR_CACHE_CONTROL = 'public, max-age=60, s-maxage=60';

export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Absolute URL on the site for a path ("/nai" -> "https://…/nai"). */
export function siteHref(pathname: string): string {
  return `${SITE_URL}${pathname.startsWith('/') ? pathname : `/${pathname}`}`;
}

/** Only http(s) links are ever printed as href. */
export function safeHref(url: unknown): string | null {
  return typeof url === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(url) ? url : null;
}

/** "8 Oct 2026" from an ISO timestamp / date (UTC). */
export function fmtDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const t = Date.parse(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** External link opened outside the iframe. */
export function extLink(href: string, text: string, cls = ''): string {
  return `<a href="${esc(href)}" target="_blank" rel="noopener"${cls ? ` class="${esc(cls)}"` : ''}>${esc(text)}</a>`;
}

/**
 * The widget runs inside a third-party page without app/globals.css, so it carries its own CSS variables.
 * Their values come from lib/design-tokens.ts (the TS mirror tokens.check.ts keeps equal to globals.css),
 * never from a colour literal here (light-theme.check.ts). Embeds are light (System artboard).
 */
const INK = SURFACE_COLORS.light;
const LANE = STATUS_COLORS.light;
const VARS =
  `:root{color-scheme:light;--bg:${INK.bg};--fg:${INK.text};--muted:${INK.muted};--line:${INK.line};` +
  `--accent:${INK.accent};--chip:${INK.surface};--normal:${LANE.NORMAL[0]};--elevated:${LANE.ELEVATED[0]};` +
  `--disrupted:${LANE.DISRUPTED[0]};--closed:${LANE.CLOSED[0]}}`;

const CSS = `
${VARS}
*{box-sizing:border-box}
html,body{margin:0;padding:0;background:var(--bg);color:var(--fg)}
body{font:14px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;padding:14px 16px 10px}
a{color:inherit}
.k{font:600 10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.12em;text-transform:uppercase;color:var(--accent);margin:0 0 6px}
h1{font-size:16px;line-height:1.3;margin:0 0 10px;font-weight:650}
.meta{font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;color:var(--muted);margin:0 0 10px}
.note{font-size:12px;color:var(--muted);margin:8px 0 0}
.stale-banner{display:inline-block;font:600 11px/1.3 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;border:1px dashed var(--muted);color:var(--muted);padding:3px 7px;margin:0 0 10px;text-transform:uppercase;letter-spacing:.06em}
.stale .data{filter:grayscale(1);opacity:.55}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:7px 6px;border-top:1px solid var(--line);vertical-align:top}
th{font:600 10.5px/1.2 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);border-top:0}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.sub{display:block;font-size:11.5px;color:var(--muted)}
.st{font:700 11px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;white-space:nowrap}
.st-NORMAL{color:var(--normal)}.st-ELEVATED{color:var(--elevated)}.st-DISRUPTED{color:var(--disrupted)}.st-CLOSED{color:var(--closed)}
.wh{color:var(--muted);font-style:italic}
ul.b{margin:0;padding:0;list-style:none}
ul.b li{padding:8px 0;border-top:1px solid var(--line)}
ul.b .src{display:block;font-size:11.5px;color:var(--muted);margin-top:2px}
footer{margin-top:12px;padding-top:8px;border-top:1px solid var(--line);font-size:11.5px;color:var(--muted);display:flex;flex-wrap:wrap;gap:4px 12px;justify-content:space-between}
footer a{color:var(--fg);font-weight:600}
`;

export interface EmbedPageInput {
  /** <title> and screen-reader name. */
  title: string;
  /** Inner HTML (already escaped by the caller's renderer). */
  body: string;
  /** Path of the full page on the site, e.g. "/nai". */
  fullPath: string;
  /** Link text for the full page, e.g. "War Posture board". */
  fullLabel: string;
  /** Credit line(s) printed in the footer, plain text. */
  credit?: string | null;
  /** Grey the data and show the banner (stale block). */
  stale?: boolean;
}

/** Full HTML document of a widget. */
export function embedPage({ title, body, fullPath, fullLabel, credit, stale }: EmbedPageInput): string {
  const full = siteHref(fullPath);
  return (
    '<!doctype html>\n' +
    '<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width,initial-scale=1">' +
    '<meta name="robots" content="noindex">' +
    '<meta name="referrer" content="strict-origin-when-cross-origin">' +
    `<title>${esc(title)} — ${esc(SITE_NAME)}</title>` +
    `<link rel="canonical" href="${esc(full)}">` +
    `<style>${CSS}</style></head>` +
    `<body${stale ? ' class="stale"' : ''}>` +
    body +
    '<footer>' +
    `<span>${esc(SITE_NAME)} — ${extLink(full, fullLabel)}</span>` +
    (credit ? `<span>${esc(credit)}</span>` : '') +
    '</footer></body></html>'
  );
}

/** HTML response with the widget cache policy (framing headers come from middleware). */
export function embedResponse(html: string, { status = 200, cacheControl }: { status?: number; cacheControl?: string } = {}): Response {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cacheControl ?? (status === 200 ? EMBED_CACHE_CONTROL : EMBED_ERROR_CACHE_CONTROL),
    },
  });
}

/** Minimal widget for a bad parameter / unavailable data (same shell, no data). */
export function embedMessagePage(title: string, message: string, fullPath: string, fullLabel: string): string {
  return embedPage({ title, fullPath, fullLabel, body: `<p class="k">${esc(title)}</p><p class="note">${esc(message)}</p>` });
}
