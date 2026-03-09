'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { createClient } from '@/lib/supabase/client';
import type { CountryReport } from '@/types/supabase';

export default function CountryReportPage() {
  const params = useParams();
  const slug = typeof params.slug === 'string' ? params.slug.toUpperCase() : '';
  const [report, setReport] = useState<CountryReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!slug) return;
    const supabase = createClient();
    supabase
      .from('country_reports')
      .select('*')
      .eq('country_code', slug)
      .order('conflict_day', { ascending: false })
      .limit(1)
      .single()
      .then(({ data, error: e }) => {
        setLoading(false);
        if (e) setError(e);
        else setReport(data as CountryReport);
      });
  }, [slug]);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        href="/countries"
        className="font-mono text-xs mb-6 inline-block"
        style={{ color: 'var(--accent-gold)' }}
      >
        ← COUNTRIES
      </Link>
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
      {!loading && !error && report && (
        <>
          <div className="flex items-center gap-4 mb-6">
            <CountryFlag code={report.country_code} name={report.country_name} />
            <NaiScoreBadge
              category={report.nai_category ?? '—'}
              score={report.nai_score ?? undefined}
            />
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              CONFLICT DAY {report.conflict_day ?? '—'}
            </span>
          </div>
          <OsintCard className="scanlines mb-6">
            <h2 className="font-display text-lg mb-4">REPORT CONTENT</h2>
            {report.content_json ? (
              <pre
                className="font-mono text-xs whitespace-pre-wrap"
                style={{ color: 'var(--text-secondary)' }}
              >
                {JSON.stringify(report.content_json, null, 2)}
              </pre>
            ) : (
              <p className="redacted">NO INTEL AVAILABLE</p>
            )}
          </OsintCard>
        </>
      )}
      {!loading && !error && !report && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
    </div>
  );
}
