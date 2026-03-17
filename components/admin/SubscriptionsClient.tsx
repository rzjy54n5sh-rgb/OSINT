'use client';

import { useState } from 'react';
import { cancelSubscriptionAction } from '@/app/(admin)/admin/subscriptions/actions';

export function SubscriptionsClient({
  subscriptions,
  emailByUserId,
  role,
  stripeDashboardUrl,
}: {
  subscriptions: { id: string; user_id: string; plan: string; status: string; currency: string; amount?: number; current_period_end?: string; stripe_subscription_id?: string }[];
  emailByUserId: Record<string, string>;
  role: string;
  stripeDashboardUrl: string;
}) {
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const canAct = role === 'SUPER_ADMIN' || role === 'USER_MANAGER';

  const filtered = subscriptions.filter((s) => {
    if (statusFilter && s.status !== statusFilter) return false;
    if (planFilter && s.plan !== planFilter) return false;
    if (currencyFilter && s.currency !== currencyFilter) return false;
    return true;
  });

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel at period end? The user will keep access until then.')) return;
    setCancelling(id);
    await cancelSubscriptionAction(id);
    setCancelling(null);
    window.location.reload();
  };

  const stripeLink = (stripeSubId: string | undefined) =>
    stripeSubId ? `${stripeDashboardUrl}/subscriptions/${stripeSubId}` : null;

  return (
    <div className="p-6 max-w-5xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Subscriptions</h1>
      <div className="flex flex-wrap gap-2 mb-6">
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="trialing">Trialing</option>
          <option value="past_due">Past due</option>
          <option value="canceled">Canceled</option>
        </select>
        <select value={planFilter} onChange={(e) => setPlanFilter(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All plans</option>
          <option value="informed">Informed</option>
          <option value="professional">Professional</option>
        </select>
        <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All currencies</option>
          <option value="usd">USD</option>
          <option value="aed">AED</option>
          <option value="egp">EGP</option>
        </select>
      </div>
      <div className={`rounded border overflow-x-auto ${!canAct ? 'opacity-90' : ''}`} style={{ borderColor: 'var(--border)', ...(!canAct ? { borderLeft: '3px solid var(--text-muted)' } : {}) }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">User</th>
              <th className="text-left p-2">Plan</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Currency</th>
              <th className="text-left p-2">Amount</th>
              <th className="text-left p-2">Period end</th>
              <th className="text-left p-2">Actions</th>
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {filtered.map((s) => (
              <tr key={s.id}>
                <td className="p-2">{emailByUserId[s.user_id] ?? s.user_id}</td>
                <td className="p-2">{s.plan}</td>
                <td className="p-2">{s.status}</td>
                <td className="p-2">{s.currency.toUpperCase()}</td>
                <td className="p-2">{s.amount != null ? (s.amount >= 100 ? s.amount / 100 : s.amount) : '—'}</td>
                <td className="p-2">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : '—'}</td>
                <td className="p-2">
                  {canAct && (
                    <>
                      {stripeLink(s.stripe_subscription_id) && (
                        <a href={stripeLink(s.stripe_subscription_id)!} target="_blank" rel="noopener noreferrer" className="font-mono text-[10px] mr-2" style={{ color: 'var(--accent-gold)' }}>
                          Stripe ↗
                        </a>
                      )}
                      {s.status === 'active' && (
                        <button type="button" onClick={() => handleCancel(s.id)} disabled={!!cancelling} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--accent-red)', color: 'var(--accent-red)' }}>
                          Cancel
                        </button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!canAct && <p className="font-mono text-[10px] mt-2" style={{ color: 'var(--text-muted)' }}>View only (Finance Manager)</p>}
    </div>
  );
}
