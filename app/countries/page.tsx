'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { useNaiScores } from '@/hooks/useNaiScores';

const CONFLICT_DAY = 10;

export default function CountriesPage() {
  const { scores, loading, error } = useNaiScores(CONFLICT_DAY);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        COUNTRY INTELLIGENCE
      </h1>
      <p className="font-mono text-xs mb-8" style={{ color: 'var(--text-muted)' }}>
        CONFLICT DAY {CONFLICT_DAY} — NAI BY COUNTRY
      </p>
      {loading && (
        <p className="font-mono text-xs py-8" style={{ color: 'var(--text-muted)' }}>
          LOADING<span className="blink-cursor" style={{ color: 'var(--accent-gold)' }}>█</span>
        </p>
      )}
      {error && (
        <div className="font-mono text-xs py-8 border px-4" style={{ color: 'var(--accent-red)', borderColor: 'var(--accent-red)' }}>
          [DATA UNAVAILABLE]
        </div>
      )}
      {!loading && !error && scores.length === 0 && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
      {!loading && !error && scores.length > 0 && (
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
                  <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
                    EXPRESSED {s.expressed_score} | LATENT {s.latent_score}
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
