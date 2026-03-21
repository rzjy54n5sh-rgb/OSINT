'use client';

import { useState } from 'react';
import { revokeApiKeyAction } from '@/app/(admin)/admin/api-keys/actions';

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function ApiKeysClient({
  keys,
  emailByUserId,
  role,
}: {
  keys: { id: string; key_prefix: string; user_id: string; name: string; last_used_at: string | null; request_count: number; is_revoked: boolean }[];
  emailByUserId: Record<string, string>;
  role: string;
}) {
  const [revoking, setRevoking] = useState<string | null>(null);
  const [newKeyModal, setNewKeyModal] = useState<{ key: string; keyId: string; keyPrefix: string } | null>(null);
  const [generating, setGenerating] = useState(false);

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this API key? It will stop working immediately.')) return;
    setRevoking(id);
    await revokeApiKeyAction(id);
    setRevoking(null);
    window.location.reload();
  };

  const handleGenerateTestKey = async () => {
    setGenerating(true);
    try {
      const { createClient } = await import('@/utils/supabase/client');
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token || !BASE || !ANON_KEY) {
        alert('Not authenticated or missing env');
        return;
      }
      const res = await fetch(`${BASE}/functions/v1/manage-api-keys`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      });
      const data = (await res.json()) as { key?: string; keyId?: string; keyPrefix?: string; error?: string };
      if (data?.key) setNewKeyModal({ key: data.key, keyId: data.keyId ?? '', keyPrefix: data.keyPrefix ?? '' });
      else alert(data?.error || 'Failed to create key');
    } finally {
      setGenerating(false);
    }
  };

  const copyOnce = (key: string) => {
    navigator.clipboard.writeText(key);
    alert('Key copied. It will not be shown again.');
  };

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>API Keys</h1>
      {role === 'SUPER_ADMIN' && (
        <div className="mb-6">
          <button type="button" onClick={handleGenerateTestKey} disabled={generating} className="font-mono text-xs px-3 py-1.5 rounded border" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
            Generate test key
          </button>
        </div>
      )}
      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">Key prefix</th>
              <th className="text-left p-2">Owner</th>
              <th className="text-left p-2">Name</th>
              <th className="text-left p-2">Last used</th>
              <th className="text-left p-2">Requests</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {keys.map((k) => (
              <tr key={k.id}>
                <td className="p-2">{k.key_prefix}…</td>
                <td className="p-2">{emailByUserId[k.user_id] ?? k.user_id}</td>
                <td className="p-2">{k.name}</td>
                <td className="p-2">{k.last_used_at ? new Date(k.last_used_at).toLocaleString() : '—'}</td>
                <td className="p-2">{k.request_count}</td>
                <td className="p-2">{k.is_revoked ? 'Revoked' : 'Active'}</td>
                <td className="p-2">
                  {!k.is_revoked && (
                    <button type="button" onClick={() => handleRevoke(k.id)} disabled={!!revoking} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {newKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => setNewKeyModal(null)}>
          <div className="rounded border p-6 max-w-md w-full font-mono text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }} onClick={(e) => e.stopPropagation()}>
            <p className="mb-2" style={{ color: 'var(--text-muted)' }}>Test key (copy once — not shown again):</p>
            <code className="block p-2 rounded break-all mb-4" style={{ background: 'rgba(0,0,0,0.3)', color: 'var(--accent-gold)' }}>{newKeyModal.key}</code>
            <button type="button" onClick={() => copyOnce(newKeyModal.key)} className="px-3 py-1.5 rounded border mr-2" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
              Copy
            </button>
            <button type="button" onClick={() => setNewKeyModal(null)} className="px-3 py-1.5 rounded border" style={{ borderColor: 'var(--border)' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
