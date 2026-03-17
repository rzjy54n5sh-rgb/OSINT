'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listSources,
  addSource,
  editSource,
  toggleSource,
  deleteSource,
  testFeedUrl,
} from '@/lib/api/admin/sources';
import type { ArticleSource } from '@/types';

const LANGUAGES = ['', 'en', 'ar', 'fa', 'fr', 'he'];
const CATEGORIES = ['', 'general', 'iran', 'gulf', 'egypt', 'uae', 'israel', 'lebanon', 'iraq', 'yemen', 'global', 'market', 'social'];

function healthColor(h: string): string {
  if (h === 'active') return 'var(--accent-green)';
  if (h === 'failing') return 'var(--accent-red)';
  if (h === 'timeout') return 'var(--accent-orange)';
  return 'var(--text-muted)';
}

export function SourcesClient() {
  const [sources, setSources] = useState<ArticleSource[]>([]);
  const [healthSummary, setHealthSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('');
  const [category, setCategory] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'party' | 'independent'>('all');
  const [search, setSearch] = useState('');
  const [healthFilter, setHealthFilter] = useState('');
  const [panel, setPanel] = useState<'add' | 'edit' | null>(null);
  const [editingSource, setEditingSource] = useState<ArticleSource | null>(null);
  const [testResult, setTestResult] = useState<{ success: boolean; isValidFeed?: boolean; message?: string } | null>(null);
  const [testPassed, setTestPassed] = useState(false);
  const [form, setForm] = useState<Partial<ArticleSource>>({
    display_name: '',
    name: '',
    url: '',
    rss_url: '',
    language: 'en',
    category: 'general',
    is_party_source: false,
    party_affiliation: '',
    neutrality_note: '',
    fetch_interval_minutes: 60,
    use_google_news_proxy: false,
  });

  const supabase = createClient();

  const fetchSources = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await listSources(
        {
          language: language || undefined,
          category: category || undefined,
          health: healthFilter || undefined,
          is_party_source: typeFilter === 'party' ? true : typeFilter === 'independent' ? false : undefined,
          search: search || undefined,
        },
        session.access_token
      );
      setSources(res.sources ?? []);
      setHealthSummary((res as { healthSummary?: Record<string, number> }).healthSummary ?? {});
    } finally {
      setLoading(false);
    }
  }, [supabase.auth, language, category, healthFilter, typeFilter, search]);

  useEffect(() => {
    fetchSources();
  }, [fetchSources]);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const handleTestFeed = async (overrideUrl?: string) => {
    const url = overrideUrl ?? (form.rss_url || form.url);
    if (!url) return;
    const token = await getToken();
    if (!token) return;
    setTestResult(null);
    try {
      const res = await testFeedUrl(url, form.use_google_news_proxy ?? false, token);
      setTestResult({
        success: res.success,
        isValidFeed: (res as { isValidFeed?: boolean }).isValidFeed,
        message: (res as { message?: string }).message ?? (res as { error?: string }).error,
      });
      setTestPassed(!!(res.success && (res as { isValidFeed?: boolean }).isValidFeed));
    } catch {
      setTestResult({ success: false, message: 'Request failed' });
      setTestPassed(false);
    }
  };

  const handleAddSource = async () => {
    if (!form.display_name?.trim() || !form.url?.trim()) return;
    const token = await getToken();
    if (!token) return;
    try {
      await addSource(
        {
          name: form.name?.trim() || form.display_name!.trim().toLowerCase().replace(/\s+/g, '_'),
          display_name: form.display_name.trim(),
          url: form.url.trim(),
          rss_url: (form.rss_url || form.url)?.trim(),
          language: form.language || 'en',
          category: form.category || 'general',
          is_party_source: form.is_party_source ?? false,
          party_affiliation: form.party_affiliation?.trim(),
          neutrality_note: form.neutrality_note?.trim(),
          fetch_interval_minutes: form.fetch_interval_minutes ?? 60,
          use_google_news_proxy: form.use_google_news_proxy ?? false,
        },
        token
      );
      setPanel(null);
      setForm({ display_name: '', name: '', url: '', rss_url: '', language: 'en', category: 'general', is_party_source: false, fetch_interval_minutes: 60, use_google_news_proxy: false });
      setTestPassed(false);
      setTestResult(null);
      fetchSources();
    } catch (e) {
      console.error(e);
    }
  };

  const handleEditSave = async () => {
    if (!editingSource) return;
    const token = await getToken();
    if (!token) return;
    try {
      await editSource(editingSource.id, {
        display_name: form.display_name?.trim(),
        url: form.url?.trim(),
        rss_url: form.rss_url?.trim(),
        language: form.language,
        category: form.category,
        is_party_source: form.is_party_source,
        party_affiliation: form.party_affiliation?.trim(),
        neutrality_note: form.neutrality_note?.trim(),
        fetch_interval_minutes: form.fetch_interval_minutes,
        use_google_news_proxy: form.use_google_news_proxy,
      }, token);
      setPanel(null);
      setEditingSource(null);
      fetchSources();
    } catch (e) {
      console.error(e);
    }
  };

  const handleToggle = async (source: ArticleSource) => {
    const token = await getToken();
    if (!token) return;
    await toggleSource(source.id, !source.is_active, token);
    fetchSources();
  };

  const handleDelete = async (source: ArticleSource) => {
    if (!confirm(`Delete source "${source.display_name}"?`)) return;
    const token = await getToken();
    if (!token) return;
    await deleteSource(source.id, token);
    fetchSources();
  };

  const openEdit = (source: ArticleSource) => {
    setEditingSource(source);
    setForm({
      display_name: source.display_name,
      name: source.name,
      url: source.url,
      rss_url: source.rss_url,
      language: source.language,
      category: source.category,
      is_party_source: source.is_party_source,
      party_affiliation: source.party_affiliation,
      neutrality_note: source.neutrality_note,
      fetch_interval_minutes: 60,
      use_google_news_proxy: false,
    });
    setPanel('edit');
    setTestResult(null);
  };

  const filteredByHealth =
    healthFilter === 'disabled'
      ? sources.filter((s) => !s.is_active)
      : healthFilter
        ? sources.filter((s) => s.health_status === healthFilter)
        : sources;
  const activeCount = healthSummary.active ?? sources.filter((s) => s.health_status === 'active').length;
  const failingCount = healthSummary.failing ?? sources.filter((s) => s.health_status === 'failing').length;
  const timeoutCount = healthSummary.timeout ?? sources.filter((s) => s.health_status === 'timeout').length;
  const disabledCount = sources.filter((s) => !s.is_active).length;

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>
        RSS Sources
      </h1>

      <div className="flex flex-wrap gap-4 mb-4">
        <button
          type="button"
          onClick={() => setHealthFilter('')}
          className="font-mono text-xs px-3 py-1 rounded border"
          style={{ borderColor: healthFilter === '' ? 'var(--accent-gold)' : 'var(--border)', color: healthFilter === '' ? 'var(--accent-gold)' : 'var(--text-secondary)' }}
        >
          Active [{activeCount}]
        </button>
        <button
          type="button"
          onClick={() => setHealthFilter('failing')}
          className="font-mono text-xs px-3 py-1 rounded border"
          style={{ borderColor: healthFilter === 'failing' ? 'var(--accent-red)' : 'var(--border)', color: healthFilter === 'failing' ? 'var(--accent-red)' : 'var(--text-secondary)' }}
        >
          Failing [{failingCount}]
        </button>
        <button
          type="button"
          onClick={() => setHealthFilter('timeout')}
          className="font-mono text-xs px-3 py-1 rounded border"
          style={{ borderColor: healthFilter === 'timeout' ? 'var(--accent-orange)' : 'var(--border)', color: healthFilter === 'timeout' ? 'var(--accent-orange)' : 'var(--text-secondary)' }}
        >
          Timeout [{timeoutCount}]
        </button>
        <button
          type="button"
          onClick={() => setHealthFilter('disabled')}
          className="font-mono text-xs px-3 py-1 rounded border"
          style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}
        >
          Disabled [{disabledCount}]
        </button>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All</option>
          {LANGUAGES.filter(Boolean).map((l) => (
            <option key={l} value={l}>{l.toUpperCase()}</option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="">All</option>
          {CATEGORIES.filter(Boolean).map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | 'party' | 'independent')}
          className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        >
          <option value="all">All</option>
          <option value="independent">Independent</option>
          <option value="party">Party Source</option>
        </select>
        <input
          type="text"
          placeholder="Search name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent w-40"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <button
          type="button"
          onClick={() => { setPanel('add'); setForm({ display_name: '', name: '', url: '', rss_url: '', language: 'en', category: 'general', is_party_source: false, fetch_interval_minutes: 60, use_google_news_proxy: false }); setTestResult(null); setTestPassed(false); }}
          className="font-mono text-xs px-4 py-2 border rounded-sm"
          style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
        >
          + Add Source
        </button>
      </div>

      {loading ? (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full font-mono text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">Language</th>
                <th className="text-left p-2">Type</th>
                <th className="text-left p-2">Category</th>
                <th className="text-left p-2">Health</th>
                <th className="text-left p-2">Last Fetch</th>
                <th className="text-left p-2">Articles</th>
                <th className="text-left p-2">Actions</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--text-secondary)' }}>
              {filteredByHealth.map((s) => (
                <tr
                  key={s.id}
                  style={{
                    background: s.is_party_source ? 'rgba(232,197,71,0.04)' : undefined,
                    borderLeft: s.is_party_source ? '2px solid var(--accent-gold)' : undefined,
                  }}
                >
                  <td className="p-2">
                    {s.display_name}
                    {s.is_party_source && <span className="ml-1 text-[10px]" style={{ color: 'var(--accent-gold)' }}>PARTY</span>}
                  </td>
                  <td className="p-2">{s.language?.toUpperCase()}</td>
                  <td className="p-2">{s.is_party_source ? `PARTY SOURCE ${s.party_affiliation ?? ''}` : 'INDEPENDENT'}</td>
                  <td className="p-2">{s.category}</td>
                  <td className="p-2">
                    <span style={{ color: healthColor(s.health_status) }}>●</span> {s.health_status}
                  </td>
                  <td className="p-2">{s.last_fetch_at ? new Date(s.last_fetch_at).toLocaleString() : '—'}</td>
                  <td className="p-2">{s.total_articles_fetched ?? 0}</td>
                  <td className="p-2 flex gap-1">
                    <button type="button" onClick={() => openEdit(s)} className="font-mono text-[10px] px-1" style={{ color: 'var(--accent-gold)' }} title="Edit">✎</button>
                    <button type="button" onClick={() => handleTestFeed(s.rss_url || s.url)} className="font-mono text-[10px] px-1" style={{ color: 'var(--text-muted)' }} title="Test">⟳</button>
                    <button type="button" onClick={() => handleToggle(s)} className="font-mono text-[10px] px-1" style={{ color: 'var(--text-muted)' }} title="Toggle">{s.is_active ? 'On' : 'Off'}</button>
                    <button type="button" onClick={() => handleDelete(s)} className="font-mono text-[10px] px-1" style={{ color: 'var(--accent-red)' }} title="Delete">×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {panel && (
        <div
          className="fixed inset-0 z-50 flex justify-end"
          style={{ background: 'rgba(0,0,0,0.5)' }}
          onClick={() => { setPanel(null); setEditingSource(null); }}
        >
          <div
            className="w-full max-w-md h-full overflow-y-auto p-6 border-l"
            style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="font-mono text-xs uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
              {panel === 'add' ? 'Add Source' : 'Edit Source'}
            </h2>
            <div className="space-y-3 font-mono text-xs">
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Display Name *</label>
                <input value={form.display_name} onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>URL *</label>
                <input value={form.url} onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>RSS Feed URL</label>
                <input value={form.rss_url ?? ''} onChange={(e) => setForm((f) => ({ ...f, rss_url: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Language *</label>
                <select value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  {LANGUAGES.filter(Boolean).map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Category *</label>
                <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  {CATEGORIES.filter(Boolean).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.is_party_source ?? false} onChange={(e) => setForm((f) => ({ ...f, is_party_source: e.target.checked }))} />
                <span style={{ color: 'var(--text-secondary)' }}>Is Party Source</span>
              </div>
              {form.is_party_source && (
                <>
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Party Affiliation</label>
                    <input value={form.party_affiliation ?? ''} onChange={(e) => setForm((f) => ({ ...f, party_affiliation: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Neutrality Note</label>
                    <input value={form.neutrality_note ?? ''} onChange={(e) => setForm((f) => ({ ...f, neutrality_note: e.target.value }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
                  </div>
                </>
              )}
              <div>
                <label className="block mb-1" style={{ color: 'var(--text-muted)' }}>Fetch Interval (min)</label>
                <input type="number" value={form.fetch_interval_minutes ?? 60} onChange={(e) => setForm((f) => ({ ...f, fetch_interval_minutes: parseInt(e.target.value, 10) || 60 }))} className="w-full px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} />
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" checked={form.use_google_news_proxy ?? false} onChange={(e) => setForm((f) => ({ ...f, use_google_news_proxy: e.target.checked }))} />
                <span style={{ color: 'var(--text-secondary)' }}>Use Google News Proxy</span>
              </div>
              <button type="button" onClick={() => handleTestFeed()} className="font-mono text-xs px-3 py-2 border rounded-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                Test Feed
              </button>
              {testResult && (
                <p className="text-[10px]" style={{ color: testResult.success && testResult.isValidFeed ? 'var(--accent-green)' : 'var(--accent-orange)' }}>
                  {testResult.success && testResult.isValidFeed ? '✓ Valid RSS feed — reachable' : testResult.success ? '⚠ URL reachable but not RSS' : '✗ Cannot reach URL'}
                  {testResult.message && ` — ${testResult.message}`}
                </p>
              )}
              {panel === 'add' ? (
                <button type="button" onClick={handleAddSource} disabled={!testPassed} className="font-mono text-xs px-4 py-2 border rounded-sm disabled:opacity-50" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                  Add Source
                </button>
              ) : (
                <button type="button" onClick={handleEditSave} className="font-mono text-xs px-4 py-2 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                  Save
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
