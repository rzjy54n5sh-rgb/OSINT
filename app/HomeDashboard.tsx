'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { AsciiHero } from '@/components/AsciiHero';
import { OsintCard } from '@/components/OsintCard';
import { EmailCapture } from '@/components/EmailCapture';
import { useRealtimeCount } from '@/hooks/useRealtimeCount';
import { useArticles } from '@/hooks/useArticles';
import { useScenarios } from '@/hooks/useScenarios';
import { useNewScenarioAlert } from '@/hooks/usePlatformAlert';
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

export default function HomeDashboard({ children }: { children?: ReactNode }) {
  const { articleCount, lastUpdate, live, conflictDay } = useRealtimeCount();
  const { articles } = useArticles({}, 3);
  const { scenarios } = useScenarios();
  const newScenarioAlert = useNewScenarioAlert();

  const scenarioChartData =
    scenarios.length > 0
      ? scenarios.slice(-10).map((s) => ({
          day: s.conflict_day,
          A: s.scenario_a,
          B: s.scenario_b,
          C: s.scenario_c,
          D: s.scenario_d,
          E: s.scenario_e ?? 0,
        }))
      : [];

  return (
    <div className="relative">
      <AsciiHero
        articleCount={articleCount}
        conflictDay={conflictDay ?? 10}
        countriesTracked={20}
      />

      {children != null && (
        <div className="max-w-6xl mx-auto px-4 w-full">{children}</div>
      )}

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

        {newScenarioAlert && (
          <div
            className="mb-6 border px-4 py-3 font-mono text-xs"
            style={{ borderColor: '#a855f7', background: 'rgba(168,85,247,0.08)' }}
          >
            <span style={{ color: '#a855f7' }}>◆ NEW SCENARIO DETECTED — DAY {newScenarioAlert.conflict_day}</span>
            <span className="ml-3" style={{ color: 'var(--accent-gold)' }}>
              SCENARIO {newScenarioAlert.label}: {newScenarioAlert.name}
            </span>
            <span className="ml-3" style={{ color: 'var(--text-secondary)' }}>
              {newScenarioAlert.probability}% probability
            </span>
            <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
              {newScenarioAlert.description}
            </p>
            <a
              href="/scenarios"
              className="mt-2 inline-block underline"
              style={{ color: '#a855f7' }}
            >
              VIEW FULL SCENARIO ANALYSIS →
            </a>
          </div>
        )}

        {/* ── TOP FINDING STRIP ──────────────────────────────────── */}
        <div className="mb-6 px-4 py-3"
             style={{ background: 'rgba(232,197,71,0.04)',
                      border: '1px solid rgba(232,197,71,0.15)' }}>
          <div className="flex items-center gap-2 mb-2">
            <span style={{ color: 'var(--accent-gold)', fontSize: '10px',
                           fontFamily: 'IBM Plex Mono', letterSpacing: '2px' }}>
              ◆ DAY {conflictDay ?? '—'} TOP FINDING
            </span>
          </div>
          <p className="font-body text-sm leading-relaxed"
             style={{ color: 'var(--text-secondary)' }}>
            US forces struck Kharg Island military facilities on March 13 —
            handling 90% of Iranian crude exports. Mojtaba Khamenei issued
            his first statement as Supreme Leader: war continues until US
            bases close. Brent settled at $103.14, up 41.5% since Feb 28.
          </p>
          <Link href={`/briefings/${conflictDay ?? 15}/general`}
                className="font-mono text-xs mt-2 inline-block"
                style={{ color: 'var(--accent-gold)' }}>
            READ FULL BRIEF →
          </Link>
        </div>

        {/* ── KEY METRICS ROW ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'BRENT', value: '$103.14', change: '+41.5%', up: true },
            { label: 'EGP/USD', value: '52+', change: 'RECORD LOW', up: false },
            { label: 'HORMUZ', value: 'CLOSED', change: 'Day 1', up: false },
            { label: 'US KIA', value: '11', change: '7 combat', up: false },
          ].map(({ label, value, change, up }) => (
            <div key={label} className="px-3 py-2"
                 style={{ border: '1px solid var(--border)',
                          background: 'var(--bg-card)' }}>
              <div className="font-mono" style={{ fontSize: '8px',
                   letterSpacing: '1px', color: 'var(--text-muted)',
                   marginBottom: '4px' }}>
                {label}
              </div>
              <div className="font-display text-xl"
                   style={{ color: up ? 'var(--accent-green)' : 'var(--accent-red)',
                            lineHeight: 1.1 }}>
                {value}
              </div>
              <div className="font-mono" style={{ fontSize: '8px',
                   color: 'var(--text-muted)', marginTop: '2px' }}>
                {change}
              </div>
            </div>
          ))}
        </div>

        {/* ── TODAY'S BRIEFINGS STRIP ─────────────────────────────── */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="font-mono text-xs uppercase"
                  style={{ color: 'var(--accent-gold)', letterSpacing: '2px' }}>
              ◆ TODAY&apos;S BRIEFINGS — DAY {conflictDay ?? '—'}
            </span>
            <Link href="/briefings" className="font-mono text-xs"
                  style={{ color: 'var(--text-muted)' }}>
              ALL DAYS →
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2"
               style={{ scrollbarWidth: 'none' }}>
            {[
              { type: 'general', label: 'GENERAL', emoji: '◆' },
              { type: 'egypt', label: 'EGYPT', emoji: '🇪🇬' },
              { type: 'uae', label: 'UAE', emoji: '🇦🇪' },
              { type: 'eschatology', label: 'ESCHA\u200BTOLOGY', emoji: '◎' },
              { type: 'business', label: 'BUSINESS', emoji: '◈' },
            ].map(({ type, label, emoji }) => (
              <Link key={type}
                    href={`/briefings/${conflictDay ?? 15}/${type}`}
                    className="shrink-0 flex items-center gap-2 px-3 py-2 border transition-colors hover:border-accent-gold/30"
                    style={{ borderColor: 'var(--border)',
                             background: 'var(--bg-card)',
                             minWidth: 'max-content' }}>
                <span>{emoji}</span>
                <span className="font-mono"
                      style={{ fontSize: '9px', letterSpacing: '1.5px',
                               color: 'var(--text-secondary)' }}>
                  {label}
                </span>
              </Link>
            ))}
          </div>
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
                    <Line type="monotone" dataKey="E" stroke="#a855f7" strokeWidth={1.5} dot={false} name="E" strokeDasharray="4 2" />
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
