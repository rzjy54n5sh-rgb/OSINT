'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';
import { NaiV2CategoryBadge } from '@/components/nai/NaiV2CategoryBadge';
import { NaiV2Evidence } from '@/components/nai/NaiV2Evidence';
import { NaiPostureLabel } from '@/components/nai/NaiPostureLabel';
import {
  NAI_V2_ARCHIVE_NOTE,
  NAI_V2_SCALE_TEXT,
  formatBand,
  formatGap,
  type NaiV2View,
} from '@/lib/nai-v2';
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
  /** Latest nai_scores_v2 row for this country (War Posture), or null when it has none. */
  posture: NaiV2View | null;
  hasAccess: boolean;
  requiredTier: 'informed' | 'professional';
  summaryOnly: boolean;
  conflictDayBadge?: ReactNode;
};

function fmtUtc(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function WarPosturePanel({ posture, countryDay }: { posture: NaiV2View | null; countryDay: number | null }) {
  if (!posture) {
    return (
      <section className="osint-card p-5 mb-6" data-testid="war-posture-panel">
        <h2 className="font-display text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
          WAR POSTURE
        </h2>
        <p className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }} data-testid="war-posture-empty">
          No sourced data available{countryDay != null ? ` for Day ${countryDay}` : ''}. No score or category is shown
          rather than a guessed one.
        </p>
      </section>
    );
  }
  const p = posture;
  return (
    <section className="osint-card p-5 mb-6" data-testid="war-posture-panel" aria-labelledby="war-posture-h">
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 id="war-posture-h" className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
          WAR POSTURE
        </h2>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }} translate="no">
          AS OF DAY {p.conflict_day} · {p.as_of}
        </span>
      </div>
      <p className="font-mono text-[11px] mb-3 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        One party-neutral scale for every state: {NAI_V2_SCALE_TEXT}.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
            Expressed (official)
          </p>
          <p className="font-display text-3xl" style={{ color: 'var(--text-primary)' }} translate="no" data-testid="war-posture-expressed">
            {p.expressed_score ?? '—'}
          </p>
          <NaiPostureLabel expressed={p.expressed_score} className="mt-1" />
          <p className="font-mono text-[11px] mt-1" style={{ color: 'var(--text-muted)' }} translate="no">
            ΔEXP {p.delta === null ? '—' : formatGap(p.delta)}
            {p.prevDay != null ? ` vs Day ${p.prevDay}` : ''}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
            Latent (society, band)
          </p>
          <p className="font-display text-3xl" style={{ color: 'var(--text-primary)' }} translate="no" data-testid="war-posture-latent">
            {p.latentLocked ? 'Informed tier' : p.latent_low === null ? '—' : formatBand(p.latent_low, p.latent_high)}
          </p>
          {!p.latentLocked && p.latent_low === null && (
            <p className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }}>
              No admissible evidence
            </p>
          )}
        </div>
        <div>
          <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
            Gap · Category
          </p>
          <p className="font-display text-3xl" style={{ color: 'var(--text-primary)' }} translate="no">
            {formatGap(p.gap)}
          </p>
          <div className="mt-1">
            <NaiV2CategoryBadge
              category={p.category}
              locked={p.categoryLocked}
              latentEvidence={p.latentEvidence}
              expressed={p.expressed_score}
            />
          </div>
        </div>
      </div>
      {(p.expressed_basis || p.latent_basis) && (
        <dl className="font-body text-sm mt-4 space-y-2" style={{ color: 'var(--text-secondary)' }}>
          {p.expressed_basis && (
            <div>
              <dt className="font-mono text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>
                Basis — expressed
              </dt>
              <dd className="leading-relaxed">{p.expressed_basis}</dd>
            </div>
          )}
          {p.latent_basis && (
            <div>
              <dt className="font-mono text-[11px] uppercase" style={{ color: 'var(--text-muted)' }}>
                Basis — latent
              </dt>
              <dd className="leading-relaxed">{p.latent_basis}</dd>
            </div>
          )}
        </dl>
      )}
      <div className="mt-4 border-t pt-3" style={{ borderColor: 'var(--border)' }}>
        <p className="font-mono text-[11px] uppercase mb-1" style={{ color: 'var(--text-muted)' }}>
          Sources
        </p>
        <NaiV2Evidence row={p} />
      </div>
      <p className="font-mono text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
        {NAI_V2_ARCHIVE_NOTE}{' '}
        <Link href="/methodology" style={{ color: 'var(--accent-gold)' }}>
          How War Posture is scored →
        </Link>
      </p>
    </section>
  );
}

export function CountryReportClient({
  report,
  posture,
  requiredTier,
  summaryOnly,
  conflictDayBadge,
}: CountryReportClientProps) {
  const n = report.narrative;
  const generated = fmtUtc(n?.generated_at ?? null) ?? fmtUtc(report.updated_at);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link href="/countries" className="font-mono text-xs mb-6 inline-block" style={{ color: 'var(--accent-gold)' }}>
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

      <WarPosturePanel posture={posture} countryDay={report.conflict_day} />

      {summaryOnly && (
        <div className="relative">
          <OsintCard className="mb-6">
            <h2 className="font-display text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
              DAILY COUNTRY REPORT
            </h2>
            <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              Assessment, key risks, stabilizers, data-integrity note and sources for Day {report.conflict_day ?? '—'}.
            </p>
          </OsintCard>
          <PaywallOverlay requiredTier={requiredTier} featureName="Country Intelligence Report" compact={false} />
        </div>
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
