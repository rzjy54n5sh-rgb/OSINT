import { createClient, getConflictDay } from '@/utils/supabase/server';
import type { Article } from '@/types/supabase';
import FeedClient from './FeedClient';

export default async function FeedPage() {
  let initialArticles: Article[] = [];
  let initialConflictDay: number | null = null;

  try {
    const [supabase, conflictDay] = await Promise.all([
      createClient(),
      getConflictDay(),
    ]);

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
