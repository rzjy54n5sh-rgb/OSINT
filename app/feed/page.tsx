import { pageMetadata } from '@/lib/site';
import { createPublicClient, getConflictDay } from '@/utils/supabase/server';
import type { Article } from '@/types/supabase';
import type { Metadata } from 'next';
import FeedClient from './FeedClient';

/** ISR: articles are collected hourly; FeedClient keeps its own live client-side refresh. */
export const revalidate = 300;

export const metadata: Metadata = pageMetadata({
  title: 'Live Intelligence Feed · MENA Intel Desk',
  description:
    'Open-source articles from wire services, broadcasters and official feeds, filterable by region, sentiment framing and conflict day. Each item links to its original source.',
  path: '/feed',
});

export default async function FeedPage() {
  let initialArticles: Article[] = [];
  let initialConflictDay: number | null = null;

  try {
    const supabase = createPublicClient();
    const conflictDay = await getConflictDay();

    initialConflictDay = conflictDay;

    const { data } = await supabase
      .from('articles')
      .select('*')
      .order('published_at', { ascending: false })
      .limit(50);

    if (data) {
      initialArticles = data as Article[];
    }
  } catch {
    // Server fetch failed — FeedClient will fall back to client-side loading
  }

  return (
    <FeedClient
      initialArticles={initialArticles}
      initialConflictDay={initialConflictDay}
    />
  );
}
