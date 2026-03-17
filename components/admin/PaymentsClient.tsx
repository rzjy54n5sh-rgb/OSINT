'use client';

import { useState } from 'react';
import { refundPaymentAction } from '@/app/(admin)/admin/payments/actions';

const formatCents = (c: number) => (c >= 100 ? (c / 100).toFixed(2) : String(c));
const statusColor = (s: string) => {
  if (s === 'succeeded') return 'var(--accent-green)';
  if (s === 'pending') return 'var(--text-muted)';
  if (s === 'failed') return 'var(--accent-red)';
  if (s === 'refunded' || s === 'partially_refunded') return 'var(--accent-gold)';
  return 'var(--text-secondary)';
};

export function PaymentsClient({
  mrr,
  payments,
  emailByUserId,
  role,
  stripeDashboardUrl,
}: {
  mrr: { usd: number; aed: number; egp: number };
  payments: { id: string; user_id: string; type: string; amount: number; currency: string; status: string; description: string | null; stripe_payment_intent_id: string | null; stripe_charge_id: string | null; created_at: string }[];
  emailByUserId: Record<string, string>;
  role: string;
  stripeDashboardUrl: string;
}) {
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [currencyFilter, setCurrencyFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [refunding, setRefunding] = useState<string | null>(null);
  const [refundModal, setRefundModal] = useState<{ id: string; amount: number; currency: string } | null>(null);
  const [refundReason, setRefundReason] = useState('');
  const isSa = role === 'SUPER_ADMIN';

  const filtered = payments.filter((p) => {
    if (typeFilter && p.type !== typeFilter) return false;
    if (statusFilter && p.status !== statusFilter) return false;
    if (currencyFilter && p.currency.toLowerCase() !== currencyFilter.toLowerCase()) return false;
    if (dateFrom && p.created_at < dateFrom) return false;
    if (dateTo && p.created_at > dateTo + 'T23:59:59.999Z') return false;
    return true;
  });
  const failedPayments = payments.filter((p) => p.status === 'failed');

  const handleRefundSubmit = async () => {
    if (!refundModal) return;
    setRefunding(refundModal.id);
    await refundPaymentAction(refundModal.id, refundReason);
    setRefunding(null);
    setRefundModal(null);
    setRefundReason('');
    window.location.reload();
  };

  return (
    <div className="p-6 max-w-6xl">
      <h1 className="font-mono text-sm uppercase mb-6" style={{ color: 'var(--text-muted)' }}>Payments</h1>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="rounded border p-4 font-mono text-sm" style={{ borderColor: 'var(--border)' }}>
          <div style={{ color: 'var(--text-muted)' }}>MRR (USD)</div>
          <div className="text-lg" style={{ color: 'var(--accent-gold)' }}>{formatCents(mrr.usd)}</div>
        </div>
        <div className="rounded border p-4 font-mono text-sm" style={{ borderColor: 'var(--border)' }}>
          <div style={{ color: 'var(--text-muted)' }}>MRR (AED)</div>
          <div className="text-lg" style={{ color: 'var(--accent-gold)' }}>{formatCents(mrr.aed)}</div>
        </div>
        <div className="rounded border p-4 font-mono text-sm" style={{ borderColor: 'var(--border)' }}>
          <div style={{ color: 'var(--text-muted)' }}>MRR (EGP)</div>
          <div className="text-lg" style={{ color: 'var(--accent-gold)' }}>{formatCents(mrr.egp)}</div>
        </div>
      </div>

      {failedPayments.length > 0 && (
        <div className="rounded border p-4 mb-6" style={{ borderColor: 'var(--accent-red)', background: 'rgba(220,38,38,0.08)' }}>
          <h2 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--accent-red)' }}>Failed payments</h2>
          <ul className="space-y-1 font-mono text-xs">
            {failedPayments.map((p) => (
              <li key={p.id}>
                {emailByUserId[p.user_id]} — {formatCents(p.amount)} {p.currency} —{' '}
                <a href={`${stripeDashboardUrl}/payments/${p.stripe_payment_intent_id || ''}`} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent-gold)' }}>
                  Retry in Stripe ↗
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-6">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All types</option>
          <option value="subscription">Subscription</option>
          <option value="one_time_report">One-time report</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All statuses</option>
          <option value="succeeded">Succeeded</option>
          <option value="pending">Pending</option>
          <option value="failed">Failed</option>
          <option value="refunded">Refunded</option>
        </select>
        <select value={currencyFilter} onChange={(e) => setCurrencyFilter(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
          <option value="">All currencies</option>
          <option value="usd">USD</option>
          <option value="aed">AED</option>
          <option value="egp">EGP</option>
        </select>
        <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)' }} />
        <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="font-mono text-xs px-2 py-1.5 rounded border bg-transparent" style={{ borderColor: 'var(--border)' }} />
      </div>

      <div className="rounded border overflow-x-auto" style={{ borderColor: 'var(--border)' }}>
        <table className="w-full font-mono text-xs">
          <thead>
            <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
              <th className="text-left p-2">User</th>
              <th className="text-left p-2">Type</th>
              <th className="text-left p-2">Amount</th>
              <th className="text-left p-2">Currency</th>
              <th className="text-left p-2">Status</th>
              <th className="text-left p-2">Description</th>
              <th className="text-left p-2">Date</th>
              {isSa && <th className="text-left p-2">Actions</th>}
            </tr>
          </thead>
          <tbody style={{ color: 'var(--text-secondary)' }}>
            {filtered.map((p) => (
              <tr key={p.id}>
                <td className="p-2">{emailByUserId[p.user_id] ?? p.user_id}</td>
                <td className="p-2">{p.type}</td>
                <td className="p-2">{formatCents(p.amount)}</td>
                <td className="p-2">{p.currency.toUpperCase()}</td>
                <td className="p-2" style={{ color: statusColor(p.status) }}>{p.status}</td>
                <td className="p-2">{p.description ?? '—'}</td>
                <td className="p-2">{new Date(p.created_at).toLocaleString()}</td>
                {isSa && (
                  <td className="p-2">
                    {p.status === 'succeeded' && (
                      <button type="button" onClick={() => setRefundModal({ id: p.id, amount: p.amount, currency: p.currency })} className="font-mono text-[10px] px-2 py-1 border rounded-sm" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>
                        Refund
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {refundModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70" onClick={() => !refunding && setRefundModal(null)}>
          <div className="rounded border p-6 max-w-md w-full font-mono text-xs" style={{ borderColor: 'var(--border)', background: 'var(--bg-secondary)' }} onClick={(e) => e.stopPropagation()}>
            <p className="mb-2" style={{ color: 'var(--text-muted)' }}>Refund: {formatCents(refundModal.amount)} {refundModal.currency}</p>
            <label className="block mb-2" style={{ color: 'var(--text-secondary)' }}>Reason (optional)</label>
            <input type="text" value={refundReason} onChange={(e) => setRefundReason(e.target.value)} placeholder="Reason for refund" className="w-full px-2 py-1.5 rounded border mb-4 bg-transparent" style={{ borderColor: 'var(--border)' }} />
            <div className="flex gap-2">
              <button type="button" onClick={handleRefundSubmit} disabled={!!refunding} className="px-3 py-1.5 rounded border" style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}>Confirm refund</button>
              <button type="button" onClick={() => setRefundModal(null)} disabled={!!refunding} className="px-3 py-1.5 rounded border" style={{ borderColor: 'var(--border)' }}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
