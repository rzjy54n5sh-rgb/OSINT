import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';
import { getUser } from '@/utils/supabase/server';
import { tierHasFeature, buildTierFlags } from '@/lib/tier';
import { CountryReportClient } from './CountryReportClient';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import type { CountryReport } from '@/types/supabase';

/** Slug (URL) -> ISO2 country_code. */
const SLUG_TO_CODE: Record<string, string> = {
  iran: 'IR', israel: 'IL', iraq: 'IQ', yemen: 'YE', 'saudi-arabia': 'SA', saudi: 'SA',
  uae: 'AE', egypt: 'EG', turkey: 'TR', russia: 'RU', syria: 'SY',
  lebanon: 'LB', jordan: 'JO', qatar: 'QA', kuwait: 'KW', bahrain: 'BH',
  oman: 'OM', palestine: 'PS', libya: 'LY', sudan: 'SD', algeria: 'DZ',
  morocco: 'MA', tunisia: 'TN', china: 'CN', usa: 'US', uk: 'GB',
  france: 'FR', germany: 'DE', india: 'IN', pakistan: 'PK',
  ir: 'IR', il: 'IL', iq: 'IQ', ye: 'YE', sa: 'SA', ae: 'AE', eg: 'EG',
  tr: 'TR', ru: 'RU', sy: 'SY', lb: 'LB', jo: 'JO', qa: 'QA', kw: 'KW',
  bh: 'BH', om: 'OM', ps: 'PS', ly: 'LY', sd: 'SD', dz: 'DZ', ma: 'MA',
  tn: 'TN', cn: 'CN', us: 'US', gb: 'GB', fr: 'FR', de: 'DE', in: 'IN', pk: 'PK',
};

const T1_COUNTRIES = ['EGY', 'ARE', 'UAE'];

export default async function CountryReportPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const rawSlug = typeof slug === 'string' ? slug : '';
  const countryCode = rawSlug ? (SLUG_TO_CODE[rawSlug.toLowerCase()] ?? rawSlug.toUpperCase().slice(0, 2)) : '';

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

  const { data: report, error } = await supabase
    .from('country_reports')
    .select('*')
    .eq('country_code', countryCode)
    .order('conflict_day', { ascending: false })
    .limit(1)
    .maybeSingle();

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

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Link href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
          ← COUNTRIES
        </Link>
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      </div>
    );
  }

  const safeReport: CountryReport = hasAccess
    ? (report as CountryReport)
    : { ...report, content_json: null } as CountryReport;

  return (
    <CountryReportClient
      report={safeReport}
      hasAccess={hasAccess}
      requiredTier={requiredTier}
      summaryOnly={summaryOnly}
      conflictDayBadge={<ConflictDayBadge />}
    />
  );
}
