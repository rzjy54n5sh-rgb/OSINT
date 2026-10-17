import type { Metadata } from 'next';
import { H2, P, List, Li, A } from '@/components/trust/TrustPage';
import { pageMetadata, SITE_URL, SITE_NAME } from '@/lib/site';
import { CONFLICTS_FALLBACK, POSTURE_PANEL_CONFLICT } from '@/lib/posture';
import { BRIEF_TYPES } from '@/lib/brief-types';
import latest from '@/data/chokepoints/latest.json';

/**
 * Snippet page for the /embed/* widgets (copy-paste iframe code, sizes, credit lines). This page is part
 * of the site (site chrome, not frameable); only /embed/<widget> may be framed (middleware.ts).
 */
export const revalidate = 900;

export const metadata: Metadata = pageMetadata({
  title: 'Embed — MENA Intel Desk',
  description: 'Free iframe widgets for newsrooms and partners: chokepoint transits, War Posture by conflict and the latest brief, each with its source credit.',
  path: '/embed',
});

interface Widget {
  id: string;
  name: string;
  path: string;
  title: string;
  width: number;
  height: number;
  what: string;
  credit: string;
}

const WIDGETS: Widget[] = [
  {
    id: 'chokepoints',
    name: 'Chokepoints',
    path: '/embed/chokepoints',
    title: `Chokepoint transits — ${SITE_NAME}`,
    width: 560,
    height: 300,
    what:
      'Suez Canal, Bab al-Mandeb and the Strait of Hormuz: status, traffic as a % of the Jan–Oct 2023 weekly average, weekly transits and the week covered. Greyed with "Not updated since <date>" when the weekly file is overdue.',
    credit: `${latest.source_credit}. Do not resell the raw series.`,
  },
  {
    id: 'posture',
    name: 'War Posture (one conflict)',
    path: `/embed/posture?conflict=${POSTURE_PANEL_CONFLICT}`,
    title: `War Posture — ${SITE_NAME}`,
    width: 560,
    height: 640,
    what:
      'Each tracked government’s stated position on continuing the war (0 = immediate ceasefire, 100 = continue or escalate). Egypt, the UAE and Saudi Arabia: stated positions only, never a grade. Yemen: the recognised government and the Houthi authorities as two separate lines.',
    credit: 'War Posture: MENA Intel Desk; the statements and sources behind every line are on /nai.',
  },
  {
    id: 'brief',
    name: 'Latest brief',
    path: '/embed/brief/latest?type=overnight',
    title: `Overnight Brief — ${SITE_NAME}`,
    width: 560,
    height: 520,
    what:
      'Headline of the latest Overnight Brief and its first three sourced items (the first sentence of each, verbatim, with the outlet linked), plus a link to the full brief.',
    credit: 'Brief: MENA Intel Desk; each item names and links the outlet it rests on.',
  },
];

function snippet(w: Widget): string {
  return (
    `<iframe src="${SITE_URL}${w.path}"\n` +
    `  title="${w.title}"\n` +
    `  width="${w.width}" height="${w.height}" style="border:0;max-width:100%"\n` +
    `  loading="lazy" referrerpolicy="strict-origin-when-cross-origin"\n` +
    `  sandbox="allow-popups allow-popups-to-escape-sandbox"></iframe>`
  );
}

const pre = {
  fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
  fontSize: 12,
  lineHeight: 1.55,
  background: 'var(--surface)',
  border: '1px solid var(--border)',
  padding: '12px 14px',
  overflowX: 'auto' as const,
  whiteSpace: 'pre' as const,
  color: 'var(--text-primary)',
  margin: '8px 0 12px 0',
};

export default function EmbedPage() {
  const currentBriefs = BRIEF_TYPES.filter((t) => t.lineup === 'current');
  return (
    <div className="max-w-3xl mx-auto px-4 py-8" style={{ overflowWrap: 'anywhere' }}>
      <header style={{ marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 8 }}>◆ MENA INTEL DESK — EMBED</div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 38, color: 'var(--text-primary)', letterSpacing: '2px', margin: '0 0 12px 0', lineHeight: 1.05 }}>
          EMBED OUR DATA
        </h1>
        <p style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          Copy a snippet into your page. Each widget is a small, script-free page that uses the light reading theme, sets no
          cookies, runs no analytics and is cached for at most 15 minutes. Its footer links back to the full page on this site.
        </p>
      </header>

      <div style={{ fontFamily: 'DM Sans', fontSize: 15, color: 'var(--text-secondary)', lineHeight: 1.75 }}>
        {WIDGETS.map((w) => (
          <section key={w.id} id={w.id}>
            <H2>{w.name.toUpperCase()}</H2>
            <P>{w.what}</P>
            <pre style={pre}>
              <code>{snippet(w)}</code>
            </pre>
            <P>
              <strong>Size:</strong> {w.width} × {w.height} px (narrows to the column width; longer content scrolls inside the frame). <strong>Credit:</strong> {w.credit}{' '}
              <A href={`${SITE_URL}${w.path}`}>Preview</A>
            </P>
          </section>
        ))}

        <H2 id="options">OPTIONS</H2>
        <List>
          <Li>
            <strong>War Posture conflict</strong> (<code>?conflict=</code>):{' '}
            {CONFLICTS_FALLBACK.map((c, i) => (
              <span key={c.conflict_code}>
                {i > 0 ? '; ' : ''}
                <code>{c.conflict_code}</code> — {c.short_name}
              </span>
            ))}
            .
          </Li>
          <Li>
            <strong>Brief type</strong> (<code>?type=</code>):{' '}
            {currentBriefs.map((t, i) => (
              <span key={t.code}>
                {i > 0 ? '; ' : ''}
                <code>{t.code}</code> — {t.title}
              </span>
            ))}
            .
          </Li>
        </List>

        <H2 id="conditions">CONDITIONS</H2>
        <List>
          <Li>Embed the frame unchanged, with its footer (the credit and the link back) visible.</Li>
          <Li>Every figure keeps its own source credit and as-of date; a widget that is out of date says so itself.</Li>
          <Li>
            Questions or a different size: <A href="/contact">contact the desk</A>.
          </Li>
        </List>
      </div>
    </div>
  );
}
