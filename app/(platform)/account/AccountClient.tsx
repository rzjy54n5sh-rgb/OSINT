'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { OsintCard } from '@/components/OsintCard';
import type { User } from '@/types';
import type { Subscription } from '@/types';
import type { ApiKey } from '@/types';

const BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) || '';
const ANON_KEY =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) ||
  '';

type AccountClientProps = {
  user: User;
  subscription: Subscription | null;
  apiKeys: ApiKey[];
  maxApiKeys: number;
};

export function AccountClient({ user, subscription, apiKeys, maxApiKeys }: AccountClientProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(user.display_name || '');
  const [editingName, setEditingName] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [newKeyModal, setNewKeyModal] = useState<{ key: string; keyId: string; keyPrefix: string } | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const supabase = createClient();
  const activeKeys = apiKeys.filter((k) => !k.is_revoked);

  const handleSaveDisplayName = async () => {
    const name = displayName.trim();
    if (!name) return;
    const { error: authErr } = await supabase.auth.updateUser({ data: { full_name: name } });
    if (authErr) return;
    await supabase.from('users').update({ display_name: name, updated_at: new Date().toISOString() }).eq('id', user.id);
    setEditingName(false);
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) return;
      const res = await fetch(`${BASE}/functions/v1/create-portal-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON_KEY },
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } finally {
      setPortalLoading(false);
    }
  };

  const handleGenerateKey = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    const res = await fetch(`${BASE}/functions/v1/manage-api-keys`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    });
    const data = await res.json();
    if (data?.key) setNewKeyModal({ key: data.key, keyId: data.keyId, keyPrefix: data.keyPrefix });
  };

  const handleRevokeKey = async (id: string) => {
    if (!confirm('Revoke this API key? It will stop working immediately.')) return;
    setRevokingId(id);
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    if (!token) return;
    await fetch(`${BASE}/functions/v1/manage-api-keys?id=${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}`, apikey: ANON_KEY },
    });
    setRevokingId(null);
    router.refresh();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  };

  const tierStyle = (t: string) => {
    if (t === 'professional') return { border: '1px solid #E8C547', color: '#E8C547' };
    if (t === 'informed') return { border: '1px solid #1E90FF', color: '#1E90FF' };
    return { border: '1px solid #4A5568', color: '#4A5568' };
  };

  const nextBilling = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString()
    : null;
  const trialEnd = subscription?.trial_end ? new Date(subscription.trial_end).toLocaleDateString() : null;
  const isTrialing = subscription?.status === 'trialing';
  const isPastDue = subscription?.status === 'past_due';

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <h1 className="font-display text-3xl" style={{ color: 'var(--text-primary)' }}>
        ◆ ACCOUNT
      </h1>

      <OsintCard>
        <h2 className="font-mono text-xs uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
          Profile
        </h2>
        <div className="flex flex-wrap items-center gap-4">
          {editingName ? (
            <>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="font-mono text-sm px-3 py-2 border rounded-sm bg-transparent"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={handleSaveDisplayName}
                className="font-mono text-xs px-3 py-1 border rounded-sm"
                style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={() => setEditingName(false)}
                className="font-mono text-xs text-secondary"
                style={{ color: 'var(--text-muted)' }}
              >
                Cancel
              </button>
            </>
          ) : (
            <>
              <p className="font-body text-lg" style={{ color: 'var(--text-primary)' }}>
                {user.display_name || user.email}
              </p>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="font-mono text-xs"
                style={{ color: 'var(--accent-gold)' }}
              >
                Edit display name
              </button>
            </>
          )}
        </div>
        <p className="font-mono text-xs mt-2" style={{ color: 'var(--text-muted)' }}>{user.email}</p>
        <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Auth: {user.auth_provider} · Member since {new Date(user.created_at).toLocaleDateString()}
        </p>
      </OsintCard>

      <OsintCard>
        <h2 className="font-mono text-xs uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
          Current Plan
        </h2>
        <div className="flex items-center gap-4 flex-wrap">
          <span
            className="font-display text-2xl px-4 py-2 rounded-sm"
            style={tierStyle(user.tier)}
          >
            {user.tier === 'professional' ? '◆ PRO' : user.tier.toUpperCase()}
          </span>
          {subscription && (
            <>
              <span className="font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                {subscription.plan} · {subscription.currency.toUpperCase()} {subscription.amount != null ? subscription.amount / 100 : ''}
              </span>
              {isTrialing && trialEnd && (
                <span className="font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>
                  Trial ends {trialEnd}
                </span>
              )}
              {nextBilling && !isTrialing && (
                <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
                  Next billing {nextBilling}
                </span>
              )}
              {isPastDue && (
                <span className="font-mono text-xs px-2 py-1" style={{ color: 'var(--accent-red)', border: '1px solid var(--accent-red)' }}>
                  Payment failed — update payment method
                </span>
              )}
            </>
          )}
          {!subscription && user.tier === 'free' && (
            <span className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>You&apos;re on the free plan</span>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {user.tier === 'free' && (
            <Link href="/pricing" className="font-mono text-xs px-4 py-2 border rounded-sm inline-block" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
              Upgrade to Informed →
            </Link>
          )}
          {user.tier === 'informed' && (
            <Link href="/pricing" className="font-mono text-xs px-4 py-2 border rounded-sm inline-block" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
              Upgrade to Professional →
            </Link>
          )}
          {subscription && user.stripe_customer_id && (
            <button
              type="button"
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="font-mono text-xs px-4 py-2 border rounded-sm"
              style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
            >
              {portalLoading ? 'Opening…' : 'Manage billing →'}
            </button>
          )}
        </div>
      </OsintCard>

      {user.tier === 'professional' && (
        <OsintCard>
          <h2 className="font-mono text-xs uppercase mb-4" style={{ color: 'var(--text-muted)' }}>
            API Access — ◆ Professional
          </h2>
          <p className="font-mono text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            {activeKeys.length} / {maxApiKeys} keys active
          </p>
          <ul className="space-y-2 mb-4">
            {apiKeys.map((k) => (
              <li key={k.id} className="flex items-center justify-between gap-4 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                <span>{k.key_prefix}…</span>
                <span>{k.name}</span>
                <span>{k.last_used_at ? new Date(k.last_used_at).toLocaleDateString() : 'Never'}</span>
                <span style={{ color: k.is_revoked ? 'var(--accent-red)' : 'var(--accent-green)' }}>
                  {k.is_revoked ? 'Revoked' : 'Active'}
                </span>
                {!k.is_revoked && (
                  <button
                    type="button"
                    onClick={() => handleRevokeKey(k.id)}
                    disabled={revokingId === k.id}
                    className="text-red-500 hover:underline"
                  >
                    Revoke
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={handleGenerateKey}
            disabled={activeKeys.length >= maxApiKeys}
            className="font-mono text-xs px-4 py-2 border rounded-sm"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
          >
            Generate new key
          </button>
        </OsintCard>
      )}

      <OsintCard>
        <button
          type="button"
          onClick={handleSignOut}
          className="font-mono text-xs px-4 py-2 border rounded-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          Sign out
        </button>
      </OsintCard>

      {newKeyModal && (
        <div
          className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
          onClick={() => setNewKeyModal(null)}
        >
          <div onClick={(e) => e.stopPropagation()} className="max-w-lg w-full">
            <OsintCard className="w-full border-2" style={{ borderColor: 'var(--accent-gold)' }}>
            <p className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--accent-gold)' }}>
              New API key
            </p>
            <p className="font-mono text-sm break-all mb-4" style={{ color: 'var(--text-primary)' }}>
              {newKeyModal.key}
            </p>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(newKeyModal!.key);
              }}
              className="font-mono text-xs px-4 py-2 border rounded-sm mb-4"
              style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
            >
              Copy
            </button>
            <p className="font-mono text-xs mb-4" style={{ color: 'var(--accent-red)' }}>
              Store this key safely. It will not be shown again.
            </p>
            <button
              type="button"
              onClick={() => setNewKeyModal(null)}
              className="font-mono text-xs px-4 py-2 border rounded-sm"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Dismiss
            </button>
            </OsintCard>
          </div>
        </div>
      )}
    </div>
  );
}
