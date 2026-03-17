'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { flagArticleForReviewAction } from '@/app/(admin)/admin/feed/actions';
import type { Article } from '@/types/supabase';

const CATEGORY_COLORS: Record<string, string> = {
  general: '#6B7280',
  iran: '#DC2626',
  gulf: '#2563EB',
  egypt: '#059669',
  uae: '#7C3AED',
  israel: '#D97706',
  market: '#EAB308',
};

export function FeedClient({
  role,
  sources,
}: {
  role: string;
  sources: { id: string; name: string; display_name: string; language: string; category: string }[];
}) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [sourceId, setSourceId] = useState('');
  const sourceName = sourceId || '';
  const [language, setLanguage] = useState('');
  const [category, setCategory] = useState('');
  const [flaggingId, setFlaggingId] = useState<string | null>(null);
  const canFlag = role === 'SUPER_ADMIN' || role === 'INTEL_ANALYST';

  const handleFlag = async (articleId: string) => {
    setFlaggingId(articleId);
    const res = await flagArticleForReviewAction(articleId);
    setFlaggingId(null);
    if (res.ok) {
      // Optional: show toast or refresh
    } else {
      alert(res.error ?? 'Failed to flag');
    }
  };

  const fetchArticles = () => {
    const supabase = createClient();
    let q = supabase.from('articles').select('*').order('published_at', { ascending: false }).limit(100);
    if (sourceName) q = q.eq('source_name', sourceName);
    if (language) q = q.eq('language', language);
    if (category) q = q.eq('region', category);
    void q.then(({ data }) => setArticles((data as Article[]) ?? []));
  };

  useEffect(() => {
    fetchArticles();
  }, [sourceName, language, category]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('admin-feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'articles' }, fetchArticles)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const languages = Array.from(new Set(sources.map((s) => s.language)));
  const categories = Array.from(new Set(sources.map((s) => s.category)));

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Live Feed</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All sources</option>
          {sources.map((s) => (
            <option key={s.id} value={s.name}>{s.display_name}</option>
          ))}
        </select>
        <select value={language} onChange={(e) => setLanguage(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
        <select value={category} onChange={(e) => setCategory(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="space-y-2 font-mono text-xs">
        {articles.map((a) => (
          <div key={a.id} className="p-3 rounded border flex items-center justify-between gap-4" style={{ borderColor: 'var(--border)', background: 'rgba(255,255,255,0.02)' }}>
            <div className="min-w-0 flex-1">
              <span className="inline-block px-2 py-0.5 rounded text-[10px] mr-2" style={{ background: CATEGORY_COLORS[(a as { region?: string }).region ?? 'general'] ?? '#4A5568', color: '#fff' }}>
                {a.source_name ?? (a as { region?: string }).region ?? '—'}
              </span>
              <span style={{ color: 'var(--text-primary)' }}>{a.title}</span>
              <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{(a as { language?: string }).language ?? '—'}</span>
              <span className="ml-2" style={{ color: 'var(--text-muted)' }}>{a.published_at ? new Date(a.published_at).toLocaleString() : '—'}</span>
            </div>
            {canFlag && (
              <button type="button" onClick={() => handleFlag(a.id)} disabled={!!flaggingId} className="font-mono text-[10px] px-2 py-1 border rounded-sm shrink-0" style={{ borderColor: 'var(--accent-orange)', color: 'var(--accent-orange)' }}>
                {flaggingId === a.id ? '…' : 'Flag'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
