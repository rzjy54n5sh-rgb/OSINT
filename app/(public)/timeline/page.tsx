import { getUser } from '@/utils/supabase/server';
import { createClient } from '@/utils/supabase/server';
import { formatConflictDayDate } from '@/lib/conflict-calendar';
import { ConflictDayBadge } from '@/components/ui/ConflictDayBadge';
import { TimelineDayNav } from '@/components/timeline/TimelineDayNav';
import { TimelineDayBlock, type TimelineArticle } from '@/components/timeline/TimelineDayBlock';

export const metadata = {
  title: 'Conflict Timeline · MENA Intel Desk',
  description:
    'Day-by-day chronology of the conflict from Day 1 — headline articles and scenario probabilities, with source links.',
};

type ArticleRow = {
  title: string;
  source_name: string | null;
  country: string | null;
  sentiment: string | null;
  conflict_day: number;
  published_at: string | null;
  url: string | null;
};

type ScenarioRow = {
  conflict_day: number;
  scenario_a: number;
  scenario_b: number;
  scenario_c: number;
  scenario_d: number;
};

function sentimentRank(s: string | null): number {
  if (s === 'negative') return 2;
  if (s === 'positive') return 1;
  return 0;
}

function groupTopArticlesPerDay(rows: ArticleRow[], topN: number): Map<number, TimelineArticle[]> {
  const byDay = new Map<number, ArticleRow[]>();
  for (const r of rows) {
    const d = r.conflict_day;
    if (d == null || !Number.isFinite(d)) continue;
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d)!.push(r);
  }
  const out = new Map<number, TimelineArticle[]>();
  for (const [d, list] of byDay) {
    const sorted = [...list].sort((a, b) => {
      const sr = sentimentRank(b.sentiment) - sentimentRank(a.sentiment);
      if (sr !== 0) return sr;
      return new Date(b.published_at ?? 0).getTime() - new Date(a.published_at ?? 0).getTime();
    });
    out.set(
      d,
      sorted.slice(0, topN).map((a) => ({
        title: a.title ?? '',
        source_name: a.source_name,
        url: a.url,
      }))
    );
  }
  return out;
}

export default async function ConflictTimelinePage() {
  const [user, supabase] = await Promise.all([getUser(), createClient()]);
  const isFreeTier = !user || user.tier === 'free';

  const [{ data: rawArticles }, { data: scenarios }] = await Promise.all([
    supabase
      .from('articles')
      .select('title, source_name, country, sentiment, conflict_day, published_at, url')
      .in('sentiment', ['negative', 'positive'])
      .order('conflict_day', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(200),
    supabase
      .from('scenario_probabilities')
      .select('conflict_day, scenario_a, scenario_b, scenario_c, scenario_d')
      .order('conflict_day', { ascending: true }),
  ]);

  const articles = (rawArticles ?? []) as ArticleRow[];
  const scenarioRows = (scenarios ?? []) as ScenarioRow[];

  const articlesByDay = groupTopArticlesPerDay(articles, 5);

  const scenarioMap = new Map<number, ScenarioRow>();
  for (const s of scenarioRows) {
    scenarioMap.set(s.conflict_day, s);
  }

  const maxFromScenarios = scenarioRows.length
    ? Math.max(...scenarioRows.map((s) => s.conflict_day))
    : 0;
  const maxFromArticles = articles.length ? Math.max(...articles.map((a) => a.conflict_day)) : 0;
  const maxDay = Math.max(maxFromScenarios, maxFromArticles, 1);

  const dayNumbers = Array.from({ length: maxDay }, (_, i) => i + 1);
  const daysNewestFirst = [...dayNumbers].reverse();

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="font-display text-3xl mb-2" style={{ color: 'var(--text-primary)' }}>
        CONFLICT TIMELINE
      </h1>
      <ConflictDayBadge />
      <p className="font-mono text-xs mb-2 max-w-2xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
        Headline articles (negative / positive sentiment) and daily scenario probabilities — newest days first. Deep link
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
            articles={articlesByDay.get(d) ?? []}
            locked={isFreeTier && d > 7}
          />
        ))}
      </div>
    </div>
  );
}
