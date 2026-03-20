import Link from 'next/link';

export const metadata = {
  title: 'Unsubscribe · MENA Intel Desk',
  description: 'Manage email preferences for MENA Intel Desk',
};

export default function UnsubscribePage() {
  return (
    <div className="max-w-lg mx-auto px-4 py-16 font-mono text-sm" style={{ color: 'var(--text-primary)' }}>
      <h1 className="font-display text-2xl mb-4" style={{ color: 'var(--accent-gold)' }}>
        ◆ Email preferences
      </h1>
      <p className="mb-4" style={{ color: 'var(--text-secondary)' }}>
        Newsletter and marketing sign-ups are managed from the list you joined. If you have an account, you can turn off the{' '}
        <strong>daily conflict digest</strong> (07:00 UTC briefing) from your account settings.
      </p>
      <Link
        href="/account"
        className="inline-block px-4 py-2 border rounded-sm"
        style={{ borderColor: 'var(--accent-gold)', color: 'var(--accent-gold)' }}
      >
        Open account →
      </Link>
      <p className="mt-8 text-xs" style={{ color: 'var(--text-muted)' }}>
        MENA Intel Desk · Open Source Intelligence
      </p>
    </div>
  );
}
