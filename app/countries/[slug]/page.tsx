'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { CountryFlag } from '@/components/CountryFlag';
import { NaiScoreBadge } from '@/components/NaiScoreBadge';
import { createClient } from '@/lib/supabase/client';
import type { CountryReport } from '@/types/supabase';

interface ContentNai {
  expressed?: number;
  latent?: number;
  category?: string;
  velocity?: number;
}

interface ContentScenarios {
  A?: number;
  B?: number;
  C?: number;
  D?: number;
}

interface ElitePerson {
  name?: string;
  role?: string;
  position?: string;
  red_line?: string;
}

interface ParsedContent {
  nai?: ContentNai;
  scenarios?: ContentScenarios;
  elite_network?: ElitePerson[];
  key_risks?: string[];
  stabilizers?: string[];
  assessment?: string;
}

const NAI_CATEGORY_COLOR: Record<string, string> = {
  SAFE: 'var(--nai-safe)',
  STABLE: 'var(--nai-stable)',
  TENSION: 'var(--nai-tension)',
  FRACTURE: 'var(--nai-fracture)',
  INVERSION: 'var(--nai-inversion)',
};

function parseContent(content: Record<string, unknown> | null): ParsedContent | null {
  if (!content || typeof content !== 'object') return null;
  return content as unknown as ParsedContent;
}

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

  const parsed = report?.content_json ? parseContent(report.content_json) : null;
  const hasStructuredContent = parsed && (parsed.nai ?? parsed.scenarios ?? parsed.elite_network ?? parsed.key_risks ?? parsed.stabilizers ?? parsed.assessment);

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
              category={report.nai_category ?? parsed?.nai?.category ?? '—'}
              score={report.nai_score ?? parsed?.nai?.expressed ?? undefined}
            />
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
              CONFLICT DAY {report.conflict_day ?? '—'}
            </span>
          </div>

          {hasStructuredContent ? (
            <div className="space-y-6">
              {/* 1. NAI BREAKDOWN */}
              {parsed.nai && (
                <OsintCard>
                  <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>NAI BREAKDOWN</h2>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>EXPRESSED</p>
                      <p className="font-display text-2xl" style={{ color: NAI_CATEGORY_COLOR[parsed.nai.category ?? ''] ?? 'var(--text-primary)' }}>
                        {parsed.nai.expressed ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>LATENT</p>
                      <p className="font-display text-2xl" style={{ color: NAI_CATEGORY_COLOR[parsed.nai.category ?? ''] ?? 'var(--text-primary)' }}>
                        {parsed.nai.latent ?? '—'}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-xs uppercase mb-1" style={{ color: 'var(--text-muted)' }}>VELOCITY</p>
                      <p className="font-display text-2xl" style={{ color: (parsed.nai.velocity ?? 0) > 0 ? 'var(--accent-green)' : (parsed.nai.velocity ?? 0) < 0 ? 'var(--accent-red)' : 'var(--text-secondary)' }}>
                        {(parsed.nai.velocity ?? 0) > 0 ? '↑' : (parsed.nai.velocity ?? 0) < 0 ? '↓' : '→'} {parsed.nai.velocity ?? 0}
                      </p>
                    </div>
                  </div>
                </OsintCard>
              )}

              {/* 2. SCENARIO EXPOSURE */}
              {parsed.scenarios && (
                <OsintCard>
                  <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>SCENARIO EXPOSURE</h2>
                  <div className="space-y-3">
                    {(['A', 'B', 'C', 'D'] as const).map((key) => {
                      const pct = parsed.scenarios![key] ?? 0;
                      const colors = { A: 'var(--accent-gold)', B: 'var(--accent-blue)', C: 'var(--accent-orange)', D: 'var(--accent-red)' };
                      return (
                        <div key={key}>
                          <div className="flex justify-between font-mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                            <span>SCENARIO {key}</span>
                            <span>{pct}%</span>
                          </div>
                          <div className="nai-bar-track w-full">
                            <div className="nai-bar-fill tension" style={{ width: `${pct}%`, background: colors[key], boxShadow: `0 0 8px ${colors[key]}80` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </OsintCard>
              )}

              {/* 3. ELITE NETWORK */}
              {parsed.elite_network && parsed.elite_network.length > 0 && (
                <OsintCard>
                  <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>ELITE NETWORK</h2>
                  <div className="space-y-4">
                    {parsed.elite_network.map((person, i) => (
                      <div key={i} className="border-t pt-3 first:border-0 first:pt-0" style={{ borderColor: 'var(--border)' }}>
                        <p className="font-body font-medium" style={{ color: 'var(--text-primary)' }}>{person.name ?? '—'}</p>
                        <p className="font-mono text-xs mt-0.5" style={{ color: 'var(--accent-gold)' }}>{person.role ?? '—'}</p>
                        {person.position && <p className="font-body text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{person.position}</p>}
                        {person.red_line && (
                          <p className="font-body text-sm mt-1" style={{ color: 'var(--accent-red)' }}>⚠ {person.red_line}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </OsintCard>
              )}

              {/* 4. KEY RISKS */}
              {parsed.key_risks && parsed.key_risks.length > 0 && (
                <OsintCard>
                  <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>KEY RISKS</h2>
                  <ul className="space-y-2 font-body text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {parsed.key_risks.map((risk, i) => (
                      <li key={i} className="flex gap-2">
                        <span style={{ color: 'var(--accent-red)' }}>▸</span>
                        {risk}
                      </li>
                    ))}
                  </ul>
                </OsintCard>
              )}

              {/* 5. STABILIZERS */}
              {parsed.stabilizers && parsed.stabilizers.length > 0 && (
                <OsintCard>
                  <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>STABILIZERS</h2>
                  <ul className="space-y-2 font-body text-sm" style={{ color: 'var(--text-secondary)' }}>
                    {parsed.stabilizers.map((s, i) => (
                      <li key={i} className="flex gap-2">
                        <span style={{ color: 'var(--accent-green)' }}>▸</span>
                        {s}
                      </li>
                    ))}
                  </ul>
                </OsintCard>
              )}

              {/* 6. ANALYST ASSESSMENT */}
              {parsed.assessment && (
                <OsintCard>
                  <p className="font-mono text-xs uppercase mb-3" style={{ color: 'var(--accent-gold)' }}>ASSESSMENT</p>
                  <p className="font-body text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{parsed.assessment}</p>
                </OsintCard>
              )}
            </div>
          ) : (
            <OsintCard className="scanlines mb-6">
              <h2 className="font-display text-lg mb-4">REPORT CONTENT</h2>
              {report.nai_score != null && (
                <div className="mb-4">
                  <NaiScoreBadge category={report.nai_category ?? '—'} score={report.nai_score} />
                  <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }}>EXPRESSED: {report.nai_score} | LATENT: —</p>
                </div>
              )}
              <p className="redacted">[FULL REPORT PENDING]</p>
            </OsintCard>
          )}
        </>
      )}
      {!loading && !error && !report && (
        <p className="redacted py-12">NO INTEL AVAILABLE</p>
      )}
    </div>
  );
}
