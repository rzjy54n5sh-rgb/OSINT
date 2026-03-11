'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface EmailCaptureProps {
  source?: string;  // which page this is on
  compact?: boolean;
}

export function EmailCapture({ source = 'platform', compact = false }: EmailCaptureProps) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error' | 'duplicate'>('idle');

  const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

  const submit = async () => {
    if (!isValidEmail(email)) return;
    setStatus('submitting');
    const supabase = createClient();
    const { error } = await supabase.from('subscribers').insert({ email: email.trim().toLowerCase(), source });
    if (!error) {
      setStatus('done');
    } else if (error.code === '23505') {
      setStatus('duplicate'); // unique constraint violation
    } else {
      setStatus('error');
    }
  };

  if (status === 'done') {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--accent-green)', padding: compact ? '6px 0' : '12px 0' }}>
        ✓ SUBSCRIBED — You will be notified of major platform updates.
      </div>
    );
  }

  if (status === 'duplicate') {
    return (
      <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--accent-gold)', padding: compact ? '6px 0' : '12px 0' }}>
        ◆ Already subscribed.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: compact ? 'row' : 'column', gap: compact ? 8 : 10 }}>
      {!compact && (
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 4 }}>
          ◆ GET NOTIFIED OF MAJOR UPDATES
        </div>
      )}
      {!compact && (
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)', margin: '0 0 8px 0', lineHeight: 1.6 }}>
          Receive an email when there is a significant shift in scenario probabilities, a new country report, or a platform update.
          No marketing. No third parties. Unsubscribe any time.
        </p>
      )}
      <input
        type="email"
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
          fontSize: 10,
          padding: '7px 10px',
          outline: 'none',
        }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!isValidEmail(email) || status === 'submitting'}
        style={{
          fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1.5px',
          padding: '7px 16px', border: '1px solid',
          borderColor: isValidEmail(email) ? 'var(--accent-gold)' : 'var(--border)',
          color: isValidEmail(email) ? 'var(--accent-gold)' : 'var(--text-muted)',
          background: 'none', cursor: isValidEmail(email) ? 'pointer' : 'default',
          opacity: status === 'submitting' ? 0.5 : 1,
          whiteSpace: 'nowrap',
        }}
      >
        {status === 'submitting' ? 'SAVING...' : compact ? 'SUBSCRIBE ↗' : '◆ SUBSCRIBE'}
      </button>
      {status === 'error' && (
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-red)' }}>
          Error — please try again.
        </span>
      )}
    </div>
  );
}
