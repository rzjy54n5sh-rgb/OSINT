'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/utils/supabase/client';
import { getAuditLog } from '@/lib/api/admin/audit';
import type { AuditLogEntry } from '@/types';

const LIMIT = 50;

export function AuditClient({ role, actionTypes }: { role: string; actionTypes: string[] }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionType, setActionType] = useState('');
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [aiOnly, setAiOnly] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);
  const isSa = role === 'SUPER_ADMIN';

  const load = useCallback(async (pageNum?: number) => {
    if (!token) return;
    setLoading(true);
    const p = pageNum ?? page;
    try {
      const res = await getAuditLog(
        { action_type: actionType || undefined, since: since || undefined, until: until || undefined, ai_only: aiOnly, page: p, limit: LIMIT },
        token
      );
      setEntries(res.entries ?? []);
      setTotal((res as { total?: number }).total ?? res.entries?.length ?? 0);
      if (pageNum != null) setPage(pageNum);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [token, actionType, since, until, aiOnly, page]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => setToken(session?.access_token ?? null));
  }, []);

  useEffect(() => {
    if (token) load();
  }, [token, load]);

  const exportCsv = () => {
    const headers = ['id', 'admin_email', 'admin_role', 'action_type', 'action_summary', 'target_type', 'target_id', 'created_at', 'is_ai_request'];
    const rows = entries.map((e) => [e.id, e.admin_email, e.admin_role, e.action_type, e.action_summary, e.target_type ?? '', e.target_id ?? '', e.created_at, e.is_ai_request].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const entryWithExtras = entries as (AuditLogEntry & { ip_address?: string; before_state?: unknown; after_state?: unknown; ai_prompt?: string; ai_proposal?: string; created_at?: string })[];

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Audit Log</h1>
      <div className="flex flex-wrap gap-2 mb-6 items-center">
        <select value={actionType} onChange={(e) => setActionType(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All action types</option>
          {actionTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <input type="date" value={since} onChange={(e) => setSince(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)' }} />
        <input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)' }} />
        <label className="flex items-center gap-1 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={aiOnly} onChange={(e) => setAiOnly(e.target.checked)} />
          AI only
        </label>
        <button type="button" onClick={() => load(1)} className="font-mono text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
          Apply
        </button>
        {isSa && (
          <button type="button" onClick={exportCsv} className="font-mono text-xs px-3 py-1.5 rounded border ml-auto" style={{ borderColor: 'var(--border)' }}>
            Export CSV
          </button>
        )}
      </div>
      {loading ? (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full font-mono text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                <th className="text-left p-2">Time</th>
                <th className="text-left p-2">Admin</th>
                <th className="text-left p-2">Action</th>
                <th className="text-left p-2">Summary</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--text-secondary)' }}>
              {entryWithExtras.map((e) => (
                <React.Fragment key={e.id}>
                  <tr
                    className="cursor-pointer hover:bg-white/5"
                    style={e.is_ai_request ? { background: 'rgba(107,33,168,0.15)' } : undefined}
                    onClick={() => setExpandedId(expandedId === e.id ? null : e.id)}
                  >
                    <td className="p-2">{e.created_at ? new Date(e.created_at).toLocaleString() : '—'}</td>
                    <td className="p-2">{e.admin_email}</td>
                    <td className="p-2">{e.action_type}</td>
                    <td className="p-2">{e.action_summary.slice(0, 60)}{e.action_summary.length > 60 ? '…' : ''}</td>
                  </tr>
                  {expandedId === e.id && (
                    <tr>
                      <td colSpan={4} className="p-4 border-t" style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.2)' }}>
                        <div className="space-y-2 font-mono text-xs">
                          <p><strong>Summary:</strong> {e.action_summary}</p>
                          {e.target_type && <p><strong>Target:</strong> {e.target_type} {e.target_id ?? ''}</p>}
                          {e.before_state != null && <p><strong>Before:</strong> <pre className="whitespace-pre-wrap break-all">{JSON.stringify(e.before_state)}</pre></p>}
                          {e.after_state != null && <p><strong>After:</strong> <pre className="whitespace-pre-wrap break-all">{JSON.stringify(e.after_state)}</pre></p>}
                          {e.ip_address && <p><strong>IP:</strong> {e.ip_address}</p>}
                          {e.is_ai_request && e.ai_prompt && <p><strong>AI prompt:</strong> {e.ai_prompt}</p>}
                          {e.is_ai_request && e.ai_proposal && <p><strong>AI proposal:</strong> {e.ai_proposal}</p>}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="flex justify-between items-center mt-4 font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
        <span>Page {page} — {total} total</span>
        <div className="gap-2 flex">
          <button type="button" onClick={() => load(Math.max(1, page - 1))} disabled={page <= 1}>Previous</button>
          <button type="button" onClick={() => load(page + 1)} disabled={entries.length < LIMIT}>Next</button>
        </div>
      </div>
    </div>
  );
}
