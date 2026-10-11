import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';
import { getUser } from '@/utils/supabase/server';
import { createClient } from '@/utils/supabase/server';
import { currentConflictDay, formatConflictDayDate } from '@/lib/conflict-calendar';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { TimelineDayNav } from '@/components/timeline/TimelineDayNav';
import { TimelineDayBlock, type TimelineArticle } from '@/components/timeline/TimelineDayBlock';

export const metadata: Metadata = pageMetadata({
  title: 'Conflict Timeline · MENA Intel Desk',
  description:
    'Day-by-day chronology of the conflict from Day 1 — headline articles and scenario probabilities, with source links.',
  path: '/timeline',
});

type ArticleRow = {
  title: string;
  source_name: string | null;
  conflict_day: number;
  url: string | null;
};

type ScenarioRow = {
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
};

/** Newest days whose headlines are prefetched in ONE query; older days load on scroll. */
const PREFETCH_DAYS = 4;
const PAGE_ROWS = 1000; // PostgREST max rows per request

export default async function ConflictTimelinePage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const isFreeTier = !user || user.tier === 'free';

  const calendarDay = currentConflictDay();

  const { data: scenarios } = await supabase
    .from('scenario_probabilities')
    .select('conflict_day, scenario_a, scenario_b, scenario_c, scenario_d')
    .order('conflict_day', { ascending: true })
    .range(0, PAGE_ROWS - 1);
  const scenarioRows = (scenarios ?? []) as ScenarioRow[];

  const scenarioMap = new Map<number, ScenarioRow>();
  for (const s of scenarioRows) scenarioMap.set(s.conflict_day, s);

  // Every day 1..today is listed. Day = calendar day (DAY LOCK) unless scenarios are ahead.
  const maxFromScenarios = scenarioRows.length ? Math.max(...scenarioRows.map((s) => s.conflict_day)) : 0;
  const maxDay = Math.max(calendarDay, maxFromScenarios, 1);

  // Prefetch the newest PREFETCH_DAYS unlocked days in one query. Order (day desc, sentiment asc,
  // newest first) makes the first rows of each day its exact top-5: negatives, then positives.
  // A day the 1000-row cap cuts off entirely gets `null` and loads itself on scroll.
  const prefetchFrom = Math.max(1, maxDay - PREFETCH_DAYS + 1);
  const { data: rawArticles } = await supabase
    .from('articles')
    .select('title, source_name, conflict_day, url')
    .gte('conflict_day', prefetchFrom)
    .in('sentiment', ['negative', 'positive'])
    .order('conflict_day', { ascending: false })
    .order('sentiment', { ascending: true })
    .order('published_at', { ascending: false })
    .range(0, PAGE_ROWS - 1);
  const prefetched = new Map<number, TimelineArticle[]>();
  const rows = (rawArticles ?? []) as ArticleRow[];
  for (const r of rows) {
    const list = prefetched.get(r.conflict_day) ?? [];
    if (list.length < 5) list.push({ title: r.title ?? '', source_name: r.source_name, url: r.url });
    prefetched.set(r.conflict_day, list);
  }

  // Days with fewer than 5 sentiment-tagged rows are topped up client-side (newest items), so
  // let them load themselves rather than show a short list.
  for (const [d, list] of [...prefetched]) if (list.length < 5) prefetched.delete(d);

  // If the cap was hit, the oldest returned day may be cut short: let it load itself instead.
  if (rows.length >= PAGE_ROWS && rows.length > 0) prefetched.delete(rows[rows.length - 1].conflict_day);

  const dayNumbers = Array.from({ length: maxDay }, (_, i) => i + 1);
  const daysNewestFirst = [...dayNumbers].reverse();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        CONFLICT TIMELINE
      </h1>
      <ConflictDayBadge />
      <p className="font-mono text-xs mb-2 max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Headline articles (negative / positive framing first, otherwise the day’s newest items) and daily scenario probabilities — newest days first. Deep link
        to any day: <span style={{ color: 'var(--text-muted)' }}>/timeline#day-15</span>
      </p>
      {isFreeTier && (
        <p className="font-mono text-[11px] mb-6" style={{ color: 'var(--accent-gold)' }}>
          ◆ Days 1–7 are free. Days 8+ require Informed.
        </p>
      )}

      <TimelineDayNav dayNumbers={dayNumbers} />

      <div className="mt-2">
        {daysNewestFirst.map((d) => (
          <TimelineDayBlock
            key={d}
            conflictDay={d}
            dateLabel={formatConflictDayDate(d)}
            scenario={scenarioMap.get(d) ?? null}
            articles={isFreeTier && d > 7 ? null : prefetched.get(d) ?? null}
            locked={isFreeTier && d > 7}
          />
        ))}
      </div>
    </div>
  );
}
