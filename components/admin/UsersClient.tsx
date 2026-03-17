'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import {
  listUsers,
  getUserDetail,
  setUserTier,
  suspendUser,
  unsuspendUser,
} from '@/lib/api/admin/users';
import type { User, UserTier } from '@/types';
import type { UserDetailResponse } from '@/types';

function initials(email: string, displayName?: string): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0];
  return local.slice(0, 2).toUpperCase();
}

function tierStyle(tier: string): React.CSSProperties {
  if (tier === 'professional') return { borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' };
  if (tier === 'informed') return { borderColor: '#1E90FF', color: '#1E90FF' };
  return { borderColor: '#4A5568', color: '#4A5568' };
}

export function UsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [tierBreakdown, setTierBreakdown] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [tier, setTier] = useState('');
  const [provider, setProvider] = useState('');
  const [suspended, setSuspended] = useState('');
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<UserDetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [setTierModal, setSetTierModal] = useState<{ user: User; newTier: User['tier'] } | null>(null);
  const [suspendModal, setSuspendModal] = useState<{ user: User; reason: string } | null>(null);

  const supabase = createClient();

  const fetchUsers = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    setLoading(true);
    try {
      const res = await listUsers(
        { search: search || undefined, tier: (tier || undefined) as UserTier | undefined, provider: provider || undefined, suspended: (suspended || undefined) as 'true' | 'false' | undefined, page, limit: 50 },
        session.access_token
      );
      setUsers(res.users ?? []);
      setTotal(res.total ?? 0);
      setTierBreakdown((res as { tierBreakdown?: Record<string, number> }).tierBreakdown ?? {});
    } finally {
      setLoading(false);
    }
  }, [supabase.auth, search, tier, provider, suspended, page]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const getToken = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const openDetail = async (user: User) => {
    setDetailLoading(true);
    setDetail(null);
    const token = await getToken();
    if (!token) return;
    try {
      const data = await getUserDetail(user.id, token);
      setDetail(data);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleSetTier = async () => {
    if (!setTierModal) return;
    const token = await getToken();
    if (!token) return;
    await setUserTier(setTierModal.user.id, setTierModal.newTier, token);
    setSetTierModal(null);
    if (detail?.user.id === setTierModal.user.id) {
      const data = await getUserDetail(setTierModal.user.id, token);
      setDetail(data);
    }
    fetchUsers();
  };

  const handleSuspend = async () => {
    if (!suspendModal || !suspendModal.reason.trim()) return;
    const token = await getToken();
    if (!token) return;
    await suspendUser(suspendModal.user.id, suspendModal.reason.trim(), token);
    setSuspendModal(null);
    if (detail?.user.id === suspendModal.user.id) {
      const data = await getUserDetail(suspendModal.user.id, token);
      setDetail(data);
    }
    fetchUsers();
  };

  const handleUnsuspend = async (user: User) => {
    if (!confirm(`Unsuspend ${user.email}?`)) return;
    const token = await getToken();
    if (!token) return;
    await unsuspendUser(user.id, token);
    setDetail(null);
    fetchUsers();
  };

  const totalFree = tierBreakdown.free ?? 0;
  const totalInformed = tierBreakdown.informed ?? 0;
  const totalPro = tierBreakdown.professional ?? 0;
  const totalSuspended = users.filter((u) => u.is_suspended).length;

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>
        Platform Users
      </h1>

      <div className="flex flex-wrap gap-4 mb-4">
        <span className="font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>Total {total}</span>
        <span className="font-mono text-xs" style={{ color: '#4A5568' }}>Free {totalFree}</span>
        <span className="font-mono text-xs" style={{ color: '#1E90FF' }}>Informed {totalInformed}</span>
        <span className="font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>Professional {totalPro}</span>
        <span className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>Suspended {totalSuspended}</span>
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <input
          type="text"
          placeholder="Search email or name"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent w-48"
          style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
        />
        <select value={tier} onChange={(e) => setTier(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All tiers</option>
          <option value="free">Free</option>
          <option value="informed">Informed</option>
          <option value="professional">Professional</option>
        </select>
        <select value={provider} onChange={(e) => setProvider(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All providers</option>
          <option value="email">Email</option>
          <option value="google">Google</option>
          <option value="github">GitHub</option>
          <option value="apple">Apple</option>
          <option value="azure">Azure</option>
        </select>
        <select value={suspended} onChange={(e) => setSuspended(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All</option>
          <option value="false">Active</option>
          <option value="true">Suspended</option>
        </select>
      </div>

      {loading ? (
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      ) : (
        <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
          <table className="w-full font-mono text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                <th className="text-left p-2">Avatar</th>
                <th className="text-left p-2">Email</th>
                <th className="text-left p-2">Tier</th>
                <th className="text-left p-2">Provider</th>
                <th className="text-left p-2">Country</th>
                <th className="text-left p-2">Joined</th>
                <th className="text-left p-2">Last seen</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--text-secondary)' }}>
              {users.map((u) => (
                <tr key={u.id} className="cursor-pointer hover:bg-white/5" onClick={() => openDetail(u)}>
                  <td className="p-2">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center border" style={{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>
                      {initials(u.email, u.display_name)}
                    </span>
                  </td>
                  <td className="p-2">{u.email}</td>
                  <td className="p-2">
                    <span className="px-2 py-0.5 border rounded text-[10px]" style={tierStyle(u.tier)}>
                      {u.tier === 'professional' ? '◆ PRO' : u.tier.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-2">{u.auth_provider}</td>
                  <td className="p-2">{(u as { country_code?: string }).country_code ?? '—'}</td>
                  <td className="p-2">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="p-2">{(u as { last_seen_at?: string }).last_seen_at ? new Date((u as { last_seen_at: string }).last_seen_at).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailLoading && (
        <div className="fixed right-0 top-0 bottom-0 w-96 border-l p-6 overflow-y-auto z-40" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
        </div>
      )}

      {detail && !detailLoading && (
        <div className="fixed right-0 top-0 bottom-0 w-96 border-l p-6 overflow-y-auto z-40" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }}>
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-mono text-xs uppercase" style={{ color: 'var(--text-muted)' }}>User detail</h2>
            <button type="button" onClick={() => setDetail(null)} className="font-mono text-[10px]" style={{ color: 'var(--text-muted)' }}>✕</button>
          </div>
          <div className="space-y-4 font-mono text-xs">
            <div className="flex items-center gap-2">
              <span className="w-10 h-10 rounded-full flex items-center justify-center border" style={{ borderColor: 'var(--border)' }}>
                {initials(detail.user.email, detail.user.display_name)}
              </span>
              <div>
                <p style={{ color: 'var(--text-primary)' }}>{detail.user.display_name || detail.user.email}</p>
                <p style={{ color: 'var(--text-muted)' }}>{detail.user.email}</p>
              </div>
            </div>
            <p style={{ color: 'var(--text-muted)' }}>Provider: {detail.user.auth_provider} · Tier: {detail.user.tier} ({detail.user.tier_source})</p>
            <p style={{ color: 'var(--text-muted)' }}>Joined {new Date(detail.user.created_at).toLocaleDateString()}</p>
            {detail.user.is_suspended && <p style={{ color: 'var(--accent-red)' }}>Suspended</p>}
            {detail.subscriptions?.length > 0 && (
              <div>
                <p className="uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Subscription</p>
                <p style={{ color: 'var(--text-secondary)' }}>
                  {detail.subscriptions[0].plan} · {detail.subscriptions[0].currency} · {detail.subscriptions[0].current_period_end ? new Date(detail.subscriptions[0].current_period_end).toLocaleDateString() : '—'}
                </p>
              </div>
            )}
            {detail.payments?.length > 0 && (
              <div>
                <p className="uppercase mb-1" style={{ color: 'var(--text-muted)' }}>Recent payments</p>
                <ul className="space-y-1">
                  {detail.payments.slice(0, 5).map((p) => (
                    <li key={p.id} style={{ color: 'var(--text-secondary)' }}>{p.currency} {p.amount} · {p.status}</li>
                  ))}
                </ul>
              </div>
            )}
            {detail.apiKeys && detail.apiKeys.length > 0 && (
              <div>
                <p className="uppercase mb-1" style={{ color: 'var(--text-muted)' }}>API Keys</p>
                <ul className="space-y-1">
                  {detail.apiKeys.map((k) => (
                    <li key={k.id} style={{ color: 'var(--text-secondary)' }}>{k.key_prefix}… {k.is_revoked ? '(revoked)' : ''}</li>
                  ))}
                </ul>
              </div>
            )}
            <div className="flex flex-wrap gap-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
              <button type="button" onClick={() => setSetTierModal({ user: detail.user, newTier: detail.user.tier })} className="font-mono text-xs px-3 py-2 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                Set Tier
              </button>
              {detail.user.is_suspended ? (
                <button type="button" onClick={() => handleUnsuspend(detail.user)} className="font-mono text-xs px-3 py-2 border rounded-sm" style={{ borderColor: 'var(--accent-green)', color: 'var(--accent-green)' }}>
                  Unsuspend
                </button>
              ) : (
                <button type="button" onClick={() => setSuspendModal({ user: detail.user, reason: '' })} className="font-mono text-xs px-3 py-2 border rounded-sm" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
                  Suspend
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {setTierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setSetTierModal(null)}>
          <div className="p-6 rounded border max-w-sm w-full" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>
              Change {setTierModal.user.email} from {setTierModal.user.tier} to:
            </p>
            <select value={setTierModal.newTier} onChange={(e) => setSetTierModal((m) => m && { ...m, newTier: e.target.value as User['tier'] })} className="font-mono text-xs w-full px-2 py-2 rounded border mb-4 bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
              <option value="free">free</option>
              <option value="informed">informed</option>
              <option value="professional">professional</option>
            </select>
            <p className="font-mono text-[10px] mb-4" style={{ color: 'var(--text-muted)' }}>This is a manual override.</p>
            <div className="flex gap-2">
              <button type="button" onClick={handleSetTier} className="font-mono text-xs px-4 py-2 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>Confirm</button>
              <button type="button" onClick={() => setSetTierModal(null)} className="font-mono text-xs px-4 py-2 border rounded-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {suspendModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setSuspendModal(null)}>
          <div className="p-6 rounded border max-w-sm w-full" style={{ background: 'var(--bg)', borderColor: 'var(--border)' }} onClick={(e) => e.stopPropagation()}>
            <p className="font-mono text-xs mb-2" style={{ color: 'var(--text-secondary)' }}>Suspend {suspendModal.user.email}</p>
            <label className="block font-mono text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Reason (required)</label>
            <textarea value={suspendModal.reason} onChange={(e) => setSuspendModal((m) => m && { ...m, reason: e.target.value })} className="font-mono text-xs w-full px-2 py-2 rounded border mb-4 bg-transparent resize-none" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }} rows={3} />
            <div className="flex gap-2">
              <button type="button" onClick={handleSuspend} disabled={!suspendModal.reason.trim()} className="font-mono text-xs px-4 py-2 border rounded-sm disabled:opacity-50" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>Confirm</button>
              <button type="button" onClick={() => setSuspendModal(null)} className="font-mono text-xs px-4 py-2 border rounded-sm" style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
