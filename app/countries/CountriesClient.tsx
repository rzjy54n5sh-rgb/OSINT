'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { PageBriefing } from '@/components/PageBriefing';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { DataAsOf } from '@/components/ui/DataAsOf';
import { NaiV2CategoryBadge } from '@/components/nai/NaiV2CategoryBadge';
import { NaiV2Evidence } from '@/components/nai/NaiV2Evidence';
import { NAI_V2_EMPTY_TEXT, NAI_V2_SCALE_TEXT, formatBand, type NaiV2View } from '@/lib/nai-v2';

interface CountriesClientProps {
  initialScores: NaiV2View[];
  /** MAX(conflict_day) of nai_scores_v2 — the day the scores below belong to. */
  naiDay: number | null;
  /** Calendar day (DAY LOCK). */
  currentDay: number;
}

export default function CountriesClient({ initialScores, naiDay, currentDay }: CountriesClientProps) {
  const scores = initialScores;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="COUNTRY INTELLIGENCE REPORTS"
        description="Per-country analysis covering NAI War Posture scores, elite network mapping, key risk factors, and stabilizing forces. Reports are generated daily by automated analysis of the preceding 24 hours of collected intelligence. Click any country to view its full report."
        note="Reports reflect open-source data only. Countries with thin source coverage (Turkey, Russia, Pakistan) should be read with greater uncertainty than those with stronger coverage (Iran, Israel, Egypt, UAE)."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        COUNTRY INTELLIGENCE
      </h1>
      <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        CONFLICT DAY {currentDay} — NAI WAR POSTURE BY COUNTRY (AS OF DAY {naiDay ?? '—'})
      </p>
      <DataAsOf section="NAI WAR POSTURE" latestDay={naiDay} currentDay={currentDay} className="mb-8" />
      {scores.length === 0 && (
        <p className="font-mono text-xs border px-3 py-2" style={{ color: 'var(--accent-orange)', borderColor: 'var(--accent-orange)' }} data-testid="nai-v2-empty">
          {NAI_V2_EMPTY_TEXT}
        </p>
      )}
      {scores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scores.map((s, i) => (
            <motion.div
              key={`${s.country_code}-${s.conflict_day}`}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <OsintCard className="block hover:border-border-bright">
                <Link href={`/countries/${s.country_code.toLowerCase()}`} className="block">
                  <CountryFlag code={s.country_code} />
                  <div className="mt-2">
                    <NaiV2CategoryBadge category={s.category} locked={s.categoryLocked} />
                  </div>
                  <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }} translate="no">
                    <GlossaryTooltip
                      term="EXPRESSED"
                      definition={`Official narrative's position on continuing hostilities (${NAI_V2_SCALE_TEXT}).`}
                    >
                      <span>EXPRESSED {s.expressed_score ?? '—'}</span>
                    </GlossaryTooltip>
                    {' | '}
                    <GlossaryTooltip
                      term="LATENT"
                      definition="Population and non-government elites on the same scale, stored as a low–high band. Empty when there is no evidence."
                    >
                      <span>LATENT {formatBand(s.latent_low, s.latent_high)}</span>
                    </GlossaryTooltip>
                  </p>
                </Link>
                <div className="mt-2">
                  <NaiV2Evidence row={s} compact />
                </div>
              </OsintCard>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
