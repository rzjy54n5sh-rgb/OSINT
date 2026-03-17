'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/utils/supabase/client';
import { OsintCard } from '@/components/OsintCard';

const MIN_PASSWORD_LENGTH = 8;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [hasSession, setHasSession] = useState<boolean | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) {
      setError(err.message);
      return;
    }
    setSuccess(true);
    setTimeout(() => router.push('/account'), 2000);
  };

  if (hasSession === null) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
        <p className="font-mono text-xs" style={{ color: 'var(--text-muted)' }}>Loading…</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
        <OsintCard className="w-full max-w-md">
          <p className="font-display text-2xl mb-6" style={{ color: 'var(--accent-gold)' }}>◆ MENA INTEL DESK</p>
          <p className="font-mono text-sm" style={{ color: 'var(--accent-red)' }}>Link expired or invalid. Request a new reset link from the login page.</p>
          <a href="/login" className="font-mono text-xs mt-4 inline-block" style={{ color: 'var(--accent-gold)' }}>Back to sign in</a>
        </OsintCard>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
        <OsintCard className="w-full max-w-md">
          <p className="font-display text-2xl mb-6" style={{ color: 'var(--accent-gold)' }}>◆ MENA INTEL DESK</p>
          <p className="font-mono text-sm" style={{ color: 'var(--accent-green)' }}>Password updated! Redirecting to account…</p>
        </OsintCard>
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4" style={{ background: 'var(--bg-primary)' }}>
      <OsintCard className="w-full max-w-md">
        <p className="font-display text-2xl mb-6" style={{ color: 'var(--accent-gold)' }}>
          ◆ MENA INTEL DESK
        </p>
        <p className="font-mono text-xs uppercase mb-6" style={{ color: 'var(--text-muted)' }}>
          Set new password
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block font-mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              New password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full font-mono text-sm px-3 py-2 rounded-sm border bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          <div>
            <label className="block font-mono text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>
              Confirm password
            </label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              minLength={MIN_PASSWORD_LENGTH}
              className="w-full font-mono text-sm px-3 py-2 rounded-sm border bg-transparent"
              style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
            />
          </div>
          {error && (
            <p className="font-mono text-xs" style={{ color: 'var(--accent-red)' }}>{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full font-mono text-sm py-2 border rounded-sm hover:opacity-90 disabled:opacity-50"
            style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
          >
            Update password
          </button>
        </form>
      </OsintCard>
    </div>
  );
}
