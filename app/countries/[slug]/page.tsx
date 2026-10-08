import { pageMetadata } from '@/lib/site';
import Link from 'next/link';
import type { Metadata } from 'next';
import { TRACKED_COUNTRY_NAMES } from '@/lib/country-names';
import { createPublicClient } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import type { CountryReportView } from './CountryReportClient';
import { CountryReportGate } from './CountryReportGate';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { parseNarrative } from '@/lib/country-narrative';
import { getNaiV2CountryLatest } from '@/lib/nai-v2';
import { getViewerCountryReport, narrativeUnlocked } from '@/lib/country-report';

/**
 * ISR, rendered on first request per slug. The HTML is what an ANONYMOUS visitor sees (summary,
 * War Posture expressed score only, no paid narrative, no latent band / gap / category) and is
 * shared by the edge cache; a signed-in visitor whose tier unlocks more gets it after hydration
 * from /api/viewer/country/[code].
 */
export const revalidate = 900;

/** No paths at build time: each path is rendered on its first request, then cached (ISR). */
export async function generateStaticParams() {
  return [];
}

/** Slug (URL) -> ISO2 country_code. */
const SLUG_TO_CODE: Record<string, string> = {
  iran: 'IR', israel: 'IL', iraq: 'IQ', yemen: 'YE', 'saudi-arabia': 'SA', saudi: 'SA',
  uae: 'AE', egypt: 'EG', turkey: 'TR', russia: 'RU', syria: 'SY',
  lebanon: 'LB', jordan: 'JO', qatar: 'QA', kuwait: 'KW', bahrain: 'BH',
  oman: 'OM', palestine: 'PS', libya: 'LY', sudan: 'SD', algeria: 'DZ',
  morocco: 'MA', tunisia: 'TN', china: 'CN', usa: 'US', uk: 'GB',
  france: 'FR', germany: 'DE', india: 'IN', pakistan: 'PK',
  ethiopia: 'ET', eritrea: 'ER', somalia: 'SO', djibouti: 'DJ',
  ir: 'IR', il: 'IL', iq: 'IQ', ye: 'YE', sa: 'SA', ae: 'AE', eg: 'EG',
  tr: 'TR', ru: 'RU', sy: 'SY', lb: 'LB', jo: 'JO', qa: 'QA', kw: 'KW',
  bh: 'BH', om: 'OM', ps: 'PS', ly: 'LY', sd: 'SD', dz: 'DZ', ma: 'MA',
  tn: 'TN', cn: 'CN', us: 'US', gb: 'GB', fr: 'FR', de: 'DE', in: 'IN', pk: 'PK',
  et: 'ET', er: 'ER', so: 'SO', dj: 'DJ',
};

function codeForSlug(slug: string): string {
  return slug ? (SLUG_TO_CODE[slug.toLowerCase()] ?? slug.toUpperCase().slice(0, 2)) : '';
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const code = codeForSlug(typeof slug === 'string' ? slug : '');
  const name = TRACKED_COUNTRY_NAMES[code];
  if (!name) return { title: 'Country not tracked — MENA Intel Desk', robots: { index: false, follow: true } };
  return pageMetadata({
    title: `${name} — War Posture & Country Report — MENA Intel Desk`,
    description: `${name}: latest War Posture (official and societal posture on one party-neutral scale) with cited sources, and the daily country report.`,
    path: `/countries/${slug}`,
  });
}

export default async function CountryReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rawSlug = typeof slug === 'string' ? slug : '';
  const countryCode = codeForSlug(rawSlug);

  const supabase = createPublicClient();

  const isEgypt = countryCode === 'EG';
  const isUae = countryCode === 'AE' || countryCode === 'ARE' || countryCode === 'UAE';
  const featureKey = isEgypt ? 'country_report_egy' : isUae ? 'country_report_uae' : 'country_report_other';
  const requiredTier = (isEgypt || isUae) ? 'informed' : 'professional';

  // Only the columns the page renders. country_reports.nai_score / nai_category are the RETIRED
  // US-referenced scale and are deliberately not selected: the score shown is War Posture
  // (nai_scores_v2), the same one /nai and /countries show.
  // tier_features first (one small row set): the War Posture row must be built at ANONYMOUS access,
  // because this HTML is shared by the edge cache (latent band / gap / category are informed-tier
  // features). The full view for a signed-in visitor comes from /api/viewer/country/[code].
  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);
  // Access as an ANONYMOUS visitor (tier null) — the only view this shared HTML may contain.
  const hasAccess = tierHasFeature(null, featureKey, flags);
  const anonPostureAccess = {
    latent: tierHasFeature(null, 'nai_latent_score', flags),
    gap: tierHasFeature(null, 'nai_gap_analysis', flags),
  };

  // viewer_country_report via the cookie-less client = the ANONYMOUS view: content_json is null
  // unless the free tier unlocks it. Before migration 20261008090000 the RPC is missing and the old
  // table read runs; content_json is then selected only when the anonymous tier has access.
  const [{ data: report, error }, posture] = await Promise.all([
    countryCode
      ? getViewerCountryReport(supabase, countryCode, { withContent: hasAccess })
      : Promise.resolve({ data: null, error: null }),
    countryCode ? getNaiV2CountryLatest(supabase, countryCode, anonPostureAccess) : Promise.resolve(null),
  ]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link prefetch={false} href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
          ← COUNTRIES
        </Link>
        <div className="font-mono text-xs py-8 border px-4" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
          [DATA UNAVAILABLE]
        </div>
      </div>
    );
  }

  if (!report && !posture) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link prefetch={false} href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
          ← COUNTRIES
        </Link>
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      </div>
    );
  }

  const row = report;
  // Whitelisted narrative keys only (see lib/country-narrative.ts); legacy keys never leave the server.
  // Paid content is withheld server-side unless the ANONYMOUS tier has access (app check AND RPC).
  const view: CountryReportView = {
    country_code: row?.country_code ?? countryCode,
    country_name: row?.country_name ?? null,
    conflict_day: row?.conflict_day ?? null,
    updated_at: row?.updated_at ?? null,
    narrative: narrativeUnlocked(hasAccess, row) ? parseNarrative(row!.content_json) : null,
  };

  return (
    <CountryReportGate
      report={view}
      posture={posture}
      featureKey={featureKey}
      requiredTier={requiredTier}
      tierFlags={flags}
      anonHasAccess={hasAccess}
      anonPostureAccess={anonPostureAccess}
      conflictDayBadge={<ConflictDayBadge />}
    />
  );
}
