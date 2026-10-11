import type { Metadata } from 'next';
import Link from 'next/link';
import { OsintCard } from '@/components/OsintCard';
import { EmailCapture } from '@/components/EmailCapture';
import { pageMetadata } from '@/lib/site';

/**
 * /pricing — shop window (operator strategy, 2026-10-08): consumer prices are deferred, so this
 * page shows no prices and no checkout. It offers (a) founding access by email and (b) Chokepoint
 * Weekly for companies via /contact. The consumer price cards + Stripe checkout still exist in
 * PricingClient.tsx / load-pricing-data.ts and are simply not rendered.
 *
 * No cookies, no per-visitor data: the HTML is identical for everyone and cacheable (ISR).
 */
export const revalidate = 900;

export const metadata: Metadata = pageMetadata({
  title: 'Access — Founding Access & Chokepoint Weekly — MENA Intel Desk',
  description:
    'Founding access is free while MENA Intel Desk launches. Companies can ask about Chokepoint Weekly, a Monday brief on the Hormuz, Bab al-Mandeb, Red Sea and Suez corridors.',
  path: '/pricing',
});

/** subscribers.source must match ^[a-z0-9_-]{1,50}$. */
const FOUNDING_SOURCE = 'founding-access';

const eyebrow: React.CSSProperties = {
  fontFamily: 'IBM Plex Mono, monospace',
  fontSize: 11,
  letterSpacing: '2px',
  color: 'var(--accent-gold)',
  textTransform: 'uppercase',
  margin: 0,
};

const heading: React.CSSProperties = {
  fontFamily: 'Bebas Neue, sans-serif',
  fontSize: 'clamp(26px, 3.4vw, 34px)',
  letterSpacing: '1.5px',
  color: 'var(--text-primary)',
  lineHeight: 1.05,
  margin: '8px 0 12px',
};

const body: React.CSSProperties = {
  fontSize: 14,
  lineHeight: 1.65,
  color: 'var(--text-secondary)',
  margin: '0 0 12px',
};

export default function PricingPage() {
  return (
    <div className="min-h-screen" style={{ color: 'var(--text-primary)' }}>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-14">
        <header className="mb-10" style={{ maxWidth: 680 }}>
          <p style={eyebrow}>◆ Access</p>
          <h1
            style={{
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: 'clamp(34px, 5vw, 52px)',
              letterSpacing: '2px',
              lineHeight: 1,
              margin: '10px 0 14px',
              color: 'var(--text-primary)',
            }}
          >
            Corridor risk, measured
          </h1>
          <p style={{ ...body, fontSize: 15 }}>
            MENA Intel Desk is in its launch period. There is nothing to pay today. Readers can join as founding
            members; companies can ask about the weekly corridor brief.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* (a) Founding access */}
          <section aria-labelledby="founding-access-heading">
            <OsintCard className="h-full flex flex-col" style={{ borderColor: 'var(--accent-gold)' }}>
              <p style={eyebrow}>For readers</p>
              <h2 id="founding-access-heading" style={heading}>
                Founding access — free while we launch
              </h2>
              <p style={body}>
                Leave your email to join as a founding reader. We will write to you when Chokepoint Weekly and new
                access options open.
              </p>
              <div className="mt-auto pt-2">
                <EmailCapture
                  source={FOUNDING_SOURCE}
                  heading="◆ JOIN AS A FOUNDING READER"
                  blurb="No marketing. No third parties. Unsubscribe any time."
                  inputLabel="Email address for founding access"
                  buttonLabel="◆ JOIN — FREE"
                  successText="✓ YOU'RE ON THE FOUNDING LIST — we will email you when access opens."
                />
              </div>
            </OsintCard>
          </section>

          {/* (b) Chokepoint Weekly for companies */}
          <section aria-labelledby="chokepoint-weekly-heading">
            <OsintCard className="h-full flex flex-col">
              <p style={eyebrow}>For companies</p>
              <h2 id="chokepoint-weekly-heading" style={heading}>
                Chokepoint Weekly for companies
              </h2>
              <p style={body}>
                A short Monday brief on the shipping corridors your business depends on — the Strait of Hormuz, Bab
                al-Mandeb, the Red Sea and the Suez Canal — with every figure linked to its source.
              </p>
              <p style={body}>
                Built for shipping, logistics, trading and insurance teams. Tell us about your routes and we will
                reply about a pilot.
              </p>
              <div className="mt-auto pt-2">
                <Link
                  prefetch={false}
                  href="/contact?inquiry_type=subscription"
                  className="inline-block font-mono text-xs px-4 py-2 border rounded-sm"
                  style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)', letterSpacing: '1.5px' }}
                >
                  ASK ABOUT CHOKEPOINT WEEKLY →
                </Link>
              </div>
            </OsintCard>
          </section>
        </div>

        <p className="font-mono text-xs mt-8" style={{ color: 'var(--text-muted)', lineHeight: 1.7 }}>
          Already have an account?{' '}
          <Link prefetch={false} href="/login" style={{ color: 'var(--accent-gold)' }}>
            Sign in
          </Link>
          . Questions about the data or a correction?{' '}
          <Link prefetch={false} href="/contact" style={{ color: 'var(--accent-gold)' }}>
            Contact us
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
