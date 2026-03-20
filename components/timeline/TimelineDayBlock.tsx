'use client';

import type { ReactNode } from 'react';
import { PaywallOverlay } from '@/components/ui/PaywallOverlay';

export type TimelineArticle = {
  title: string;
  source_name: string | null;
  url: string | null;
};

type ScenarioSlice = {
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
} | null;

interface TimelineDayBlockProps {
  conflictDay: number;
  dateLabel: string;
  scenario: ScenarioSlice;
  articles: TimelineArticle[];
  locked: boolean;
}

export function TimelineDayBlock({ conflictDay, dateLabel, scenario, articles, locked }: TimelineDayBlockProps) {
  const inner: ReactNode = (
    <>
      <div
        className="flex flex-wrap items-baseline gap-2 px-4 py-3 border-b"
        style={{ background: '#0D1B2A', borderColor: 'rgba(255,255,255,0.08)' }}
      >
        <span className="font-display text-lg" style={{ color: 'var(--accent-gold)' }}>
          ◆ DAY {conflictDay}
        </span>
        <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
          · {dateLabel}
        </span>
      </div>
      <div className="p-4 space-y-3">
        {scenario ? (
          <p className="font-mono text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            [Scenario: B {Math.round(Number(scenario.scenario_b))}% | A {Math.round(Number(scenario.scenario_a))}% | C{' '}
            {Math.round(Number(scenario.scenario_c))}% | D {Math.round(Number(scenario.scenario_d))}%]
          </p>
        ) : (
          <p className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            [Scenario: no row for this day]
          </p>
        )}
        {articles.length === 0 ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            No qualifying headline articles in the current sample for this day.
          </p>
        ) : (
          <ul className="space-y-2 list-none m-0 p-0">
            {articles.map((a, i) => (
              <li key={i} className="font-mono text-xs leading-snug pl-0">
                <span style={{ color: 'var(--text-muted)' }}>• </span>
                {a.url ? (
                  <a
                    href={a.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {a.title}
                  </a>
                ) : (
                  <span style={{ color: 'var(--text-primary)' }}>{a.title}</span>
                )}
                <span style={{ color: 'var(--text-muted)' }}> [{a.source_name ?? 'Source'}]</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );

  return (
    <article
      id={`day-${conflictDay}`}
      className="rounded-sm border overflow-hidden scroll-mt-28 mb-6 relative"
      style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
    >
      {locked ? (
        <>
          <div className="pointer-events-none select-none blur-[5px] opacity-40">{inner}</div>
          <div
            className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 py-6"
            style={{ background: 'rgba(7, 10, 15, 0.82)', backdropFilter: 'blur(4px)' }}
          >
            <p className="font-mono text-xs text-center" style={{ color: '#E2E8F0' }}>
              Upgrade to Informed for full timeline
            </p>
            <PaywallOverlay requiredTier="informed" featureName="Full conflict timeline" compact />
          </div>
        </>
      ) : (
        inner
      )}
    </article>
  );
}
