import Link from 'next/link';
import type { Metadata } from 'next';
import { TRACKED_COUNTRY_NAMES } from '@/lib/country-names';
import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { CountryReportClient, type CountryReportView } from './CountryReportClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { parseNarrative } from '@/lib/country-narrative';
import { getNaiV2CountryLatest } from '@/lib/nai-v2';

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
  if (!name) return { title: 'Country not tracked — MENA Intel Desk' };
  return {
    title: `${name} — War Posture & Country Report — MENA Intel Desk`,
    description: `${name}: latest War Posture (official and societal posture on one party-neutral scale) with cited sources, and the daily country report.`,
  };
}

export default async function CountryReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rawSlug = typeof slug === 'string' ? slug : '';
  const countryCode = codeForSlug(rawSlug);

  const [user, supabase] = await Promise.all([
    getUser(),
    createClient(),
  ]);

  const { data: tierRows } = await supabase
    .from('tier_features')
    .select('feature_key, free_access, informed_access, pro_access');
  const flags = buildTierFlags(tierRows ?? []);

  const isEgypt = countryCode === 'EG';
  const isUae = countryCode === 'AE' || countryCode === 'ARE' || countryCode === 'UAE';
  const hasAccess = isEgypt
    ? tierHasFeature(user?.tier, 'country_report_egy', flags)
    : isUae
      ? tierHasFeature(user?.tier, 'country_report_uae', flags)
      : tierHasFeature(user?.tier, 'country_report_other', flags);
  const requiredTier = (isEgypt || isUae) ? 'informed' : 'professional';
  const summaryOnly = !hasAccess;

  // Only the columns the page renders. country_reports.nai_score / nai_category are the RETIRED
  // US-referenced scale and are deliberately not selected: the score shown is War Posture
  // (nai_scores_v2), the same one /nai and /countries show.
  const [{ data: report, error }, posture] = await Promise.all([
    supabase
      .from('country_reports')
      .select('country_code, country_name, conflict_day, updated_at, content_json')
      .eq('country_code', countryCode)
      .order('conflict_day', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Same visibility as the /countries list (expressed, latent band and category for every tier),
    // so the detail page can never contradict the list it is opened from.
    countryCode ? getNaiV2CountryLatest(supabase, countryCode, { latent: true, gap: true }) : Promise.resolve(null),
  ]);

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
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
        <Link href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
          ← COUNTRIES
        </Link>
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      </div>
    );
  }

  const row = report as
    | { country_code: string; country_name: string | null; conflict_day: number | null; updated_at: string | null; content_json: unknown }
    | null;
  // Whitelisted narrative keys only (see ./narrative.ts); legacy keys never leave the server.
  // Paid content is withheld server-side for tiers without access.
  const view: CountryReportView = {
    country_code: row?.country_code ?? countryCode,
    country_name: row?.country_name ?? null,
    conflict_day: row?.conflict_day ?? null,
    updated_at: row?.updated_at ?? null,
    narrative: hasAccess && row ? parseNarrative(row.content_json) : null,
  };

  return (
    <CountryReportClient
      report={view}
      posture={posture}
      hasAccess={hasAccess}
      requiredTier={requiredTier}
      summaryOnly={summaryOnly}
      conflictDayBadge={<ConflictDayBadge />}
    />
  );
}
