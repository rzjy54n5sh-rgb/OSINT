'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { PostureCountryPanel } from '@/components/posture/PostureCountryPanel';
import { EgyptCoverage } from '@/components/countries/EgyptCoverage';
import type { ConflictDef, CountryPosture } from '@/lib/posture';
import type { CountryNarrative } from '@/lib/country-narrative';

/** What the server hands the client: identity, report day and the WHITELISTED narrative only. */
export interface CountryReportView {
  country_code: string;
  country_name: string | null;
  /** country_reports.conflict_day — the day the narrative was written for. */
  conflict_day: number | null;
  updated_at: string | null;
  /** null when the tier has no access OR the daily build has not written a narrative. */
  narrative: CountryNarrative | null;
}

type CountryReportClientProps = {
  report: CountryReportView;
  /** War Posture for this country: v2 rows per conflict (or the v1 blended row) + its evidence ledger. */
  posture: CountryPosture | null;
  /** Conflicts registry (names for the per-conflict cards). */
  conflicts: readonly ConflictDef[];
  hasAccess: boolean;
  requiredTier: 'informed' | 'professional';
  summaryOnly: boolean;
  conflictDayBadge?: ReactNode;
  /** Egypt page: day of the latest Egypt & Gulf Economy brief (null = none found). */
  economyBriefDay?: number | null;
};

function fmtUtc(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

export function CountryReportClient({
  report,
  posture,
  conflicts,
  requiredTier,
  summaryOnly,
  conflictDayBadge,
  economyBriefDay = null,
}: CountryReportClientProps) {
  const n = report.narrative;
  const generated = fmtUtc(n?.generated_at ?? null) ?? fmtUtc(report.updated_at);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link prefetch={false} href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
        ← COUNTRIES
      </Link>

      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }} translate="no">
        {(report.country_name ?? report.country_code).toUpperCase()}
      </h1>
      {conflictDayBadge}

      <div className="flex flex-wrap items-center gap-4 mt-3 mb-6">
        <CountryFlag code={report.country_code} name={report.country_name ?? undefined} />
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }} translate="no" data-testid="report-as-of">
          REPORT AS OF DAY {report.conflict_day ?? '—'}
          {generated ? ` · GENERATED ${generated}` : ''}
        </span>
      </div>

      <PostureCountryPanel countryCode={report.country_code} posture={posture} conflicts={conflicts} />

      {report.country_code.toUpperCase() === 'EG' && (
        <EgyptCoverage ledgerCount={posture?.ledger.length ?? 0} economyBriefDay={economyBriefDay} />
      )}

      {/* Lock card in normal flow (never an overlay): it cannot cover the War Posture panel above. */}
      {summaryOnly && (
        <section className="mb-6 mt-6" aria-labelledby="country-report-locked-heading" data-testid="country-report-locked">
          <h2 id="country-report-locked-heading" className="font-display text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
            DAILY COUNTRY REPORT
          </h2>
          <PaywallOverlay
            requiredTier={requiredTier}
            featureName="Daily country report"
            description={`The desk's daily assessment for ${report.country_name ?? report.country_code}: key risks, stabilizers, a data-integrity note and the sources it rests on, for Day ${report.conflict_day ?? '—'}.`}
          />
        </section>
      )}

      {!summaryOnly && n && (
        <div className="space-y-6" data-testid="country-narrative">
          {n.assessment && (
            <OsintCard>
              <h2 className="font-mono text-xs uppercase mb-3" style={{ color: 'var(--accent-gold)' }}>
                Assessment · Day {report.conflict_day ?? '—'}
              </h2>
              <p className="font-body text-sm leading-relaxed whitespace-pre-line" style={{ color: 'var(--text-secondary)' }}>
                {n.assessment}
              </p>
            </OsintCard>
          )}

          {n.key_risks.length > 0 && (
            <OsintCard>
              <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>KEY RISKS</h2>
              <ul className="space-y-2 font-body text-sm" style={{ color: 'var(--text-secondary)' }}>
                {n.key_risks.map((risk, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" style={{ color: 'var(--accent-red)' }}>▸</span>
                    {risk}
                  </li>
                ))}
              </ul>
            </OsintCard>
          )}

          {n.stabilizers.length > 0 && (
            <OsintCard>
              <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>STABILIZERS</h2>
              <ul className="space-y-2 font-body text-sm" style={{ color: 'var(--text-secondary)' }}>
                {n.stabilizers.map((s, i) => (
                  <li key={i} className="flex gap-2">
                    <span aria-hidden="true" style={{ color: 'var(--accent-green)' }}>▸</span>
                    {s}
                  </li>
                ))}
              </ul>
            </OsintCard>
          )}

          {n.data_integrity_note && (
            <OsintCard>
              <h2 className="font-mono text-xs uppercase mb-3" style={{ color: 'var(--accent-orange)' }}>
                Data integrity note
              </h2>
              <p className="font-body text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                {n.data_integrity_note}
              </p>
            </OsintCard>
          )}

          {n.sources.length > 0 && (
            <OsintCard>
              <h2 className="font-display text-lg mb-3" style={{ color: 'var(--text-primary)' }}>REPORT SOURCES</h2>
              <ul className="space-y-1.5 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                {n.sources.map((s, i) => (
                  <li key={`${s.url}-${i}`}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer nofollow" style={{ color: 'var(--accent-gold)' }}>
                      {s.name}
                    </a>
                    {s.published_at && <span className="ml-2">{s.published_at}</span>}
                  </li>
                ))}
              </ul>
              <p className="font-mono text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
                Party/state labels for the War Posture evidence are shown in the War Posture panel above.
              </p>
            </OsintCard>
          )}
        </div>
      )}

      {!summaryOnly && !n && (
        <OsintCard className="scanlines mb-6">
          <h2 className="font-display text-lg mb-2">DAILY COUNTRY REPORT</h2>
          <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
            No sourced data available{report.conflict_day != null ? ` for Day ${report.conflict_day}` : ''} — the daily build
            has not written this report.
          </p>
        </OsintCard>
      )}
    </div>
  );
}
