'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { OsintCard } from '@/components/OsintCard';

const INQUIRY_TYPES = [
  { value: 'subscription', label: 'Professional subscription / B2B access' },
  { value: 'media', label: 'Media and press inquiry' },
  { value: 'research', label: 'Academic or research collaboration' },
  { value: 'technical', label: 'Technical issue or data correction' },
  { value: 'other', label: 'Other' },
];

export default function ContactPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    organization: '',
    inquiry_type: '',
    message: '',
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done' | 'error'>('idle');

  const isValid = form.name.trim() && form.email.includes('@') && form.inquiry_type && form.message.trim().length > 10;

  const submit = async () => {
    if (!isValid) return;
    setStatus('submitting');
    const supabase = createClient();
    const { error } = await supabase.from('contact_inquiries').insert({
      name: form.name.trim(),
      email: form.email.trim().toLowerCase(),
      organization: form.organization.trim() || null,
      inquiry_type: form.inquiry_type,
      message: form.message.trim(),
    });
    setStatus(error ? 'error' : 'done');
  };

  const field = (key: keyof typeof form, label: string, placeholder: string, required = true, multiline = false) => (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: 'block', fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 6 }}>
        {label}{required && <span style={{ color: 'var(--accent-red)' }}> *</span>}
      </label>
      {multiline ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={5}
          style={{
            width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: 11,
            padding: '10px 12px', resize: 'vertical', boxSizing: 'border-box',
          }}
        />
      ) : (
        <input
          type={key === 'email' ? 'email' : 'text'}
          value={form[key]}
          onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
          placeholder={placeholder}
          style={{
            width: '100%', background: 'var(--bg-primary)', border: '1px solid var(--border)',
            color: 'var(--text-primary)', fontFamily: 'IBM Plex Mono', fontSize: 11,
            padding: '10px 12px', boxSizing: 'border-box',
          }}
        />
      )}
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Header */}
      <div style={{ marginBottom: 28, borderBottom: '1px solid var(--border)', paddingBottom: 20 }}>
        <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', letterSpacing: '3px', marginBottom: 8 }}>
          ◆ MENA INTEL DESK — CONTACT
        </div>
        <h1 style={{ fontFamily: 'Bebas Neue', fontSize: 36, color: 'var(--text-primary)', letterSpacing: '3px', margin: '0 0 12px 0' }}>
          GET IN TOUCH
        </h1>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.7, margin: 0 }}>
          For professional subscriptions, media inquiries, research collaboration, or technical issues. All submissions are reviewed by the platform operator.
          Response time: 24–48 hours.
        </p>
      </div>

      {status === 'done' ? (
        <OsintCard>
          <div style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ fontFamily: 'IBM Plex Mono', fontSize: 24, color: 'var(--accent-green)', marginBottom: 12 }}>✓</div>
            <div style={{ fontFamily: 'Bebas Neue', fontSize: 20, color: 'var(--text-primary)', letterSpacing: '2px', marginBottom: 8 }}>
              INQUIRY RECEIVED
            </div>
            <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 20 }}>
              Your message has been logged. The platform operator will respond to {form.email} within 24–48 hours.
            </p>
            <Link href="/" style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', textDecoration: 'none' }}>
              ← RETURN TO DASHBOARD
            </Link>
          </div>
        </OsintCard>
      ) : (
        <OsintCard>
          <div style={{ padding: '4px 0' }}>
            {field('name', 'FULL NAME', 'Your full name')}
            {field('email', 'EMAIL ADDRESS', 'your@email.com')}
            {field('organization', 'ORGANIZATION', 'Company, institution, or publication (optional)', false)}

            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', letterSpacing: '2px', marginBottom: 6 }}>
                INQUIRY TYPE <span style={{ color: 'var(--accent-red)' }}>*</span>
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {INQUIRY_TYPES.map((t) => (
                  <label
                    key={t.value}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                      padding: '8px 12px',
                      border: '1px solid',
                      borderColor: form.inquiry_type === t.value ? 'var(--accent-gold)' : 'var(--border)',
                      background: form.inquiry_type === t.value ? 'rgba(232,197,71,0.05)' : 'transparent',
                    }}
                  >
                    <input
                      type="radio"
                      name="inquiry_type"
                      value={t.value}
                      checked={form.inquiry_type === t.value}
                      onChange={(e) => setForm((p) => ({ ...p, inquiry_type: e.target.value }))}
                      style={{ accentColor: 'var(--accent-gold)', flexShrink: 0 }}
                    />
                    <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-secondary)' }}>{t.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {field('message', 'MESSAGE', 'Describe your inquiry in detail...', true, true)}

            <button
              type="button"
              onClick={submit}
              disabled={!isValid || status === 'submitting'}
              style={{
                width: '100%', padding: '12px 0',
                fontFamily: 'IBM Plex Mono', fontSize: 10, letterSpacing: '2px',
                border: '1px solid',
                borderColor: isValid ? 'var(--accent-gold)' : 'var(--border)',
                color: isValid ? 'var(--accent-gold)' : 'var(--text-muted)',
                background: isValid ? 'rgba(232,197,71,0.05)' : 'transparent',
                cursor: isValid ? 'pointer' : 'default',
                opacity: status === 'submitting' ? 0.6 : 1,
              }}
            >
              {status === 'submitting' ? 'SENDING...' : '◆ SEND INQUIRY'}
            </button>

            {status === 'error' && (
              <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-red)', marginTop: 10 }}>
                Failed to submit — please try again. If the problem persists, the database may be temporarily unavailable.
              </p>
            )}
          </div>
        </OsintCard>
      )}

      <div style={{ marginTop: 24, paddingTop: 16, borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--text-muted)' }}>
          All submissions are stored securely. Never shared with third parties.
        </span>
        <Link href="/" style={{ fontFamily: 'IBM Plex Mono', fontSize: 9, color: 'var(--accent-gold)', textDecoration: 'none' }}>
          ← RETURN TO DASHBOARD
        </Link>
      </div>
    </div>
  );
}
