'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createClient } from '@/lib/supabase/client';
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
  /**
   * Server-prefetched headlines. `null` = not prefetched: the block loads its own day (top 5,
   * negative first, newest first) when it scrolls near the viewport. This avoids one giant
   * query that PostgREST would silently cap at 1000 rows.
   */
  articles: TimelineArticle[] | null;
  locked: boolean;
}

const TOP_N = 5;

/**
 * Top-N headlines for one day: negative-framed (newest first), then positive, then - for days
 * whose articles carry no sentiment (reconstructed history) - the day's newest items.
 */
async function loadDayHeadlines(conflictDay: number): Promise<TimelineArticle[]> {
  const supabase = createClient();
  const out: TimelineArticle[] = [];
  const passes: ((q: ReturnType<typeof base>) => ReturnType<typeof base>)[] = [
    (q) => q.eq('sentiment', 'negative'),
    (q) => q.eq('sentiment', 'positive'),
    (q) => q.or('sentiment.is.null,sentiment.eq.neutral'),
  ];
  function base() {
    return supabase
      .from('articles')
      .select('title, source_name, url')
      .eq('conflict_day', conflictDay)
      .order('published_at', { ascending: false });
  }
  // The three passes are independent: run them in parallel, then take the first TOP_N in order.
  const results = await Promise.all(passes.map((apply) => apply(base()).limit(TOP_N)));
  for (const { data, error } of results) {
    if (error) throw error;
    for (const a of (data ?? []) as { title: string | null; source_name: string | null; url: string | null }[]) {
      if (out.length < TOP_N) out.push({ title: a.title ?? '', source_name: a.source_name, url: a.url });
    }
  }
  return out;
}

export function TimelineDayBlock({ conflictDay, dateLabel, scenario, articles: prefetched, locked }: TimelineDayBlockProps) {
  const ref = useRef<HTMLElement>(null);
  const [loaded, setLoaded] = useState<TimelineArticle[] | null>(null);
  const [failed, setFailed] = useState(false);
  const articles = prefetched ?? loaded;

  useEffect(() => {
    if (prefetched !== null || locked || loaded !== null) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const start = () => {
      loadDayHeadlines(conflictDay)
        .then((r) => { if (!cancelled) setLoaded(r); })
        .catch(() => { if (!cancelled) setFailed(true); });
    };
    if (typeof IntersectionObserver === 'undefined') {
      start();
      return () => { cancelled = true; };
    }
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        io.disconnect();
        start();
      }
    }, { rootMargin: '600px 0px' });
    io.observe(el);
    return () => { cancelled = true; io.disconnect(); };
  }, [prefetched, locked, loaded, conflictDay]);

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
        {locked ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            Headline articles for this day are available on the Informed plan.
          </p>
        ) : articles === null ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {failed ? 'Headlines could not be loaded for this day.' : 'Loading headlines\u2026'}
          </p>
        ) : articles.length === 0 ? (
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            No articles recorded for this day.
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
      ref={ref}
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
