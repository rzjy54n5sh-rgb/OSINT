import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { cache } from 'react';
import BriefingReader from './BriefingReader';
import { DESK_NAME, PRE_PUBLICATION_HUMAN_REVIEW } from '@/lib/desk-identity';
import { ROUTABLE_BRIEF_TYPES } from '@/lib/site';
import { briefTitle, briefTypeMeta } from '@/lib/brief-types';

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

/**
 * Report types with a page (current line-up + archive; lower-case, case-sensitive in the URL).
 * The list is lib/brief-types.ts (ROUTABLE_BRIEF_TYPES in lib/site.ts re-exports it).
 */
const VALID_TYPES: readonly string[] = ROUTABLE_BRIEF_TYPES;

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

/**
 * For a type introduced by the 2026-10 line-up: has ANY row of it been written yet? Until the first
 * row exists its pages show an honest empty state instead of a 404; after that a missing day is a
 * real 404 like every other type. Returns null on a read error (treated as "unknown" -> 404 path).
 */
const firstEditionExists = cache(async (type: string): Promise<boolean | null> => {
  const supabase = createPublicClient();
  const { data, error } = await supabase.from('daily_briefings').select('conflict_day').eq('report_type', type).limit(1);
  if (error) return null;
  return (data ?? []).length > 0;
});

/** True when (type, missing row) should render the "first edition not yet published" state. */
async function showsEmptyState(type: string): Promise<boolean> {
  if (!briefTypeMeta(type)?.isNew) return false;
  return (await firstEditionExists(type)) === false;
}

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
  if (day == null || !VALID_TYPES.includes(type)) {
    return { title: 'Briefing not found · MENA Intel Desk' };
  }
  const fallbackTitle = `Day ${day} ${briefTitle(type)} · ${DESK_NAME}`;
  const fallbackDescription = `${briefTitle(type)} for conflict day ${day}, with per-paragraph source citations.`;
  try {
    const { data } = await getBrief(day, type);
    if (!data) {
      if (await showsEmptyState(type)) {
        return {
          title: `${briefTitle(type)}: first edition not yet published · ${DESK_NAME}`,
          description: briefTypeMeta(type)?.blurb ?? fallbackDescription,
          robots: { index: false, follow: true },
        };
      }
      return { title: fallbackTitle, description: fallbackDescription };
    }
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
  if (day == null || !VALID_TYPES.includes(type)) return notFound();

  // A day in the future of the calendar can never have a brief.
  const currentDay = await getConflictDay();
  if (day > currentDay) return notFound();

  const { data, error } = await getBrief(day, type);

  // A real database failure is a 5xx, not a missing brief.
  if (error) throw new Error(`daily_briefings read failed: ${error.message}`);
  if (!data) {
    // A new line-up type with no row at all yet: say so plainly (noindex), never invent content.
    if (await showsEmptyState(type)) return <FirstEditionPending type={type} day={day} />;
    // Unknown row -> real 404 (not a 200 "NO BRIEFING AVAILABLE" soft-404).
    return notFound();
  }

  const headline = (typeof data.title === 'string' && data.title.trim()) || `Day ${day} ${briefTitle(type)}`;
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

/** Honest empty state for a line-up type whose first edition has not been written yet. */
function FirstEditionPending({ type, day }: { type: string; day: number }) {
  const meta = briefTypeMeta(type);
  return (
    <div className="max-w-3xl mx-auto px-4 py-12" data-testid="brief-empty-state">
      <p className="font-mono text-xs uppercase mb-2" style={{ color: meta?.color ?? 'var(--accent-gold)', letterSpacing: '1.5px' }}>
        DAY {day} · {meta?.label ?? type.toUpperCase()}
      </p>
      <h1 className="font-display text-2xl mb-4" style={{ color: 'var(--text-primary)' }}>
        {briefTitle(type)}: first edition not yet published
      </h1>
      <p className="font-body text-sm leading-relaxed mb-3" style={{ color: 'var(--text-secondary)' }}>
        {meta?.blurb}
      </p>
      <p className="font-body text-sm leading-relaxed mb-6" style={{ color: 'var(--text-secondary)' }}>
        This brief is part of the October 2026 line-up. No edition has been written yet, so there is nothing to show for Day{' '}
        {day}. Nothing is filled in ahead of time: the page will show the first edition once the daily build has written and
        sourced it.
      </p>
      <Link prefetch={false} href="/briefings" className="font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>
        {'\u2190'} All briefings
      </Link>
    </div>
  );
}
