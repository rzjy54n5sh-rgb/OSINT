'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { adminFetch } from '@/lib/api/admin/client';
import type {
  User,
  UserTier,
  UserDetailResponse,
  Subscription,
  Payment,
} from '@/types';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface UserDetailDrawerProps {
  userId: string | null;
  onClose: () => void;
  token: string;
}

type TabKey = 'overview' | 'subscription' | 'payments' | 'api_keys' | 'activity' | 'notes';

interface ApiKeyRow {
  id: string;
  key_prefix: string;
  name: string;
  last_used_at?: string;
  request_count: number;
  is_revoked: boolean;
  created_at: string;
}

interface UserEvent {
  id: string;
  event_type: string;
  event_name: string;
  details?: string;
  created_at: string;
}

interface UserNote {
  id: string;
  admin_name: string;
  note: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getInitials(email: string, displayName?: string): string {
  if (displayName?.trim()) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return displayName.slice(0, 2).toUpperCase();
  }
  const local = email.split('@')[0];
  return local.slice(0, 2).toUpperCase();
}

function tierRingColor(tier: UserTier): string {
  if (tier === 'professional') return '#C9A84C';
  if (tier === 'informed') return '#1E90FF';
  return '#6B7280';
}

function tierAvatarBg(tier: UserTier): string {
  if (tier === 'professional') return 'rgba(201,168,76,0.25)';
  if (tier === 'informed') return 'rgba(30,144,255,0.2)';
  return 'rgba(107,114,128,0.2)';
}

