'use client';

import Link from 'next/link';
import { AsciiHero } from '@/components/AsciiHero';
import { OsintCard } from '@/components/OsintCard';
import { EmailCapture } from '@/components/EmailCapture';
import { useRealtimeCount } from '@/hooks/useRealtimeCount';
import { useArticles } from '@/hooks/useArticles';
import { useScenarios } from '@/hooks/useScenarios';
import { SourceBadge } from '@/components/SourceBadge';
import { SentimentBar } from '@/components/SentimentBar';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';

const QUICK_LINKS = [
  { href: '/feed', label: 'FEED', description: 'Live OSINT articles filtered by region, sentiment & source' },
  { href: '/nai', label: 'NAI MAP', description: 'Narrative Alignment Index — 20 countries mapped & ranked' },
  { href: '/countries', label: 'COUNTRIES', description: 'Per-country intelligence reports with elite network analysis' },
  { href: '/scenarios', label: 'SCENARIOS', description: 'Conflict scenario probability tracker across 10 days' },
  { href: '/disinfo', label: 'DISINFO', description: 'Active disinformation claims — verdict & spread estimate' },
  { href: '/markets', label: 'MARKETS', description: 'Conflict-sensitive market indicators with trend lines' },
  { href: '/social', label: 'SOCIAL', description: 'Regional social media trend monitoring by platform' },
  { href: '/timeline', label: 'TIMELINE', description: 'Day-by-day conflict chronology from Day 1 to present' },
  { href: '/analytics', label: 'ANALYTICS', description: 'Mix-and-match chart builder across all data dimensions' },
  { href: '/methodology', label: 'METHODOLOGY', description: 'How this platform works — NAI scoring, scenario framework, data sources, and neutrality principles' },
];

export default function CommandDashboard() {
  const { articleCount, lastUpdate, live, conflictDay } = useRealtimeCount();
  const { articles } = useArticles({}, 3);
  const { scenarios } = useScenarios();

  const scenarioChartData =
    scenarios.length > 0
      ? scenarios.slice(-10).map((s) => ({
          day: s.conflict_day,
          A: s.scenario_a,
          B: s.scenario_b,
          C: s.scenario_c,
          D: s.scenario_d,
        }))
      : [];

  return (
    <div className="relative">
      <AsciiHero
        articleCount={articleCount}
        conflictDay={conflictDay ?? 10}
        countriesTracked={20}
      />

      <section className="max-w-6xl mx-auto px-4 pb-12">
        <div
          className="font-mono text-xs uppercase tracking-widest flex flex-wrap gap-6 mb-10"
          style={{ color: 'var(--text-secondary)' }}
        >
          <span>CONFLICT DAY <span style={{ color: 'var(--accent-gold)' }}>{conflictDay ?? '—'}</span></span>
          <span>ARTICLES <span style={{ color: 'var(--accent-gold)' }}>{articleCount}</span></span>
          <span>LAST UPDATE <span style={{ color: 'var(--accent-gold)' }}>{lastUpdate}</span></span>
          <span>{live ? '● LIVE' : '○ OFFLINE'}</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-10">
          {QUICK_LINKS.map((link, i) => (
            <Link key={link.href} href={link.href}>
              <OsintCard className={`fade-up fade-up-${(i % 6) + 1} block hover:border-accent-gold/30`}>
                <span className="font-mono text-xs uppercase" style={{ color: 'var(--accent-gold)' }}>
                  {link.label}
                </span>
                <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-secondary)' }}>
                  {link.description}
                </p>
              </OsintCard>
            </Link>
          ))}
        </div>

        <div style={{ maxWidth: 480, margin: '32px auto', padding: '0 16px' }}>
          <div style={{ border: '1px solid var(--border)', padding: 20 }}>
            <EmailCapture source="home" />
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <OsintCard className="scanlines">
            <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>
              LATEST INTELLIGENCE
            </h2>
            {articles.length === 0 ? (
              <p className="redacted">NO INTEL AVAILABLE</p>
            ) : (
              <ul className="space-y-4">
                {articles.map((a) => (
                  <li key={a.id} className="border-t border-border pt-3 first:border-0 first:pt-0">
                    <SourceBadge
                      name={a.source_name}
                      logoUrl={a.source_logo_url}
                      sourceType={a.source_type}
                    />
                    <p className="font-body text-sm mt-1" style={{ color: 'var(--text-primary)' }}>
                      {a.title}
                    </p>
                    <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      CONFLICT DAY {a.conflict_day ?? '—'} — {a.published_at ? new Date(a.published_at).toISOString().slice(11, 16) : '--:--'} UTC
                    </p>
                    {a.confidence_score != null && (
                      <SentimentBar value={a.confidence_score} className="mt-2" />
                    )}
                  </li>
                ))}
              </ul>
            )}
          </OsintCard>

          <OsintCard className="scanlines">
            <h2 className="font-display text-lg mb-4" style={{ color: 'var(--text-primary)' }}>
              SCENARIO PROBABILITY
            </h2>
            {scenarioChartData.length === 0 ? (
              <p className="redacted">NO INTEL AVAILABLE</p>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scenarioChartData}>
                    <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: 2,
                      }}
                      labelStyle={{ color: 'var(--text-secondary)' }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="A" stroke="var(--accent-green)" strokeWidth={1.5} dot={false} name="A" />
                    <Line type="monotone" dataKey="B" stroke="var(--accent-gold)" strokeWidth={1.5} dot={false} name="B" />
                    <Line type="monotone" dataKey="C" stroke="var(--accent-blue)" strokeWidth={1.5} dot={false} name="C" />
                    <Line type="monotone" dataKey="D" stroke="var(--accent-red)" strokeWidth={1.5} dot={false} name="D" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </OsintCard>
        </div>
      </section>
    </div>
  );
}
