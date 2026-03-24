'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { PageBriefing } from '@/components/PageBriefing';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import type { NaiScore } from '@/types/supabase';

interface CountriesClientProps {
  initialScores: NaiScore[];
  conflictDay: number;
}

export default function CountriesClient({ initialScores, conflictDay }: CountriesClientProps) {
  const scores = initialScores;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <PageBriefing
        title="COUNTRY INTELLIGENCE REPORTS"
        description="Per-country analysis covering NAI scores, elite network mapping, key risk factors, and stabilizing forces. Reports are generated daily by automated analysis of the preceding 24 hours of collected intelligence. Click any country to view its full report."
        note="Reports reflect open-source data only. Countries with thin source coverage (Turkey, Russia, Pakistan) should be read with greater uncertainty than those with stronger coverage (Iran, Israel, Egypt, UAE)."
      />
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        COUNTRY INTELLIGENCE
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        CONFLICT DAY {conflictDay} — NAI BY COUNTRY
      </p>
      {scores.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {scores.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {scores.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link href={`/countries/${s.country_code.toLowerCase()}`}>
                <OsintCard className="block hover:border-border-bright">
                  <CountryFlag code={s.country_code} />
                  <div className="mt-2">
                    <NaiScoreBadge category={s.category} score={s.expressed_score} />
                  </div>
                  <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }} translate="no">
                    <GlossaryTooltip term="EXPRESSED" definition="Public diplomatic and media alignment (0–100).">
                      <span>EXPRESSED {s.expressed_score}</span>
                    </GlossaryTooltip>
                    {' | '}
                    <GlossaryTooltip term="LATENT" definition="Underlying structural and sentiment alignment (0–100).">
                      <span>LATENT {s.latent_score}</span>
                    </GlossaryTooltip>
                  </p>
                </OsintCard>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
