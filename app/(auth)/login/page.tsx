'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { OsintCard } from '@/components/OsintCard';

const CALLBACK_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_SITE_URL)
    ? `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback`
    : (typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : '/auth/callback');

const APPLE_AUTH_ENABLED =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_APPLE_AUTH_ENABLED === 'true';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') || '/account';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [magicEmail, setMagicEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [magicSent, setMagicSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      router.replace(redirectTo);
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'apple' | 'github' | 'azure') => {
    setError(null);
    const base = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '');
    const callbackUrl = base ? `${base}/auth/callback?next=${encodeURIComponent(redirectTo)}` : CALLBACK_URL;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: provider === 'azure' ? 'azure' : provider,
      options: { redirectTo: callbackUrl },
    });
    if (err) setError(err.message);
  };

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMagicSent(false);
    setLoading(true);
    try {
      const base = typeof window !== 'undefined' ? window.location.origin : (process.env.NEXT_PUBLIC_SITE_URL || '');
      const callbackUrl = base ? `${base}/auth/callback?next=${encodeURIComponent(redirectTo)}` : CALLBACK_URL;
      const { error: err } = await supabase.auth.signInWithOtp({
        email: magicEmail,
        options: { emailRedirectTo: callbackUrl },
      });
      setLoading(false);
      if (err) {
        setError(err.message);
        return;
      }
      setMagicSent(true);
    } catch {
      setError('Something went wrong');
      setLoading(false);
    }
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
          Sign in
        </p>

        <form onSubmit={handleSignIn} className="space-y-4">
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
          <div>
            <label className="block font-mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
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
            Sign in
          </button>
        </form>

        <p className="font-mono text-xs my-6 text-center" style={{ color: 'var(--text-muted)' }}>
          — or continue with —
        </p>

        <div className="flex flex-wrap gap-2 justify-center">
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            className="font-mono text-xs px-4 py-2 border rounded-sm hover:opacity-90"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Google
          </button>
          {APPLE_AUTH_ENABLED && (
            <button
              type="button"
              onClick={() => handleOAuth('apple')}
              className="font-mono text-xs px-4 py-2 border rounded-sm hover:opacity-90"
              style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            >
              Apple
            </button>
          )}
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            className="font-mono text-xs px-4 py-2 border rounded-sm hover:opacity-90"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            GitHub
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('azure')}
            className="font-mono text-xs px-4 py-2 border rounded-sm hover:opacity-90"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
          >
            Microsoft
          </button>
        </div>

        <p className="font-mono text-xs mt-6 mb-2" style={{ color: 'var(--text-muted)' }}>
          Magic link
        </p>
        <form onSubmit={handleMagicLink} className="flex gap-2">
          <input
            type="email"
            value={magicEmail}
            onChange={(e) => setMagicEmail(e.target.value)}
            placeholder="your@email.com"
            className="flex-1 font-mono text-sm px-3 py-2 rounded-sm border bg-transparent"
            style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
          />
          <button
            type="submit"
            disabled={loading}
            className="font-mono text-xs px-4 py-2 border rounded-sm shrink-0 hover:opacity-90"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
          >
            Send magic link
          </button>
        </form>
        {magicSent && (
          <p className="font-mono text-xs mt-2" style={{ color: 'var(--accent-green)' }}>
            Check your email for a sign-in link
          </p>
        )}

        <div className="mt-8 flex flex-wrap gap-4 font-mono text-xs" style={{ color: 'var(--accent-gold)' }}>
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/">Continue without account →</Link>
        </div>
      </OsintCard>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[80vh] flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}><OsintCard className="w-full max-w-md"><p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p></OsintCard></div>}>
      <LoginContent />
    </Suspense>
  );
}
