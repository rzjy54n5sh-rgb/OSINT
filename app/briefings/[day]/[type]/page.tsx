import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cache } from 'react';
import BriefingReader from './BriefingReader';
import { DESK_NAME, PRE_PUBLICATION_HUMAN_REVIEW } from '@/lib/desk-identity';

/**
 * ISR per (day, type) path, rendered on first request (no build-time params). A brief is written
 * once a day; past days do not change. Not tier-gated today (see GATING note below) — if business
 * briefs become Pro-only, gate them client-side or exclude this route from the shared cache.
 */
export const revalidate = 900;

/** No paths at build time: each path is rendered on its first request, then cached (ISR). */
export async function generateStaticParams() {
  return [];
}

/** Report types that exist (lower-case, case-sensitive in the URL). */
const VALID_TYPES = ['general', 'general_weekly', 'horn', 'egypt', 'uae', 'eschatology', 'business'] as const;

const TYPE_TITLES: Record<string, string> = {
  general: 'General Intelligence Brief',
  general_weekly: 'Weekly General Digest',
  horn: 'Horn of Africa & Red Sea Brief',
  egypt: 'Egypt Country Brief',
  uae: 'UAE Country Brief',
  eschatology: 'Eschatology & Geopolitics Brief',
  business: 'Business Opportunities Brief',
};

interface PageProps {
  params: Promise<{ day: string; type: string }>;
}

/** Strict positive-integer parse: "12abc", "1e2", "-1", "0", " 5" -> null. */
function parseDay(raw: string): number | null {
  if (!/^[1-9]\d{0,3}$/.test(raw)) return null;
  return Number(raw);
}

/**
 * One read per request, shared by generateMetadata and the page (React.cache is request-scoped;
 * the public client is per request too — never a module-level client on Workers).
 */
const getBrief = cache(async (day: number, type: string) => {
  const supabase = createPublicClient();
  return supabase.from('daily_briefings').select('*').eq('conflict_day', day).eq('report_type', type).maybeSingle();
});

/** Collapse whitespace and cut at a word boundary for <meta name="description">. */
function clip(text: string, max = 160): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > 80 ? cut.slice(0, sp) : cut).replace(/[\s,;:.–—-]+$/, '')}…`;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { day: dayStr, type } = await params;
  const day = parseDay(dayStr);
  if (day == null || !(VALID_TYPES as readonly string[]).includes(type)) {
    return { title: 'Briefing not found · MENA Intel Desk' };
  }
  const fallbackTitle = `Day ${day} ${TYPE_TITLES[type]} · ${DESK_NAME}`;
  const fallbackDescription = `${TYPE_TITLES[type]} for conflict day ${day}, with per-paragraph source citations.`;
  try {
    const { data } = await getBrief(day, type);
    if (!data) return { title: fallbackTitle, description: fallbackDescription };
    const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
    const lead = typeof data.lead === 'string' && data.lead.trim() ? data.lead : null;
    return {
      title: title
        ? new RegExp(`\\bDay ${day}\\b`, 'i').test(title)
          ? `${clip(title, 90)} · ${DESK_NAME}`
          : `${clip(title, 90)} · Day ${day} · ${DESK_NAME}`
        : fallbackTitle,
      description: lead ? clip(lead) : fallbackDescription,
      alternates: { canonical: `/briefings/${day}/${type}` },
      openGraph: {
        type: 'article',
        title: title ?? fallbackTitle,
        description: lead ? clip(lead, 200) : fallbackDescription,
        publishedTime: data.generated_at ?? undefined,
        modifiedTime: data.updated_at ?? undefined,
      },
    };
  } catch {
    return { title: fallbackTitle, description: fallbackDescription };
  }
}

/** JSON for a <script type="application/ld+json">: escape "<" so the payload can never close the tag. */
function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export default async function BriefingReaderPage({ params }: PageProps) {
  const { day: dayStr, type } = await params;
  const day = parseDay(dayStr);
  if (day == null || !(VALID_TYPES as readonly string[]).includes(type)) return notFound();

  // A day in the future of the calendar can never have a brief.
  const currentDay = await getConflictDay();
  if (day > currentDay) return notFound();

  const { data, error } = await getBrief(day, type);

  // A real database failure is a 5xx, not a missing brief.
  if (error) throw new Error(`daily_briefings read failed: ${error.message}`);
  // Unknown row -> real 404 (not a 200 "NO BRIEFING AVAILABLE" soft-404).
  if (!data) return notFound();

  const headline = (typeof data.title === 'string' && data.title.trim()) || `Day ${day} ${TYPE_TITLES[type]}`;
  const article = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: clip(headline, 110),
    ...(typeof data.lead === 'string' && data.lead.trim() ? { description: clip(data.lead, 300) } : {}),
    datePublished: data.generated_at,
    dateModified: data.updated_at ?? data.generated_at,
    isAccessibleForFree: true,
    inLanguage: 'en',
    author: { '@type': 'Organization', name: DESK_NAME },
    publisher: { '@type': 'Organization', name: DESK_NAME },
  };

  // GATING (not enforced yet - Omar decides): business briefs are Pro-only on /pricing
  // (tier_features key `business_report`, free=false informed=false pro=true). See PR body.
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(article) }} />
      <div className="max-w-4xl mx-auto px-4 pt-4">
        <p
          data-testid="ai-disclosure-line"
          style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, lineHeight: 1.6, color: 'var(--text-muted)', margin: 0, letterSpacing: '0.3px' }}
        >
          {PRE_PUBLICATION_HUMAN_REVIEW
            ? 'Drafted with AI from linked public sources and reviewed by an editor before publication. '
            : 'Drafted by an AI agent from linked public sources and published by the automated daily build. '}
          <Link prefetch={false} href="/ai-disclosure" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>
            How we use AI
          </Link>
          {' · '}
          <Link prefetch={false} href="/corrections" style={{ color: 'var(--accent-blue)', textDecoration: 'underline' }}>
            Corrections
          </Link>
        </p>
      </div>
      <BriefingReader briefing={data} day={day} type={type} />
    </>
  );
}
