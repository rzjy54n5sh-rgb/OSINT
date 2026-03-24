'use client';

import { useState, useMemo } from 'react';
import { cancelSubscriptionAction } from '@/app/(admin)/admin/subscriptions/actions';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

interface Subscription {
  id: string;
  user_id: string;
  plan: string;
  status: string;
  currency: string;
  amount?: number;
  current_period_end?: string;
  stripe_subscription_id?: string;
  created_at?: string;
  billing_cycle?: string;
  cancel_at_period_end?: boolean;
}

interface Props {
  subscriptions: Subscription[];
  emailByUserId: Record<string, string>;
  role: string;
  stripeDashboardUrl: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

type TabKey = 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused' | 'all';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'active', label: 'ACTIVE' },
  { key: 'trialing', label: 'TRIALING' },
  { key: 'past_due', label: 'PAST DUE' },
  { key: 'canceled', label: 'CANCELLED' },
  { key: 'paused', label: 'PAUSED' },
  { key: 'all', label: 'ALL' },
];

const PAGE_SIZE = 20;

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function statusColor(status: string): { bg: string; text: string } {
  switch (status) {
    case 'active':
      return { bg: 'rgba(34,197,94,0.15)', text: '#22C55E' };
    case 'trialing':
      return { bg: 'rgba(59,130,246,0.15)', text: '#3B82F6' };
    case 'past_due':
      return { bg: 'rgba(239,68,68,0.15)', text: '#EF4444' };
    case 'canceled':
      return { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' };
    case 'paused':
      return { bg: 'rgba(234,179,8,0.15)', text: '#EAB308' };
    default:
      return { bg: 'rgba(107,114,128,0.15)', text: '#6B7280' };
  }
}

function statusLabel(status: string): string {
  if (status === 'past_due') return 'PAST DUE';
  return status.toUpperCase();
}

function formatDate(iso: string | undefined | null): string {
  if (!iso) return '\u2014';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function toMrr(amount: number | undefined, currency: string): number {
  if (amount == null) return 0;
  const cents = amount >= 100 ? amount / 100 : amount;
  if (currency.toLowerCase() !== 'usd') return 0;
  return cents;
}

function formatUsd(value: number): string {
  return '$' + value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function SubscriptionsClient({ subscriptions, emailByUserId, role, stripeDashboardUrl }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('active');
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [actionOpen, setActionOpen] = useState<string | null>(null);

  const canAct = role === 'SUPER_ADMIN' || role === 'USER_MANAGER';

  /* ---------- Stats ---------- */

  const stats = useMemo(() => {
    let mrr = 0;
    let active = 0;
    let trialing = 0;
    let pastDue = 0;
    let churned30d = 0;
    const now = Date.now();
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;

    for (const s of subscriptions) {
      if (s.status === 'active') {
        active++;
        mrr += toMrr(s.amount, s.currency);
      }
      if (s.status === 'trialing') trialing++;
      if (s.status === 'past_due') pastDue++;
      if (s.status === 'canceled') {
        const end = s.current_period_end ? new Date(s.current_period_end).getTime() : 0;
        if (end >= thirtyDaysAgo) churned30d++;
      }
    }

    return { mrr, active, trialing, pastDue, churned30d };
  }, [subscriptions]);

  /* ---------- Filtered + paginated ---------- */

  const filtered = useMemo(() => {
    if (activeTab === 'all') return subscriptions;
    return subscriptions.filter((s) => s.status === activeTab);
  }, [subscriptions, activeTab]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const pastDueSubs = useMemo(() => subscriptions.filter((s) => s.status === 'past_due'), [subscriptions]);

  /* ---------- Handlers ---------- */

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel at period end? The user will keep access until then.')) return;
    setCancelling(id);
    setActionOpen(null);
    await cancelSubscriptionAction(id);
    setCancelling(null);
    window.location.reload();
  };

  const handlePause = (id: string) => {
    setActionOpen(null);
    alert(`Pause functionality for subscription ${id} requires Stripe integration. Use Stripe dashboard.`);
  };

  const handleChangePlan = (id: string) => {
    setActionOpen(null);
    alert(`Plan change for subscription ${id} requires Stripe integration. Use Stripe dashboard.`);
  };

  const stripeLink = (stripeSubId: string | undefined) =>
    stripeSubId ? `${stripeDashboardUrl}/subscriptions/${stripeSubId}` : null;

  /* ---------- Render ---------- */

  return (
    <div className="p-6 max-w-6xl">
      <h1
        className="font-mono text-sm uppercase mb-6"
        style={{ color: 'var(--text-muted)' }}
      >
        Subscription Management
      </h1>

      {/* ====== PAST DUE BANNER ====== */}
      {pastDueSubs.length > 0 && (
        <div
          className="rounded border px-4 py-3 mb-6 flex items-center gap-3"
          style={{
            borderColor: '#EF4444',
            background: 'rgba(239,68,68,0.08)',
          }}
        >
          <span
            className="font-mono text-[11px] font-bold uppercase tracking-wider"
            style={{ color: '#EF4444' }}
          >
            WARNING
          </span>
          <span className="font-mono text-xs" style={{ color: '#EF4444' }}>
            {pastDueSubs.length} subscription{pastDueSubs.length !== 1 ? 's' : ''} past due
            {' \u2014 '}
            {pastDueSubs
              .slice(0, 3)
              .map((s) => emailByUserId[s.user_id] ?? s.user_id)
              .join(', ')}
            {pastDueSubs.length > 3 ? ` and ${pastDueSubs.length - 3} more` : ''}
          </span>
        </div>
      )}

      {/* ====== STATS BAR ====== */}
      <div className="flex flex-wrap gap-3 mb-6">
        <StatChip label="MRR (USD)" value={formatUsd(stats.mrr)} />
        <StatChip label="ACTIVE SUBS" value={String(stats.active)} />
        <StatChip label="TRIALING" value={String(stats.trialing)} />
        <StatChip
          label="PAST DUE"
          value={String(stats.pastDue)}
          valueColor={stats.pastDue > 0 ? '#EF4444' : undefined}
        />
        <StatChip label="CHURNED (30D)" value={String(stats.churned30d)} />
      </div>

      {/* ====== TAB BAR ====== */}
      <div className="flex flex-wrap gap-1 mb-6">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => {
                setActiveTab(tab.key);
                setPage(1);
              }}
              className="font-mono text-[11px] tracking-wider px-3 py-1.5 rounded-sm border transition-colors"
              style={{
                borderColor: isActive ? 'var(--accent-gold)' : 'var(--border)',
                color: isActive ? 'var(--accent-gold)' : 'var(--text-muted)',
                background: isActive ? 'rgba(212,175,55,0.08)' : 'transparent',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ====== TABLE ====== */}
      {filtered.length === 0 ? (
        <div
          className="rounded border p-8 text-center"
          style={{ borderColor: 'var(--border)' }}
        >
          <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>
            No subscriptions in this category.
          </p>
        </div>
      ) : (
        <div
          className="rounded border overflow-x-auto"
          style={{ borderColor: 'var(--border)' }}
        >
          <table className="w-full font-mono text-xs">
            <thead>
              <tr style={{ color: 'var(--text-muted)', background: 'rgba(0,0,0,0.2)' }}>
                <th className="text-left p-2 whitespace-nowrap">USER</th>
                <th className="text-left p-2 whitespace-nowrap">PLAN</th>
                <th className="text-left p-2 whitespace-nowrap">STATUS</th>
                <th className="text-left p-2 whitespace-nowrap">MRR</th>
                <th className="text-left p-2 whitespace-nowrap">STARTED</th>
                <th className="text-left p-2 whitespace-nowrap">NEXT BILLING</th>
                <th className="text-left p-2 whitespace-nowrap">ACTIONS</th>
              </tr>
            </thead>
            <tbody style={{ color: 'var(--text-secondary)' }}>
              {paginated.map((s) => {
                const email = emailByUserId[s.user_id] ?? s.user_id;
                const sc = statusColor(s.status);
                const mrrVal = s.status === 'active' ? toMrr(s.amount, s.currency) : 0;
                const cycle = s.billing_cycle ?? 'monthly';
                const link = stripeLink(s.stripe_subscription_id);
                const isActionOpen = actionOpen === s.id;

                return (
                  <tr key={s.id} className="hover:bg-white/5 border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* USER */}
                    <td className="p-2 max-w-[200px]">
                      {link ? (
                        <a
                          href={link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:underline"
                          style={{ color: 'var(--accent-gold)' }}
                        >
                          {email}
                        </a>
                      ) : (
                        <span>{email}</span>
                      )}
                    </td>

                    {/* PLAN */}
                    <td className="p-2 whitespace-nowrap">
                      <span className="uppercase">{s.plan}</span>
                      <span className="ml-1 text-[11px]" style={{ color: 'var(--text-muted)' }}>
                        {cycle}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="p-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide"
                        style={{ background: sc.bg, color: sc.text }}
                      >
                        {statusLabel(s.status)}
                      </span>
                      {s.cancel_at_period_end && (
                        <span
                          className="ml-1 text-[11px]"
                          style={{ color: 'var(--text-muted)' }}
                        >
                          (cancels)
                        </span>
                      )}
                    </td>

                    {/* MRR */}
                    <td className="p-2 whitespace-nowrap">
                      {mrrVal > 0 ? formatUsd(mrrVal) : '\u2014'}
                    </td>

                    {/* STARTED */}
                    <td className="p-2 whitespace-nowrap">
                      {formatDate(s.created_at)}
                    </td>

                    {/* NEXT BILLING */}
                    <td className="p-2 whitespace-nowrap">
                      {s.status === 'canceled' ? '\u2014' : formatDate(s.current_period_end)}
                    </td>

                    {/* ACTIONS */}
                    <td className="p-2 relative">
                      {canAct ? (
                        <div className="relative inline-block">
                          <button
                            type="button"
                            onClick={() => setActionOpen(isActionOpen ? null : s.id)}
                            disabled={cancelling === s.id}
                            className="font-mono text-[11px] px-2 py-1 border rounded-sm"
                            style={{
                              borderColor: 'var(--border)',
                              color: cancelling === s.id ? 'var(--text-muted)' : 'var(--text-secondary)',
                            }}
                          >
                            {cancelling === s.id ? 'Cancelling\u2026' : 'Actions \u25BE'}
                          </button>

                          {isActionOpen && (
                            <>
                              {/* Click-away overlay */}
                              <div
                                className="fixed inset-0 z-30"
                                onClick={() => setActionOpen(null)}
                              />
                              <div
                                className="absolute right-0 top-full mt-1 z-40 rounded border shadow-lg min-w-[160px]"
                                style={{
                                  background: 'var(--bg)',
                                  borderColor: 'var(--border)',
                                }}
                              >
                                {s.status === 'active' && !s.cancel_at_period_end && (
                                  <button
                                    type="button"
                                    onClick={() => handleCancel(s.id)}
                                    className="block w-full text-left font-mono text-[11px] px-3 py-2 hover:bg-white/5"
                                    style={{ color: '#EF4444' }}
                                  >
                                    Cancel Subscription
                                  </button>
                                )}
                                {(s.status === 'active' || s.status === 'trialing') && (
                                  <button
                                    type="button"
                                    onClick={() => handlePause(s.id)}
                                    className="block w-full text-left font-mono text-[11px] px-3 py-2 hover:bg-white/5"
                                    style={{ color: '#EAB308' }}
                                  >
                                    Pause Subscription
                                  </button>
                                )}
                                {(s.status === 'active' || s.status === 'trialing') && (
                                  <button
                                    type="button"
                                    onClick={() => handleChangePlan(s.id)}
                                    className="block w-full text-left font-mono text-[11px] px-3 py-2 hover:bg-white/5"
                                    style={{ color: 'var(--accent-gold)' }}
                                  >
                                    Change Plan
                                  </button>
                                )}
                                {link && (
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full text-left font-mono text-[11px] px-3 py-2 hover:bg-white/5"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    Open in Stripe &#x2197;
                                  </a>
                                )}
                                {/* Fallback: if no actions are available for the status */}
                                {s.status === 'canceled' && !link && (
                                  <span
                                    className="block font-mono text-[11px] px-3 py-2"
                                    style={{ color: 'var(--text-muted)' }}
                                  >
                                    No actions available
                                  </span>
                                )}
                                {s.status === 'canceled' && link && (
                                  <a
                                    href={link}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block w-full text-left font-mono text-[11px] px-3 py-2 hover:bg-white/5"
                                    style={{ color: 'var(--text-secondary)' }}
                                  >
                                    Open in Stripe &#x2197;
                                  </a>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
                          View only
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ====== PAGINATION ====== */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between mt-4">
          <span className="font-mono text-[11px]" style={{ color: 'var(--text-muted)' }}>
            {filtered.length} subscription{filtered.length !== 1 ? 's' : ''} &middot; page {page} of {totalPages}
          </span>
          <div className="flex gap-1">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="font-mono text-[11px] px-3 py-1 border rounded-sm disabled:opacity-30"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Prev
            </button>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let pageNum: number;
              if (totalPages <= 7) {
                pageNum = i + 1;
              } else if (page <= 4) {
                pageNum = i + 1;
              } else if (page >= totalPages - 3) {
                pageNum = totalPages - 6 + i;
              } else {
                pageNum = page - 3 + i;
              }
              return (
                <button
                  key={pageNum}
                  type="button"
                  onClick={() => setPage(pageNum)}
                  className="font-mono text-[11px] px-2 py-1 border rounded-sm min-w-[28px]"
                  style={{
                    borderColor: page === pageNum ? 'var(--accent-gold)' : 'var(--border)',
                    color: page === pageNum ? 'var(--accent-gold)' : 'var(--text-muted)',
                    background: page === pageNum ? 'rgba(212,175,55,0.08)' : 'transparent',
                  }}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="font-mono text-[11px] px-3 py-1 border rounded-sm disabled:opacity-30"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* ====== ROLE DISCLAIMER ====== */}
      {!canAct && (
        <p className="font-mono text-[11px] mt-4" style={{ color: 'var(--text-muted)' }}>
          View only (Finance Manager) &mdash; contact a Super Admin or User Manager to make changes.
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  StatChip sub-component                                            */
/* ------------------------------------------------------------------ */

function StatChip({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded border px-4 py-2 min-w-[120px]"
      style={{ borderColor: 'var(--border)', background: 'rgba(0,0,0,0.15)' }}
    >
      <div
        className="font-mono tracking-wider uppercase"
        style={{ fontSize: '11px', color: 'var(--accent-gold)' }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "'Bebas Neue', sans-serif",
          fontSize: '20px',
          color: valueColor ?? 'var(--text-primary)',
          lineHeight: 1.2,
        }}
      >
        {value}
      </div>
    </div>
  );
}
