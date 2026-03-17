import Link from 'next/link';

export default function AdminNotFound() {
  return (
    <div
      className="min-h-[60vh] flex flex-col items-center justify-center p-8"
      style={{ background: 'var(--bg)', color: 'var(--text-primary)' }}
    >
      <p className="font-display text-xl mb-2" style={{ color: 'var(--accent-gold)' }}>
        ◆ 404 — PAGE NOT FOUND
      </p>
      <p className="font-mono text-sm mb-6" style={{ color: 'var(--text-muted)' }}>
        This admin page does not exist.
      </p>
      <Link
        href="/admin"
        className="font-mono text-xs px-4 py-2 border rounded-sm no-underline"
        style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
      >
        ← Back to Dashboard
      </Link>
    </div>
  );
}
