'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SendEmailModalProps {
  userId: string;
  userName: string;
  userEmail: string;
  onClose: () => void;
  onConfirm: (template: string, message?: string) => void;
}

const TEMPLATES = [
  'Account Warning',
  'Payment Reminder',
  'Subscription Notice',
  'Custom',
] as const;

export default function SendEmailModal({ userId, userName, userEmail, onClose, onConfirm }: SendEmailModalProps) {
  const [template, setTemplate] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const isCustom = template === 'Custom';
  const isValid = template !== '' && (!isCustom || (subject.trim().length > 0 && body.trim().length > 0));

  /* Focus trap + Escape */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, textarea, input, select, [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) { e.preventDefault(); last.focus(); }
    } else {
      if (document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSend = () => {
    if (!isValid) return;
    if (isCustom) {
      onConfirm(template, JSON.stringify({ subject: subject.trim(), body: body.trim() }));
    } else {
      onConfirm(template);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    backgroundColor: '#131922',
    border: '1px solid rgba(201,168,76,0.2)',
    borderRadius: 6,
    padding: '10px 12px',
    color: '#E2E8F0',
    fontSize: 13,
    fontFamily: '"IBM Plex Mono", monospace',
    outline: 'none',
    boxSizing: 'border-box' as const,
  };

  return (
    <div
      onClick={handleOverlayClick}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: '"IBM Plex Mono", monospace',
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="email-title"
        style={{
          backgroundColor: '#0C1018',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 8,
          padding: 32,
          width: '100%',
          maxWidth: 520,
          color: '#E2E8F0',
          fontSize: 13,
        }}
      >
        {/* Title */}
        <h2
          id="email-title"
          style={{
            margin: '0 0 4px 0',
            fontSize: 18,
            fontWeight: 600,
            color: '#C9A84C',
          }}
        >
          Send Email to {userName}
        </h2>
        <p style={{ margin: '0 0 24px 0', fontSize: 12, color: '#64748B' }}>
          Recipient: {userEmail}
        </p>

        {/* Template dropdown */}
        <label
          htmlFor="email-template"
          style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Email template *
        </label>
        <select
          id="email-template"
          value={template}
          onChange={(e) => { setTemplate(e.target.value); setSubject(''); setBody(''); }}
          style={{
            ...inputStyle,
            color: template ? '#E2E8F0' : '#64748B',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
            marginBottom: 20,
          }}
        >
          <option value="" disabled>Select a template...</option>
          {TEMPLATES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        {/* Template preview for non-custom */}
        {template && !isCustom && (
          <div
            style={{
              padding: '12px 16px',
              backgroundColor: '#131922',
              border: '1px solid rgba(201,168,76,0.15)',
              borderRadius: 6,
              marginBottom: 20,
            }}
          >
            <p style={{ margin: 0, fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              Preview
            </p>
            <p style={{ margin: 0, fontSize: 12, color: '#94A3B8', lineHeight: 1.6 }}>
              {template === 'Account Warning' && 'Standard account warning template will be sent. The email includes a summary of the policy violation and next steps.'}
              {template === 'Payment Reminder' && 'Payment reminder template will be sent with current billing details and a link to update payment method.'}
              {template === 'Subscription Notice' && 'Subscription status update template will be sent with current plan details and any pending changes.'}
            </p>
          </div>
        )}

        {/* Custom fields */}
        {isCustom && (
          <>
            <label
              htmlFor="email-subject"
              style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
            >
              Subject *
            </label>
            <input
              id="email-subject"
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Email subject line..."
              style={{ ...inputStyle, marginBottom: 16 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.2)'; }}
            />

            <label
              htmlFor="email-body"
              style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
            >
              Body *
            </label>
            <textarea
              id="email-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Email body content..."
              rows={6}
              style={{ ...inputStyle, resize: 'vertical', marginBottom: 20 }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.2)'; }}
            />
          </>
        )}

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: isCustom ? 0 : 8 }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 20px',
              backgroundColor: 'transparent',
              border: '1px solid rgba(148,163,184,0.3)',
              borderRadius: 6,
              color: '#94A3B8',
              fontSize: 13,
              fontFamily: '"IBM Plex Mono", monospace',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={!isValid}
            style={{
              padding: '8px 20px',
              backgroundColor: isValid ? '#C9A84C' : 'rgba(201,168,76,0.3)',
              border: 'none',
              borderRadius: 6,
              color: isValid ? '#0C1018' : 'rgba(255,255,255,0.3)',
              fontSize: 13,
              fontFamily: '"IBM Plex Mono", monospace',
              cursor: isValid ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            Send Email
          </button>
        </div>
      </div>
    </div>
  );
}
