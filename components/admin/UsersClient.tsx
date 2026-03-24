'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { adminFetch } from '@/lib/api/admin/client';
import type { User, UserTier, UserListResponse, UserDetailResponse } from '@/types';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

type StatusFilter = 'all' | 'active' | 'suspended' | 'banned';
type TierFilter = 'all' | 'free' | 'informed' | 'professional';
type SortOption = 'newest' | 'oldest' | 'most_spent' | 'last_active' | 'email_az';

interface UsersApiResponse {
  users: (User & { total_spent_usd?: number })[];
  total: number;
  stats?: {
    total: number;
    active: number;
    suspended: number;
    banned: number;
    pro: number;
  };
}

function getInitials(email: string, displayName?: string): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0];
  return local.slice(0, 2).toUpperCase();
}

function avatarBg(tier: UserTier): string {
  if (tier === 'professional') return '#C9A84C';
  if (tier === 'informed') return '#1E90FF';
  return '#4A5568';
}

function statusColor(user: User): { label: string; bg: string; text: string } {
  if ((user as { is_banned?: boolean }).is_banned) return { label: 'BANNED', bg: 'rgba(220,38,38,0.15)', text: '#EF4444' };
  if (user.is_suspended) return { label: 'SUSPENDED', bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' };
  return { label: 'ACTIVE', bg: 'rgba(34,197,94,0.15)', text: '#22C55E' };
}

function tierPill(tier: UserTier): { label: string; bg: string; text: string } {
  if (tier === 'professional') return { label: 'PRO', bg: 'rgba(201,168,76,0.15)', text: '#C9A84C' };
  if (tier === 'informed') return { label: 'INFORMED', bg: 'rgba(30,144,255,0.15)', text: '#1E90FF' };
  return { label: 'FREE', bg: 'rgba(74,85,104,0.15)', text: '#4A5568' };
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '--';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

function formatCurrency(amount?: number): string {
  if (amount === undefined || amount === null) return '$0.00';
  return `$${amount.toFixed(2)}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/*  Styles                                                             */
/* ------------------------------------------------------------------ */

const PAGE_SIZE = 20;

const selectStyle: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 11,
  padding: '6px 10px',
  borderRadius: 4,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.03)',
  color: 'var(--text-primary)',
  outline: 'none',
  cursor: 'pointer',
};

const inputStyle: React.CSSProperties = {
  ...selectStyle,
  width: 220,
};

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function UsersClient() {
  /* ---------- state ---------- */
  const [users, setUsers] = useState<(User & { total_spent_usd?: number })[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState({ total: 0, active: 0, suspended: 0, banned: 0, pro: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // Filters
  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [tierFilter, setTierFilter] = useState<TierFilter>('all');
  const [sortBy, setSortBy] = useState<SortOption>('newest');

  // Actions
  const [actionOpenId, setActionOpenId] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  // Tier change modal
  const [tierModal, setTierModal] = useState<{ user: User; newTier: UserTier } | null>(null);
  // Suspend modal
  const [suspendModal, setSuspendModal] = useState<{ user: User; reason: string } | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ---------- debounced search ---------- */
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearchTerm(searchInput);
      setPage(1);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchInput]);

  /* ---------- fetch users ---------- */
  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        setError('Not authenticated. Please log in.');
        setLoading(false);
        return;
      }

      const params: Record<string, string | number | undefined> = {
        action: 'list',
        page,
        limit: PAGE_SIZE,
      };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== 'all') params.status = statusFilter;
      if (tierFilter !== 'all') params.tier = tierFilter;
      if (sortBy !== 'newest') params.sort_by = sortBy;

      const res = await adminFetch<UsersApiResponse>('admin-users', {
        token: session.access_token,
        params,
      });

      setUsers(res.users ?? []);
      setTotal(res.total ?? 0);
      if (res.stats) {
        setStats(res.stats);
      } else {
        // Compute stats from response if the API doesn't return them
        const all = res.users ?? [];
        setStats({
          total: res.total ?? all.length,
          active: all.filter(u => !u.is_suspended && !(u as { is_banned?: boolean }).is_banned).length,
          suspended: all.filter(u => u.is_suspended || (u as { is_banned?: boolean }).is_banned).length,
          banned: all.filter(u => (u as { is_banned?: boolean }).is_banned).length,
          pro: all.filter(u => u.tier === 'professional').length,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, searchTerm, statusFilter, tierFilter, sortBy]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  /* ---------- actions ---------- */
  const getToken = async (): Promise<string | null> => {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.access_token ?? null;
  };

  const handleChangeTier = async () => {
    if (!tierModal) return;
    const token = await getToken();
    if (!token) return;
    try {
      await adminFetch('admin-users', {
        method: 'PATCH',
        token,
        body: { action: 'set_tier', userId: tierModal.user.id, tier: tierModal.newTier },
      });
      setTierModal(null);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to change tier');
    }
  };

  const handleSuspend = async () => {
    if (!suspendModal || !suspendModal.reason.trim()) return;
    const token = await getToken();
    if (!token) return;
    try {
      await adminFetch('admin-users', {
        method: 'POST',
        token,
        body: { action: 'suspend', userId: suspendModal.user.id, reason: suspendModal.reason.trim() },
      });
      setSuspendModal(null);
      fetchUsers();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to suspend user');
    }
  };

  /* ---------- pagination ---------- */
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageNumbers: number[] = [];
  const maxVisible = 7;
  let startPage = Math.max(1, page - Math.floor(maxVisible / 2));
  const endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage + 1 < maxVisible) startPage = Math.max(1, endPage - maxVisible + 1);
  for (let i = startPage; i <= endPage; i++) pageNumbers.push(i);

  /* ---------- close action dropdown on outside click ---------- */
  useEffect(() => {
    if (!actionOpenId) return;
    const handler = () => setActionOpenId(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [actionOpenId]);

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>

      {/* ========== STATS BAR ========== */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { label: 'TOTAL USERS', value: stats.total },
          { label: 'ACTIVE', value: stats.active },
          { label: 'SUSPENDED / BANNED', value: stats.suspended },
          { label: 'PRO SUBSCRIBERS', value: stats.pro },
        ].map((chip) => (
          <div
            key={chip.label}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              padding: '10px 18px',
              minWidth: 140,
            }}
          >
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                color: '#C9A84C',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                marginBottom: 2,
              }}
            >
              {chip.label}
            </div>
            <div
              style={{
                fontFamily: "'Bebas Neue', sans-serif",
                fontSize: 20,
                color: 'var(--text-primary)',
                lineHeight: 1.2,
              }}
            >
              {chip.value}
            </div>
          </div>
        ))}
      </div>

      {/* ========== FILTERS ROW ========== */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          type="text"
          placeholder="Search email or name..."
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={inputStyle}
        />
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as StatusFilter); setPage(1); }}
          style={selectStyle}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="banned">Banned</option>
        </select>
        <select
          value={tierFilter}
          onChange={(e) => { setTierFilter(e.target.value as TierFilter); setPage(1); }}
          style={selectStyle}
        >
          <option value="all">All Tiers</option>
          <option value="free">Free</option>
          <option value="informed">Informed</option>
          <option value="professional">Professional</option>
        </select>
        <select
          value={sortBy}
          onChange={(e) => { setSortBy(e.target.value as SortOption); setPage(1); }}
          style={selectStyle}
        >
          <option value="newest">Newest</option>
          <option value="oldest">Oldest</option>
          <option value="most_spent">Most Spent</option>
          <option value="last_active">Last Active</option>
          <option value="email_az">Email A-Z</option>
        </select>
      </div>

      {/* ========== ERROR STATE ========== */}
      {error && (
        <div
          style={{
            padding: '12px 16px',
            marginBottom: 16,
            borderRadius: 6,
            border: '1px solid rgba(239,68,68,0.3)',
            background: 'rgba(239,68,68,0.08)',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: '#EF4444',
          }}
        >
          {error}
        </div>
      )}

      {/* ========== LOADING STATE ========== */}
      {loading && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          Loading users...
        </div>
      )}

      {/* ========== EMPTY STATE ========== */}
      {!loading && !error && users.length === 0 && (
        <div
          style={{
            padding: 40,
            textAlign: 'center',
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 12,
            color: 'var(--text-muted)',
          }}
        >
          No users found{searchTerm ? ` matching "${searchTerm}"` : ''}.
        </div>
      )}

      {/* ========== USER TABLE ========== */}
      {!loading && !error && users.length > 0 && (
        <div
          style={{
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            overflow: 'hidden',
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                {['USER', 'STATUS', 'TIER', 'LAST ACTIVE', 'SPENT', 'JOINED', 'ACTIONS'].map((h) => (
                  <th
                    key={h}
                    style={{
                      textAlign: 'left',
                      padding: '10px 14px',
                      fontFamily: "'IBM Plex Mono', monospace",
                      fontSize: 11,
                      fontWeight: 500,
                      color: 'var(--text-muted)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.04em',
                      borderBottom: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((user) => {
                const status = statusColor(user);
                const tp = tierPill(user.tier);
                return (
                  <tr
                    key={user.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer',
                      transition: 'background 150ms',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.03)')}
                    onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => setSelectedUserId(user.id)}
                  >
                    {/* USER */}
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: avatarBg(user.tier),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontFamily: "'IBM Plex Mono', monospace",
                            fontSize: 11,
                            fontWeight: 600,
                            color: '#070A0F',
                            flexShrink: 0,
                          }}
                        >
                          {getInitials(user.email, user.display_name)}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div
                            style={{
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 12,
                              color: 'var(--text-primary)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              maxWidth: 220,
                            }}
                          >
                            {user.email}
                          </div>
                          {user.display_name && (
                            <div
                              style={{
                                fontFamily: "'IBM Plex Mono', monospace",
                                fontSize: 11,
                                color: 'var(--text-muted)',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                maxWidth: 220,
                              }}
                            >
                              {user.display_name}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* STATUS */}
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 100,
                          background: status.bg,
                          color: status.text,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {status.label}
                      </span>
                    </td>

                    {/* TIER */}
                    <td style={{ padding: '10px 14px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          fontWeight: 600,
                          padding: '3px 10px',
                          borderRadius: 100,
                          background: tp.bg,
                          color: tp.text,
                          letterSpacing: '0.03em',
                        }}
                      >
                        {tp.label}
                      </span>
                    </td>

                    {/* LAST ACTIVE */}
                    <td
                      style={{
                        padding: '10px 14px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {relativeTime(user.last_seen_at)}
                    </td>

                    {/* SPENT */}
                    <td
                      style={{
                        padding: '10px 14px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {formatCurrency(user.total_spent_usd)}
                    </td>

                    {/* JOINED */}
                    <td
                      style={{
                        padding: '10px 14px',
                        fontFamily: "'IBM Plex Mono', monospace",
                        fontSize: 11,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {formatDate(user.created_at)}
                    </td>

                    {/* ACTIONS */}
                    <td style={{ padding: '10px 14px', position: 'relative' }}>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setActionOpenId(actionOpenId === user.id ? null : user.id);
                        }}
                        style={{
                          background: 'transparent',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: 4,
                          padding: '4px 10px',
                          cursor: 'pointer',
                          fontFamily: "'IBM Plex Mono', monospace",
                          fontSize: 11,
                          color: 'var(--text-secondary)',
                        }}
                      >
                        ...
                      </button>
                      {actionOpenId === user.id && (
                        <div
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            position: 'absolute',
                            right: 14,
                            top: 40,
                            zIndex: 30,
                            background: '#0D1117',
                            border: '1px solid rgba(255,255,255,0.1)',
                            borderRadius: 6,
                            minWidth: 160,
                            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
                            overflow: 'hidden',
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              setTierModal({ user, newTier: user.tier });
                              setActionOpenId(null);
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 14px',
                              background: 'transparent',
                              border: 'none',
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            Change Tier
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSuspendModal({ user, reason: '' });
                              setActionOpenId(null);
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 14px',
                              background: 'transparent',
                              border: 'none',
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 11,
                              color: user.is_suspended ? '#22C55E' : '#F59E0B',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            {user.is_suspended ? 'Unsuspend' : 'Suspend'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setActionOpenId(null);
                            }}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '8px 14px',
                              background: 'transparent',
                              border: 'none',
                              fontFamily: "'IBM Plex Mono', monospace",
                              fontSize: 11,
                              color: 'var(--text-secondary)',
                              cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
                            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
                          >
                            View Details
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ========== PAGINATION ========== */}
      {!loading && totalPages > 1 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            marginTop: 20,
          }}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: page <= 1 ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: page <= 1 ? 'default' : 'pointer',
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            Prev
          </button>
          {pageNumbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPage(n)}
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                padding: '6px 10px',
                borderRadius: 4,
                border: n === page ? '1px solid #C9A84C' : '1px solid rgba(255,255,255,0.08)',
                background: n === page ? 'rgba(201,168,76,0.12)' : 'transparent',
                color: n === page ? '#C9A84C' : 'var(--text-secondary)',
                cursor: 'pointer',
                minWidth: 32,
              }}
            >
              {n}
            </button>
          ))}
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            style={{
              fontFamily: "'IBM Plex Mono', monospace",
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 4,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'transparent',
              color: page >= totalPages ? 'var(--text-muted)' : 'var(--text-secondary)',
              cursor: page >= totalPages ? 'default' : 'pointer',
              opacity: page >= totalPages ? 0.4 : 1,
            }}
          >
            Next
          </button>
        </div>
      )}

      {/* ========== CHANGE TIER MODAL ========== */}
      {tierModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)',
          }}
          onClick={() => setTierModal(null)}
        >
          <div
            style={{
              background: '#070A0F',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 380,
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              Change Tier
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 16,
              }}
            >
              {tierModal.user.email}
              <br />
              <span style={{ color: 'var(--text-muted)' }}>
                Current: {tierModal.user.tier.toUpperCase()}
              </span>
            </div>
            <select
              value={tierModal.newTier}
              onChange={(e) =>
                setTierModal((m) => m && { ...m, newTier: e.target.value as UserTier })
              }
              style={{
                ...selectStyle,
                width: '100%',
                marginBottom: 16,
              }}
            >
              <option value="free">Free</option>
              <option value="informed">Informed</option>
              <option value="professional">Professional</option>
            </select>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                color: 'var(--text-muted)',
                marginBottom: 16,
              }}
            >
              This is a manual tier override.
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleChangeTier}
                disabled={tierModal.newTier === tierModal.user.tier}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: '1px solid #C9A84C',
                  background: 'rgba(201,168,76,0.1)',
                  color: '#C9A84C',
                  cursor: tierModal.newTier === tierModal.user.tier ? 'default' : 'pointer',
                  opacity: tierModal.newTier === tierModal.user.tier ? 0.4 : 1,
                }}
              >
                Confirm
              </button>
              <button
                type="button"
                onClick={() => setTierModal(null)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== SUSPEND MODAL ========== */}
      {suspendModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.65)',
          }}
          onClick={() => setSuspendModal(null)}
        >
          <div
            style={{
              background: '#070A0F',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
              padding: 24,
              maxWidth: 380,
              width: '100%',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 11,
                color: 'var(--text-muted)',
                textTransform: 'uppercase',
                marginBottom: 12,
              }}
            >
              {suspendModal.user.is_suspended ? 'Unsuspend User' : 'Suspend User'}
            </div>
            <div
              style={{
                fontFamily: "'IBM Plex Mono', monospace",
                fontSize: 12,
                color: 'var(--text-secondary)',
                marginBottom: 16,
              }}
            >
              {suspendModal.user.email}
            </div>
            {!suspendModal.user.is_suspended && (
              <>
                <label
                  style={{
                    display: 'block',
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginBottom: 6,
                  }}
                >
                  Reason (required)
                </label>
                <textarea
                  value={suspendModal.reason}
                  onChange={(e) =>
                    setSuspendModal((m) => m && { ...m, reason: e.target.value })
                  }
                  rows={3}
                  style={{
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontSize: 11,
                    width: '100%',
                    padding: '8px 10px',
                    borderRadius: 4,
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: 'var(--text-primary)',
                    resize: 'none',
                    outline: 'none',
                    marginBottom: 16,
                  }}
                />
              </>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={async () => {
                  if (suspendModal.user.is_suspended) {
                    // Unsuspend
                    const token = await getToken();
                    if (!token) return;
                    try {
                      await adminFetch('admin-users', {
                        method: 'POST',
                        token,
                        body: { action: 'unsuspend', userId: suspendModal.user.id },
                      });
                      setSuspendModal(null);
                      fetchUsers();
                    } catch (err) {
                      alert(err instanceof Error ? err.message : 'Failed to unsuspend');
                    }
                  } else {
                    handleSuspend();
                  }
                }}
                disabled={!suspendModal.user.is_suspended && !suspendModal.reason.trim()}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: suspendModal.user.is_suspended
                    ? '1px solid #22C55E'
                    : '1px solid #EF4444',
                  background: suspendModal.user.is_suspended
                    ? 'rgba(34,197,94,0.1)'
                    : 'rgba(239,68,68,0.1)',
                  color: suspendModal.user.is_suspended ? '#22C55E' : '#EF4444',
                  cursor:
                    !suspendModal.user.is_suspended && !suspendModal.reason.trim()
                      ? 'default'
                      : 'pointer',
                  opacity:
                    !suspendModal.user.is_suspended && !suspendModal.reason.trim() ? 0.4 : 1,
                }}
              >
                {suspendModal.user.is_suspended ? 'Unsuspend' : 'Suspend'}
              </button>
              <button
                type="button"
                onClick={() => setSuspendModal(null)}
                style={{
                  fontFamily: "'IBM Plex Mono', monospace",
                  fontSize: 11,
                  padding: '8px 16px',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
