'use client';

import { useId, useState } from 'react';
import { anonInsert } from '@/lib/supabase/anon-insert';

interface EmailCaptureProps {
  /** Which page this is on. Stored in subscribers.source — must match ^[a-z0-9_-]{1,50}$. */
  source?: string;
  compact?: boolean;
  /** Heading above the field (non-compact only). */
  heading?: string;
  /** Explanation under the heading (non-compact only). */
  blurb?: string;
  /** Accessible name of the email field. */
  inputLabel?: string;
  /** Button text (non-compact only). */
  buttonLabel?: string;
  /** Message shown after a successful signup. */
  successText?: string;
}

const DEFAULT_BLURB =
  'Receive an email when there is a significant shift in scenario probabilities, a new country report, or a platform update. No marketing. No third parties. Unsubscribe any time.';

export function EmailCapture({
  source = 'platform',
  compact = false,
  heading = '◆ GET NOTIFIED OF MAJOR UPDATES',
  blurb = DEFAULT_BLURB,
  inputLabel = 'Email address',
  buttonLabel = '◆ SUBSCRIBE',
  successText = '✓ SUBSCRIBED — You will be notified of major platform updates.',
}: EmailCaptureProps) {
  const inputId = useId();
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error' | 'duplicate'>('idle');

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const submit = async () => {
    if (!isValidEmail(email)) return;
    setStatus('submitting');
    // anon role only: see anonInsert (signed-in visitors were refused by RLS with the session client).
    setStatus(await anonInsert('subscribers', { email: email.trim().toLowerCase(), source }));
  };

  if (status === 'done') {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--accent-green)', padding: compact ? '6px 0' : '12px 0' }}>
        {successText}
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--accent-gold)', padding: compact ? '6px 0' : '12px 0' }}>
        ◆ Already subscribed.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? 8 : 10 }}>
      {!compact && (
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 4 }}>
          {heading}
        </div>
      )}
      {!compact && blurb && (
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.6 }}>
          {blurb}
        </p>
      )}
      <label htmlFor={inputId} className="sr-only">
        {inputLabel}
      </label>
      <input
        id={inputId}
        type="email"
        name="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="your@email.com"
        disabled={status === 'submitting'}
        style={{
          flex: compact ? 1 : undefined,
          background: 'var(--bg-primary)',
          border: '1px solid var(--border)',
          color: 'var(--text-primary)',
          fontFamily: 'IBM Plex Mono',
          fontSize: 12,
          padding: '7px 10px',
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!isValidEmail(email) || status === 'submitting'}
        style={{
          fontFamily: 'IBM Plex Mono', fontSize: 11, letterSpacing: '1.5px',
          padding: '7px 16px', border: '1px solid',
          borderColor: isValidEmail(email) ? 'var(--accent-gold)' : 'var(--border)',
          color: isValidEmail(email) ? 'var(--accent-gold)' : 'var(--text-muted)',
          background: 'none', cursor: isValidEmail(email) ? 'pointer' : 'default',
          opacity: status === 'submitting' ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {status === 'submitting' ? 'SAVING...' : compact ? 'SUBSCRIBE ↗' : buttonLabel}
      </button>
      {status === 'error' && (
        <span role="alert" style={{ fontFamily: 'IBM Plex Mono', fontSize: 11, color: 'var(--accent-red)' }}>
          Error — please try again.
        </span>
      )}
    </div>
  );
}
