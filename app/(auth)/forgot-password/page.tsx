'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { OsintCard } from '@/components/OsintCard';

const SITE_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL) ||
  (typeof window !== 'undefined' ? window.location.origin : '');

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const redirectTo = SITE_URL ? `${SITE_URL}/reset-password` : `${typeof window !== 'undefined' ? window.location.origin : ''}/reset-password`;
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo,
    });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSent(true);
  };

  return (
    <div
      className="min-h-[80vh] flex items-center justify-center p-4"
      style={{ background: 'var(--bg-primary)' }}
    >
      <OsintCard className="w-full max-w-md">
        <p className="font-display text-2xl mb-6" style={{ color: 'var(--accent-gold)' }}>
          ◆ MENA INTEL DESK
        </p>
        <p className="font-mono text-xs uppercase mb-6" style={{ color: 'var(--text-muted)' }}>
          Forgot password
        </p>

        {sent ? (
          <>
            <p className="font-mono text-sm mb-6" style={{ color: 'var(--text-primary)' }}>
              Check your email for a reset link. Link expires in 1 hour.
            </p>
            <Link
              href="/login"
              className="font-mono text-xs"
              style={{ color: 'var(--accent-gold)' }}
            >
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block font-mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full font-mono text-sm px-3 py-2 rounded-sm border bg-transparent"
                style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
              />
            </div>
            {error && (
              <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full font-mono text-sm py-2 border rounded-sm hover:opacity-90 disabled:opacity-50"
              style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
            >
              Send reset link
            </button>
          </form>
        )}

        {!sent && (
          <p className="mt-6 font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>
            <Link href="/login">Back to sign in</Link>
          </p>
        )}
      </OsintCard>
    </div>
  );
}
