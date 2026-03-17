'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { OsintCard } from '@/components/OsintCard';
import type { PricingData, PricesByCurrency } from '@/app/(platform)/pricing/page';

const BASE = (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SUPABASE_URL) || '';
const ANON_KEY =
  (typeof process !== 'undefined' &&
    (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)) ||
  '';

const CURRENCY_LABELS: Record<keyof PricesByCurrency, string> = { usd: 'USD', aed: 'AED', egp: 'EGP' };

type Props = PricingData;

function formatPrice(n: number, currency: keyof PricesByCurrency): string {
  if (currency === 'egp') return `${n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  return n.toFixed(2);
}

export function PricingClient({ prices, features, preferredCurrency, isLoggedIn }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState<'informed' | 'professional' | 'report' | null>(null);

  const supabase = createClient();

  const callCheckout = async (type: 'subscription' | 'one_time', plan?: 'informed' | 'professional') => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) {
      router.push('/login?redirect=/pricing');
      return;
    }
    const key = type === 'one_time' ? 'report' : loading;
    setLoading(type === 'one_time' ? 'report' : plan ?? null);
    try {
      const body = type === 'one_time' ? { type: 'one_time', currency: preferredCurrency } : { type: 'subscription', plan, currency: preferredCurrency };
      const res = await fetch(`${BASE}/functions/v1/create-checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}`, apikey: ANON_KEY },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data?.url) window.location.href = data.url;
    } finally {
      setLoading(null);
    }
  };

  const primaryPrice = (tier: 'informed' | 'professional') => {
    const n = prices[tier][preferredCurrency];
    return `${CURRENCY_LABELS[preferredCurrency]} ${formatPrice(n, preferredCurrency)}`;
  };

  const secondaryPrices = (tier: 'informed' | 'professional') => {
    const others = (['usd', 'aed', 'egp'] as const).filter((c) => c !== preferredCurrency);
    return others.map((c) => `${CURRENCY_LABELS[c]} ${formatPrice(prices[tier][c], c)}`).join(' · ');
  };

  const featureAccess = (tier: 'free' | 'informed' | 'professional') => (key: string) => {
    const f = features.find((x) => x.feature_key === key);
    if (!f) return false;
    if (tier === 'free') return f.free_access;
    if (tier === 'informed') return f.informed_access;
    return f.pro_access;
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}>
      <div className="max-w-6xl mx-auto px-6 py-12">
        <h1
          className="text-center mb-12"
          style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(28px, 4vw, 36px)', letterSpacing: '4px', color: 'var(--accent-gold)' }}
        >
          ◆ CHOOSE YOUR PLAN
        </h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
          {/* Free */}
          <OsintCard className="flex flex-col">
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '24px', letterSpacing: '2px', color: 'var(--text-primary)', marginBottom: '8px' }}>
              Free
            </h2>
            <p className="font-mono text-sm" style={{ color: 'var(--text-muted)' }}>{CURRENCY_LABELS[preferredCurrency]} 0 /month</p>
            <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              {(['usd', 'aed', 'egp'] as const).filter((c) => c !== preferredCurrency).map((c) => `${CURRENCY_LABELS[c]} 0`).join(' · ')}
            </p>
            <ul className="font-mono text-xs mt-6 flex-1 space-y-2" style={{ color: 'var(--text-secondary)' }}>
              {features.slice(0, 8).map((f) => (
                <li key={f.feature_key}>
                  {featureAccess('free')(f.feature_key) ? '✓' : '—'} {f.description ?? f.feature_key}
                </li>
              ))}
            </ul>
            <Link
              href={isLoggedIn ? '/account' : '/login'}
              className="font-mono text-xs px-4 py-2 border rounded-sm inline-block mt-6 text-center"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Start free →
            </Link>
          </OsintCard>

          {/* Informed */}
          <OsintCard className="flex flex-col">
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '24px', letterSpacing: '2px', color: '#1E90FF', marginBottom: '8px' }}>
              Informed
            </h2>
            <p className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{primaryPrice('informed')} /month</p>
            <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{secondaryPrices('informed')}</p>
            <ul className="font-mono text-xs mt-6 flex-1 space-y-2" style={{ color: 'var(--text-secondary)' }}>
              {features.slice(0, 8).map((f) => (
                <li key={f.feature_key}>
                  {featureAccess('informed')(f.feature_key) ? '✓' : '—'} {f.description ?? f.feature_key}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => callCheckout('subscription', 'informed')}
              disabled={!!loading}
              className="font-mono text-xs px-4 py-2 border rounded-sm mt-6 w-full"
              style={{ borderColor: '#1E90FF', color: '#1E90FF' }}
            >
              {loading === 'informed' ? 'Opening…' : 'Subscribe →'}
            </button>
          </OsintCard>

          {/* Professional */}
          <OsintCard className="flex flex-col relative" style={{ borderColor: 'var(--accent-gold)', borderWidth: '2px' }}>
            <span className="font-mono text-xs absolute top-4 right-4" style={{ color: 'var(--accent-gold)' }}>◆ MOST COMPLETE</span>
            <h2 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: '24px', letterSpacing: '2px', color: 'var(--accent-gold)', marginBottom: '8px' }}>
              Professional
            </h2>
            <p className="font-mono text-sm" style={{ color: 'var(--text-primary)' }}>{primaryPrice('professional')} /month</p>
            <p className="font-mono text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{secondaryPrices('professional')}</p>
            <ul className="font-mono text-xs mt-6 flex-1 space-y-2" style={{ color: 'var(--text-secondary)' }}>
              {features.slice(0, 8).map((f) => (
                <li key={f.feature_key}>
                  {featureAccess('professional')(f.feature_key) ? '✓' : '—'} {f.description ?? f.feature_key}
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => callCheckout('subscription', 'professional')}
              disabled={!!loading}
              className="font-mono text-xs px-4 py-2 border rounded-sm mt-6 w-full"
              style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
            >
              {loading === 'professional' ? 'Opening…' : 'Subscribe →'}
            </button>
          </OsintCard>
        </div>

        <OsintCard className="max-w-2xl mx-auto">
          <h2 className="font-mono text-xs uppercase mb-2" style={{ color: 'var(--text-muted)' }}>Single report purchase</h2>
          <p className="font-mono text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
            Need just one report? Purchase a single day&apos;s intelligence package.
          </p>
          <p className="font-mono text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
            USD {formatPrice(prices.report.usd, 'usd')} · AED {formatPrice(prices.report.aed, 'aed')} · EGP {formatPrice(prices.report.egp, 'egp')}
          </p>
          <button
            type="button"
            onClick={() => callCheckout('one_time')}
            disabled={!!loading}
            className="font-mono text-xs px-4 py-2 border rounded-sm"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
          >
            {loading === 'report' ? 'Opening…' : 'Purchase report →'}
          </button>
        </OsintCard>
      </div>
    </div>
  );
}
