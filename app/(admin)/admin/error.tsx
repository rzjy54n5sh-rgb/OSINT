'use client';

import Link from 'next/link';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center p-8"
      style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <p className="font-display text-xl mb-2" style={{ color: 'var(--accent-gold)' }}>
        ◆ ADMIN ERROR
      </p>
      <p className="font-mono text-sm mb-6 max-w-md text-center" style={{ color: 'var(--text-secondary)' }}>
        {error.message}
      </p>
      <div className="flex gap-4">
        <button
          type="button"
          onClick={reset}
          className="font-mono text-xs px-4 py-2 border rounded-sm"
          style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
        >
          Try again
        </button>
        <Link
          href="/admin"
          className="font-mono text-xs px-4 py-2 border rounded-sm no-underline"
          style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
        >
          ← Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
