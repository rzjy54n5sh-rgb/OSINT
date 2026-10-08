/**
 * Site identity, link-preview defaults and public-surface flags.
 *
 * Server- and client-safe (no I/O). Everything here is either a constant or a NEXT_PUBLIC_* env
 * value, which Next inlines at build time.
 */
import type { Metadata } from 'next';

/** The live origin. mena-intel-desk.com is NOT a resolving domain — never point links at it. */
export const DEFAULT_SITE_URL = 'https://mena-intel-desk.mores-cohorts9x.workers.dev';

function resolveSiteUrl(): string {
  const raw = (process.env.NEXT_PUBLIC_SITE_URL ?? '').trim().replace(/\/+$/, '');
  if (!raw) return DEFAULT_SITE_URL;
  try {
    const u = new URL(raw);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return DEFAULT_SITE_URL;
    return u.origin;
  } catch {
    return DEFAULT_SITE_URL;
  }
}

/** Absolute origin without a trailing slash, e.g. https://mena-intel-desk.mores-cohorts9x.workers.dev */
export const SITE_URL = resolveSiteUrl();
/** Host only, for share text (e.g. "mena-intel-desk.mores-cohorts9x.workers.dev"). */
export const SITE_HOST = new URL(SITE_URL).host;

export const SITE_NAME = 'MENA Intel Desk';
export const SITE_DESCRIPTOR = 'Corridor risk, measured';
export const SITE_DESCRIPTION =
  'Open-source intelligence on the Gulf, Red Sea and Horn of Africa: daily sourced briefings, War Posture by country, market-anchored scenario probabilities, markets and shipping indicators.';

/** Brand-neutral link-preview image (no data in it). Regenerate with `node scripts/generate-brand-images.mjs`. */
export const DEFAULT_OG_IMAGE = {
  url: '/og-default.png',
  width: 1200,
  height: 630,
  alt: `${SITE_NAME} — ${SITE_DESCRIPTOR}`,
} as const;

/**
 * Arabic UI toggle. Off unless NEXT_PUBLIC_ENABLE_AR is "1" or "true" at build time.
 * While off, the toggle is not rendered and a stale `lang=ar` cookie is ignored (English/LTR).
 */
export const ARABIC_ENABLED = ['1', 'true'].includes((process.env.NEXT_PUBLIC_ENABLE_AR ?? '').trim().toLowerCase());

/**
 * Brief types that have a public page at /briefings/{day}/{type}. Mirrors VALID_TYPES in
 * app/briefings/[day]/[type]/page.tsx — keep the two in step (used by the sitemap and RSS feed).
 */
export const ROUTABLE_BRIEF_TYPES = ['general', 'general_weekly', 'horn', 'egypt', 'uae', 'eschatology', 'business'] as const;

/** <link rel="alternate" type="application/rss+xml"> on every page. */
export const RSS_ALTERNATE = {
  'application/rss+xml': [{ url: '/rss.xml', title: `${SITE_NAME} — latest briefs` }],
};

type PageMetaInput = {
  /** Full <title> (already including the site suffix). */
  title: string;
  description: string;
  /** Route path, e.g. "/pricing". Used for og:url / canonical (resolved against metadataBase). */
  path: string;
  /** Exclude from search engines (auth, account, utility pages). */
  noindex?: boolean;
};

/**
 * Per-route metadata with matching Open Graph and Twitter cards. Next merges `openGraph` and
 * `twitter` shallowly — a page that sets only `title` would otherwise inherit the ROOT og:title —
 * so every public route builds its metadata through this helper.
 */
export function pageMetadata({ title, description, path, noindex }: PageMetaInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path, types: RSS_ALTERNATE },
    openGraph: {
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      images: [DEFAULT_OG_IMAGE],
      locale: 'en_US',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [DEFAULT_OG_IMAGE.url],
    },
    ...(noindex ? { robots: { index: false, follow: true } } : {}),
  };
}