function statusPill(user: ExtendedUser): { label: string; bg: string; text: string } {
  if (user.is_banned) return { label: 'BANNED', bg: 'rgba(220,38,38,0.15)', text: '#EF4444' };
  if (user.is_suspended) return { label: 'SUSPENDED', bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' };
  return { label: 'ACTIVE', bg: 'rgba(34,197,94,0.15)', text: '#22C55E' };
}

function tierPill(tier: UserTier): { label: string; bg: string; text: string } {
  if (tier === 'professional') return { label: 'PRO', bg: 'rgba(201,168,76,0.15)', text: '#C9A84C' };
  if (tier === 'informed') return { label: 'INFORMED', bg: 'rgba(30,144,255,0.15)', text: '#1E90FF' };
  return { label: 'FREE', bg: 'rgba(74,85,104,0.15)', text: '#718096' };
}

function formatCurrency(amount?: number, currency?: string): string {
  if (amount === undefined || amount === null) return '$0.00';
  const sym = currency === 'aed' ? 'AED ' : currency === 'egp' ? 'EGP ' : '$';
  return `${sym}${amount.toFixed(2)}`;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '--';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatDateTime(dateStr?: string): string {
  if (!dateStr) return '--';
  const d = new Date(dateStr);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ${d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`;
}

function relativeTime(dateStr?: string): string {
  if (!dateStr) return '--';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function paymentStatusColor(status: string): { bg: string; text: string } {
  switch (status.toLowerCase()) {
    case 'succeeded':
    case 'paid':
      return { bg: 'rgba(34,197,94,0.15)', text: '#22C55E' };
    case 'pending':
      return { bg: 'rgba(245,158,11,0.15)', text: '#F59E0B' };
    case 'failed':
    case 'refunded':
      return { bg: 'rgba(220,38,38,0.15)', text: '#EF4444' };
    default:
      return { bg: 'rgba(107,114,128,0.15)', text: '#9CA3AF' };
  }
}

function eventColor(type: string): string {
  if (type.includes('login') || type.includes('auth')) return '#22C55E';
  if (type.includes('payment') || type.includes('subscription')) return '#3B82F6';
  if (type.includes('admin')) return '#A855F7';
  if (type.includes('account') || type.includes('suspend') || type.includes('ban')) return '#EF4444';
  return '#9CA3AF';
}

function eventIcon(type: string): string {
  if (type.includes('login') || type.includes('auth')) return '\u25CF';
  if (type.includes('payment') || type.includes('subscription')) return '\u25B2';
  if (type.includes('admin')) return '\u25C6';
  if (type.includes('account') || type.includes('suspend') || type.includes('ban')) return '\u25A0';
  return '\u25CB';
}

type ExtendedUser = User & {
  is_banned?: boolean;
  total_spent_usd?: number;
  total_logins?: number;
  failed_logins?: number;
  lifetime_value?: number;
  tags?: string[];
};

/* ------------------------------------------------------------------ */
/*  Skeleton                                                           */
/* ------------------------------------------------------------------ */

function SkeletonBlock({ width, height }: { width: string; height: string }) {
  return (
    <div
      style={{
        width,
        height,
        background: 'rgba(255,255,255,0.04)',
        borderRadius: 4,
        animation: 'skeleton-pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.8; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <SkeletonBlock width="64px" height="64px" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <SkeletonBlock width="180px" height="20px" />
          <SkeletonBlock width="220px" height="14px" />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonBlock key={i} width="80px" height="32px" />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <SkeletonBlock width="80px" height="12px" />
            <SkeletonBlock width="140px" height="16px" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Pill component                                                     */
/* ------------------------------------------------------------------ */

function Pill({ label, bg, text }: { label: string; bg: string; text: string }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 8px',
        borderRadius: 4,
        fontSize: 11,
        fontWeight: 700,
        fontFamily: 'monospace',
        letterSpacing: '0.05em',
        background: bg,
        color: text,
      }}
    >
      {label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Drawer                                                        */
/* ------------------------------------------------------------------ */

export default function UserDetailDrawer({ userId, onClose, token }: UserDetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('overview');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [apiKeys, setApiKeys] = useState<ApiKeyRow[]>([]);
  const [events, setEvents] = useState<UserEvent[]>([]);
  const [notes, setNotes] = useState<UserNote[]>([]);

  // Notes form
  const [noteText, setNoteText] = useState('');
  const [notePinned, setNotePinned] = useState(false);
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');

  // Status/tier change
  const [statusChanging, setStatusChanging] = useState(false);
  const [tierChanging, setTierChanging] = useState(false);

  // More menu
  const [showMore, setShowMore] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  // Copy feedback
  const [copied, setCopied] = useState(false);

  const isOpen = userId !== null;

  /* -- Fetch user detail ------------------------------------------- */
  const fetchUser = useCallback(async () => {
    if (!userId || !token) return;
    setLoading(true);
    setError(null);
    try {
      const data = await adminFetch<UserDetailResponse>('admin-users', {
        method: 'GET',
        params: { id: userId },
        token,
      });
      setUser(data.user as ExtendedUser);
      setSubscriptions(data.subscriptions ?? []);
      setPayments(data.payments ?? []);
      setApiKeys((data.apiKeys ?? []) as ApiKeyRow[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [userId, token]);

  const fetchEvents = useCallback(async () => {
    if (!userId || !token) return;
    try {
      const data = await adminFetch<{ events: UserEvent[] }>('admin-users', {
        method: 'GET',
        params: { id: userId, include: 'events' },
        token,
      });
      setEvents(data.events ?? []);
    } catch {
      setEvents([]);
    }
  }, [userId, token]);

  const fetchNotes = useCallback(async () => {
    if (!userId || !token) return;
    try {
      const data = await adminFetch<{ notes: UserNote[] }>('admin-users', {
        method: 'GET',
        params: { id: userId, include: 'notes' },
        token,
      });
      setNotes(data.notes ?? []);
    } catch {
      setNotes([]);
    }
  }, [userId, token]);

  useEffect(() => {
    if (userId) {
      setActiveTab('overview');
      setShowMore(false);
      setCopied(false);
      fetchUser();
    } else {
      setUser(null);
      setSubscriptions([]);
      setPayments([]);
      setApiKeys([]);
      setEvents([]);
      setNotes([]);
    }
  }, [userId, fetchUser]);

  // Lazy-load events/notes on tab switch
  useEffect(() => {
    if (activeTab === 'activity' && events.length === 0 && userId) fetchEvents();
    if (activeTab === 'notes' && notes.length === 0 && userId) fetchNotes();
  }, [activeTab, userId, events.length, notes.length, fetchEvents, fetchNotes]);

  /* -- Escape key / overlay click ---------------------------------- */
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  // Close more menu on outside click
  useEffect(() => {
    if (!showMore) return;
    const handleClick = (e: MouseEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setShowMore(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showMore]);

  /* -- Actions ----------------------------------------------------- */
  const handleCopyId = useCallback(() => {
    if (!userId) return;
    navigator.clipboard.writeText(userId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [userId]);

  const handleResetPassword = useCallback(async () => {
    if (!userId || !token) return;
    if (!window.confirm('Send a password reset email to this user?')) return;
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'POST',
        body: { action: 'reset_password', user_id: userId },
        token,
      });
      alert('Password reset email sent.');
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send reset email');
    }
  }, [userId, token]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!userId || !token || !user) return;
    setStatusChanging(true);
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'PATCH',
        body: { user_id: userId, action: 'set_status', status: newStatus },
        token,
      });
      setUser(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          is_suspended: newStatus === 'suspended',
          is_banned: newStatus === 'banned',
        };
      });
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setStatusChanging(false);
    }
  }, [userId, token, user]);

  const handleTierChange = useCallback(async (newTier: UserTier) => {
    if (!userId || !token) return;
    setTierChanging(true);
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'PATCH',
        body: { user_id: userId, action: 'set_tier', tier: newTier },
        token,
      });
      setUser(prev => prev ? { ...prev, tier: newTier } : prev);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update tier');
    } finally {
      setTierChanging(false);
    }
  }, [userId, token]);

  const handleRevokeKey = useCallback(async (keyId: string) => {
    if (!token) return;
    if (!window.confirm('Revoke this API key? This cannot be undone.')) return;
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'PATCH',
        body: { action: 'revoke_key', key_id: keyId },
        token,
      });
      setApiKeys(prev => prev.map(k => k.id === keyId ? { ...k, is_revoked: true } : k));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to revoke key');
    }
  }, [token]);

  const handleSubAction = useCallback(async (action: 'cancel' | 'pause' | 'resume', subId: string) => {
    if (!token) return;
    const msg = action === 'cancel' ? 'Cancel this subscription?' : action === 'pause' ? 'Pause this subscription?' : 'Resume this subscription?';
    if (!window.confirm(msg)) return;
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'PATCH',
        body: { action: `subscription_${action}`, subscription_id: subId },
        token,
      });
      fetchUser();
    } catch (err) {
      alert(err instanceof Error ? err.message : `Failed to ${action} subscription`);
    }
  }, [token, fetchUser]);

  const handleAddNote = useCallback(async () => {
    if (!userId || !token || !noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'POST',
        body: { action: 'add_note', user_id: userId, note: noteText.trim(), is_pinned: notePinned },
        token,
      });
      setNoteText('');
      setNotePinned(false);
      fetchNotes();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  }, [userId, token, noteText, notePinned, fetchNotes]);

  const handleUpdateNote = useCallback(async (noteId: string) => {
    if (!token || !editingNoteText.trim()) return;
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'PATCH',
        body: { action: 'update_note', note_id: noteId, note: editingNoteText.trim() },
        token,
      });
      setEditingNoteId(null);
      setEditingNoteText('');
      fetchNotes();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update note');
    }
  }, [token, editingNoteText, fetchNotes]);

  const handleDeleteNote = useCallback(async (noteId: string) => {
    if (!token) return;
    if (!window.confirm('Delete this note?')) return;
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'DELETE',
        body: { action: 'delete_note', note_id: noteId },
        token,
      });
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete note');
    }
  }, [token]);

  const handleTogglePin = useCallback(async (noteId: string, currentPinned: boolean) => {
    if (!token) return;
    try {
      await adminFetch<{ success: boolean }>('admin-users', {
        method: 'PATCH',
        body: { action: 'toggle_pin_note', note_id: noteId, is_pinned: !currentPinned },
        token,
      });
      setNotes(prev => prev.map(n => n.id === noteId ? { ...n, is_pinned: !currentPinned } : n));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to toggle pin');
    }
  }, [token]);

  const handleSuspendFromMore = useCallback(() => {
    setShowMore(false);
    if (user?.is_suspended) {
      handleStatusChange('active');
    } else {
      handleStatusChange('suspended');
    }
  }, [user, handleStatusChange]);

  const handleBanFromMore = useCallback(() => {
    setShowMore(false);
    if (user?.is_banned) {
      handleStatusChange('active');
    } else {
      if (window.confirm('Ban this user? They will lose all access.')) {
        handleStatusChange('banned');
      }
    }
  }, [user, handleStatusChange]);

  /* -- Shared styles ---------------------------------------------- */
  const labelStyle: React.CSSProperties = {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    marginBottom: 4,
  };

  const valueStyle: React.CSSProperties = {
    fontSize: 13,
    fontFamily: 'monospace',
    color: '#E5E7EB',
  };

  const btnBase: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 4,
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 600,
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.1)',
    background: 'rgba(255,255,255,0.04)',
    color: '#D1D5DB',
    transition: 'all 0.15s ease',
  };

  const goldBtn: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(201,168,76,0.15)',
    borderColor: 'rgba(201,168,76,0.3)',
    color: '#C9A84C',
  };

  const dangerBtn: React.CSSProperties = {
    ...btnBase,
    background: 'rgba(220,38,38,0.1)',
    borderColor: 'rgba(220,38,38,0.2)',
    color: '#EF4444',
  };

  const selectStyle: React.CSSProperties = {
    fontSize: 12,
    fontFamily: 'monospace',
    background: '#151B28',
    color: '#E5E7EB',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 4,
    padding: '4px 8px',
    outline: 'none',
    cursor: 'pointer',
  };

  /* -- Tab content renderers -------------------------------------- */

  function renderOverview() {
    if (!user) return null;
    const sp = statusPill(user);
    const tp = tierPill(user.tier);
    const currentStatus = user.is_banned ? 'banned' : user.is_suspended ? 'suspended' : 'active';

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, padding: '20px 0' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={labelStyle}>EMAIL</div>
            <div style={{ ...valueStyle, wordBreak: 'break-all' }}>{user.email}</div>
          </div>
          <div>
            <div style={labelStyle}>STATUS</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill label={sp.label} bg={sp.bg} text={sp.text} />
              <select
                style={selectStyle}
                value={currentStatus}
                disabled={statusChanging}
                onChange={(e) => handleStatusChange(e.target.value)}
              >
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
                <option value="banned">Banned</option>
              </select>
            </div>
          </div>
          <div>
            <div style={labelStyle}>TIER</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Pill label={tp.label} bg={tp.bg} text={tp.text} />
              <select
                style={selectStyle}
                value={user.tier}
                disabled={tierChanging}
                onChange={(e) => handleTierChange(e.target.value as UserTier)}
              >
                <option value="free">Free</option>
                <option value="informed">Informed</option>
                <option value="professional">Professional</option>
              </select>
            </div>
          </div>
          <div>
            <div style={labelStyle}>COUNTRY</div>
            <div style={valueStyle}>{user.country_code?.toUpperCase() || '--'}</div>
          </div>
          <div>
            <div style={labelStyle}>TAGS</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {user.tags && user.tags.length > 0 ? user.tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    fontSize: 11,
                    fontFamily: 'monospace',
                    padding: '2px 6px',
                    borderRadius: 3,
                    background: 'rgba(255,255,255,0.06)',
                    color: '#9CA3AF',
                  }}
                >
                  {tag}
                </span>
              )) : (
                <span style={{ ...valueStyle, color: '#4B5563' }}>No tags</span>
              )}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <div style={labelStyle}>JOINED</div>
            <div style={valueStyle}>{formatDate(user.created_at)}</div>
          </div>
          <div>
            <div style={labelStyle}>LAST LOGIN</div>
            <div style={valueStyle}>{user.last_seen_at ? relativeTime(user.last_seen_at) : '--'}</div>
          </div>
          <div>
            <div style={labelStyle}>TOTAL LOGINS</div>
            <div style={valueStyle}>{user.total_logins ?? '--'}</div>
          </div>
          <div>
            <div style={labelStyle}>FAILED LOGINS</div>
            <div style={valueStyle}>{user.failed_logins ?? '--'}</div>
          </div>
          <div>
            <div style={labelStyle}>TOTAL SPENT</div>
            <div style={valueStyle}>{formatCurrency(user.total_spent_usd)}</div>
          </div>
          <div>
            <div style={labelStyle}>LIFETIME VALUE</div>
            <div style={{ ...valueStyle, color: '#C9A84C', fontWeight: 600 }}>
              {formatCurrency(user.lifetime_value ?? user.total_spent_usd)}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function renderSubscription() {
    if (!user) return null;
    const activeSubs = subscriptions.filter(s => s.status !== 'canceled');
    const canceledSubs = subscriptions.filter(s => s.status === 'canceled');

    if (subscriptions.length === 0) {
      return (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 13 }}>
          No subscriptions found.
        </div>
      );
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: '20px 0' }}>
        {activeSubs.map(sub => (
          <div
            key={sub.id}
            style={{
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              padding: 16,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 14, fontFamily: '"Bebas Neue", monospace', color: '#E5E7EB', letterSpacing: '0.05em' }}>
                  CURRENT SUBSCRIPTION
                </span>
                <Pill
                  label={sub.status.toUpperCase()}
                  bg={sub.status === 'active' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)'}
                  text={sub.status === 'active' ? '#22C55E' : '#F59E0B'}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <div style={labelStyle}>PLAN</div>
                <div style={valueStyle}>{sub.plan.charAt(0).toUpperCase() + sub.plan.slice(1)}</div>
              </div>
              <div>
                <div style={labelStyle}>AMOUNT</div>
                <div style={valueStyle}>{formatCurrency(sub.amount, sub.currency)}</div>
              </div>
              <div>
                <div style={labelStyle}>BILLING CYCLE</div>
                <div style={valueStyle}>
                  {sub.current_period_start && sub.current_period_end
                    ? `${formatDate(sub.current_period_start)} - ${formatDate(sub.current_period_end)}`
                    : '--'}
                </div>
              </div>
              <div>
                <div style={labelStyle}>NEXT BILLING</div>
                <div style={valueStyle}>{sub.cancel_at_period_end ? 'Cancels at period end' : formatDate(sub.current_period_end)}</div>
              </div>
              <div>
                <div style={labelStyle}>STRIPE SUB ID</div>
                <div style={{ ...valueStyle, fontSize: 11, wordBreak: 'break-all', color: '#9CA3AF' }}>
                  {sub.stripe_subscription_id || '--'}
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              {sub.status === 'active' && !sub.cancel_at_period_end && (
                <>
                  <button style={dangerBtn} onClick={() => handleSubAction('cancel', sub.id)}>Cancel</button>
                  <button style={btnBase} onClick={() => handleSubAction('pause', sub.id)}>Pause</button>
                </>
              )}
              {(sub.status === 'paused' || sub.cancel_at_period_end) && (
                <button style={goldBtn} onClick={() => handleSubAction('resume', sub.id)}>Resume</button>
              )}
            </div>
          </div>
        ))}

        {canceledSubs.length > 0 && (
          <div>
            <div style={{ ...labelStyle, marginBottom: 8 }}>PAST SUBSCRIPTIONS</div>
            {canceledSubs.map(sub => (
              <div
                key={sub.id}
                style={{
                  background: 'rgba(255,255,255,0.02)',
                  border: '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 4,
                  padding: 12,
                  marginBottom: 8,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ ...valueStyle, color: '#6B7280' }}>{sub.plan} - {formatCurrency(sub.amount, sub.currency)}</span>
                <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#4B5563' }}>
                  {formatDate(sub.created_at)} - {formatDate(sub.updated_at)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderPayments() {
    if (payments.length === 0) {
      return (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 13 }}>
          No payments found.
        </div>
      );
    }

    return (
      <div style={{ padding: '16px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['DATE', 'AMOUNT', 'STATUS', 'DESCRIPTION'].map(h => (
                <th
                  key={h}
                  style={{
                    ...labelStyle,
                    textAlign: 'left',
                    padding: '8px 8px 8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.map(p => {
              const sc = paymentStatusColor(p.status);
              return (
                <tr key={p.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12 }}>{formatDate(p.created_at)}</td>
                  <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12 }}>{formatCurrency(p.amount, p.currency)}</td>
                  <td style={{ padding: '10px 8px 10px 0' }}>
                    <Pill label={p.status.toUpperCase()} bg={sc.bg} text={sc.text} />
                  </td>
                  <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12, color: '#9CA3AF' }}>
                    {p.description || p.type || '--'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  }

  function renderApiKeys() {
    if (apiKeys.length === 0) {
      return (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 13 }}>
          No API keys found.
        </div>
      );
    }

    return (
      <div style={{ padding: '16px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              {['NAME', 'PREFIX', 'CREATED', 'LAST USED', 'STATUS', ''].map(h => (
                <th
                  key={h}
                  style={{
                    ...labelStyle,
                    textAlign: 'left',
                    padding: '8px 8px 8px 0',
                    borderBottom: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apiKeys.map(k => (
              <tr key={k.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12 }}>{k.name}</td>
                <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12, color: '#9CA3AF' }}>{k.key_prefix}...</td>
                <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12 }}>{formatDate(k.created_at)}</td>
                <td style={{ ...valueStyle, padding: '10px 8px 10px 0', fontSize: 12 }}>{k.last_used_at ? relativeTime(k.last_used_at) : 'Never'}</td>
                <td style={{ padding: '10px 8px 10px 0' }}>
                  <Pill
                    label={k.is_revoked ? 'REVOKED' : 'ACTIVE'}
                    bg={k.is_revoked ? 'rgba(220,38,38,0.15)' : 'rgba(34,197,94,0.15)'}
                    text={k.is_revoked ? '#EF4444' : '#22C55E'}
                  />
                </td>
                <td style={{ padding: '10px 8px 10px 0' }}>
                  {!k.is_revoked && (
                    <button style={dangerBtn} onClick={() => handleRevokeKey(k.id)}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderActivity() {
    if (events.length === 0) {
      return (
        <div style={{ padding: '40px 0', textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 13 }}>
          No activity events found.
        </div>
      );
    }

    return (
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 0 }}>
        {events.map((ev, idx) => {
          const color = eventColor(ev.event_type);
          const icon = eventIcon(ev.event_type);
          const isLast = idx === events.length - 1;

          return (
            <div key={ev.id} style={{ display: 'flex', gap: 12, position: 'relative' }}>
              {/* Timeline line */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 20, flexShrink: 0 }}>
                <span style={{ fontSize: 14, color, lineHeight: '20px' }}>{icon}</span>
                {!isLast && (
                  <div style={{ width: 1, flex: 1, background: 'rgba(255,255,255,0.06)', minHeight: 20 }} />
                )}
              </div>

              {/* Content */}
              <div style={{ flex: 1, paddingBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#E5E7EB', fontWeight: 600 }}>
                    {ev.event_name}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#4B5563', flexShrink: 0, marginLeft: 8 }}>
                    {formatDateTime(ev.created_at)}
                  </span>
                </div>
                {ev.details && (
                  <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#6B7280', marginTop: 2 }}>
                    {ev.details}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderNotes() {
    const pinnedNotes = notes.filter(n => n.is_pinned);
    const unpinnedNotes = notes.filter(n => !n.is_pinned);
    const sortedNotes = [...pinnedNotes, ...unpinnedNotes];

    return (
      <div style={{ padding: '16px 0', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Add note form */}
        <div
          style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 6,
            padding: 14,
          }}
        >
          <textarea
            placeholder="Add a note about this user..."
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            style={{
              width: '100%',
              minHeight: 72,
              resize: 'vertical',
              background: '#151B28',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: 10,
              fontSize: 12,
              fontFamily: 'monospace',
              color: '#E5E7EB',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={notePinned}
                onChange={(e) => setNotePinned(e.target.checked)}
                style={{ accentColor: '#C9A84C' }}
              />
              <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#9CA3AF' }}>Pin note</span>
            </label>
            <button
              style={{
                ...goldBtn,
                opacity: !noteText.trim() || noteSubmitting ? 0.5 : 1,
                cursor: !noteText.trim() || noteSubmitting ? 'not-allowed' : 'pointer',
              }}
              disabled={!noteText.trim() || noteSubmitting}
              onClick={handleAddNote}
            >
              {noteSubmitting ? 'Adding...' : 'Add Note'}
            </button>
          </div>
        </div>

        {/* Notes list */}
        {sortedNotes.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#4B5563', fontFamily: 'monospace', fontSize: 13, padding: '20px 0' }}>
            No notes yet.
          </div>
        ) : (
          sortedNotes.map(note => (
            <div
              key={note.id}
              style={{
                background: note.is_pinned ? 'rgba(201,168,76,0.04)' : 'rgba(255,255,255,0.02)',
                border: `1px solid ${note.is_pinned ? 'rgba(201,168,76,0.15)' : 'rgba(255,255,255,0.06)'}`,
                borderRadius: 6,
                padding: 14,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {note.is_pinned && (
                    <span style={{ fontSize: 11, color: '#C9A84C' }} title="Pinned">PIN</span>
                  )}
                  <span style={{ fontSize: 12, fontFamily: 'monospace', color: '#D1D5DB', fontWeight: 600 }}>
                    {note.admin_name}
                  </span>
                  <span style={{ fontSize: 11, fontFamily: 'monospace', color: '#4B5563' }}>
                    {relativeTime(note.created_at)}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    style={{ ...btnBase, padding: '3px 8px', fontSize: 11 }}
                    onClick={() => handleTogglePin(note.id, note.is_pinned)}
                    title={note.is_pinned ? 'Unpin' : 'Pin'}
                  >
                    {note.is_pinned ? 'Unpin' : 'Pin'}
                  </button>
                  <button
                    style={{ ...btnBase, padding: '3px 8px', fontSize: 11 }}
                    onClick={() => {
                      setEditingNoteId(note.id);
                      setEditingNoteText(note.note);
                    }}
                  >
                    Edit
                  </button>
                  <button
                    style={{ ...dangerBtn, padding: '3px 8px', fontSize: 11 }}
                    onClick={() => handleDeleteNote(note.id)}
                  >
                    Del
                  </button>
                </div>
              </div>

              {editingNoteId === note.id ? (
                <div>
                  <textarea
                    value={editingNoteText}
                    onChange={(e) => setEditingNoteText(e.target.value)}
                    style={{
                      width: '100%',
                      minHeight: 60,
                      resize: 'vertical',
                      background: '#151B28',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 4,
                      padding: 8,
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: '#E5E7EB',
                      outline: 'none',
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button style={btnBase} onClick={() => { setEditingNoteId(null); setEditingNoteText(''); }}>
                      Cancel
                    </button>
                    <button style={goldBtn} onClick={() => handleUpdateNote(note.id)}>
                      Save
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ fontSize: 12, fontFamily: 'monospace', color: '#D1D5DB', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                  {note.note}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  /* -- Tab bar ----------------------------------------------------- */
  const TABS: { key: TabKey; label: string }[] = [
    { key: 'overview', label: 'OVERVIEW' },
    { key: 'subscription', label: 'SUBSCRIPTION' },
    { key: 'payments', label: 'PAYMENTS' },
    { key: 'api_keys', label: 'API KEYS' },
    { key: 'activity', label: 'ACTIVITY' },
    { key: 'notes', label: 'NOTES' },
  ];

  const tabRenderers: Record<TabKey, () => React.ReactNode> = {
    overview: renderOverview,
    subscription: renderSubscription,
    payments: renderPayments,
    api_keys: renderApiKeys,
    activity: renderActivity,
    notes: renderNotes,
  };

  /* -- Render ----------------------------------------------------- */

  return (
    <>
      {/* Overlay */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 999,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />

      {/* Drawer */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 600,
          maxWidth: '100vw',
          height: '100vh',
          background: '#0C1018',
          borderLeft: '1px solid rgba(255,255,255,0.08)',
          zIndex: 1000,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 28,
            height: 28,
            borderRadius: 4,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(255,255,255,0.04)',
            color: '#9CA3AF',
            fontSize: 16,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            lineHeight: 1,
          }}
          aria-label="Close drawer"
        >
          x
        </button>

        {loading ? (
          <LoadingSkeleton />
        ) : error ? (
          <div style={{ padding: 24, color: '#EF4444', fontFamily: 'monospace', fontSize: 13 }}>
            Error: {error}
            <br />
            <button style={{ ...btnBase, marginTop: 12 }} onClick={fetchUser}>Retry</button>
          </div>
        ) : user ? (
          <>
            {/* Header */}
            <div style={{ padding: '20px 24px 0', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {/* Avatar */}
                <div
                  style={{
                    width: 64,
                    height: 64,
                    borderRadius: '50%',
                    background: tierAvatarBg(user.tier),
                    border: `3px solid ${tierRingColor(user.tier)}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 22,
                    fontFamily: '"Bebas Neue", monospace',
                    color: tierRingColor(user.tier),
                    letterSpacing: '0.05em',
                    flexShrink: 0,
                  }}
                >
                  {getInitials(user.email, user.display_name)}
                </div>

                {/* Name + email + pills */}
                <div style={{ flex: 1, minWidth: 0, paddingRight: 32 }}>
                  <div
                    style={{
                      fontSize: 18,
                      fontFamily: '"Bebas Neue", sans-serif',
                      color: '#F3F4F6',
                      letterSpacing: '0.04em',
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user.display_name || user.email.split('@')[0]}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      fontFamily: 'monospace',
                      color: '#6B7280',
                      marginTop: 2,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {user.email}
                  </div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                    {(() => { const sp = statusPill(user); return <Pill label={sp.label} bg={sp.bg} text={sp.text} />; })()}
                    {(() => { const tp = tierPill(user.tier); return <Pill label={tp.label} bg={tp.bg} text={tp.text} />; })()}
                  </div>
                </div>
              </div>

              {/* Action buttons */}
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button style={btnBase} onClick={handleResetPassword}>
                  Reset Password
                </button>
                <button style={btnBase} onClick={handleCopyId}>
                  {copied ? 'Copied!' : 'Copy ID'}
                </button>
                <div ref={moreRef} style={{ position: 'relative' }}>
                  <button style={btnBase} onClick={() => setShowMore(v => !v)}>
                    More {showMore ? '\u25B4' : '\u25BE'}
                  </button>
                  {showMore && (
                    <div
                      style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        marginTop: 4,
                        background: '#1A2030',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 6,
                        padding: 4,
                        minWidth: 180,
                        zIndex: 20,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                      }}
                    >
                      <button
                        onClick={handleSuspendFromMore}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: '#F59E0B',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                      >
                        {user.is_suspended ? 'Unsuspend User' : 'Suspend User'}
                      </button>
                      <button
                        onClick={handleBanFromMore}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: '#EF4444',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                      >
                        {user.is_banned ? 'Unban User' : 'Ban User'}
                      </button>
                      <button
                        onClick={() => {
                          setShowMore(false);
                          if (user.stripe_customer_id) {
                            window.open(`https://dashboard.stripe.com/customers/${user.stripe_customer_id}`, '_blank');
                          } else {
                            alert('No Stripe customer ID linked.');
                          }
                        }}
                        style={{
                          display: 'block',
                          width: '100%',
                          textAlign: 'left',
                          padding: '8px 12px',
                          fontSize: 12,
                          fontFamily: 'monospace',
                          color: '#A78BFA',
                          background: 'transparent',
                          border: 'none',
                          borderRadius: 4,
                          cursor: 'pointer',
                        }}
                        onMouseEnter={(e) => { (e.target as HTMLElement).style.background = 'rgba(255,255,255,0.05)'; }}
                        onMouseLeave={(e) => { (e.target as HTMLElement).style.background = 'transparent'; }}
                      >
                        View in Stripe
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Tab bar */}
              <div
                style={{
                  display: 'flex',
                  gap: 0,
                  marginTop: 20,
                  borderBottom: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                {TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    style={{
                      padding: '10px 14px',
                      fontSize: 11,
                      fontFamily: 'monospace',
                      fontWeight: 700,
                      letterSpacing: '0.06em',
                      color: activeTab === tab.key ? '#C9A84C' : '#6B7280',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: activeTab === tab.key ? '2px solid #C9A84C' : '2px solid transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                      marginBottom: -1,
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab content (scrollable) */}
            <div
              style={{
                flex: 1,
                overflowY: 'auto',
                padding: '0 24px 24px',
              }}
            >
              {tabRenderers[activeTab]()}
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
