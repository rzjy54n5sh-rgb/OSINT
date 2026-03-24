'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface BanModalProps {
  userId: string;
  userName: string;
  userEmail: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function BanModal({ userId, userName, userEmail, onClose, onConfirm }: BanModalProps) {
  const [reason, setReason] = useState('');
  const [emailConfirm, setEmailConfirm] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const emailMatch = emailConfirm === userEmail;
  const isValid = reason.trim().length >= 20 && emailMatch;

  /* Focus trap + Escape */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, textarea, input, [tabindex]:not([tabindex="-1"])'
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
    textareaRef.current?.focus();
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
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
        aria-labelledby="ban-title"
        style={{
          backgroundColor: '#0C1018',
          border: '1px solid rgba(220,38,38,0.4)',
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
          id="ban-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: 18,
            fontWeight: 700,
            color: '#EF4444',
          }}
        >
          &#x26A0; Permanently Ban {userName}
        </h2>

        {/* Warning */}
        <div
          style={{
            margin: '0 0 20px 0',
            padding: '12px 16px',
            backgroundColor: 'rgba(220,38,38,0.08)',
            border: '1px solid rgba(220,38,38,0.25)',
            borderRadius: 6,
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#FCA5A5', lineHeight: 1.6, fontWeight: 700 }}>
            This action is irreversible. The account will be permanently deactivated,
            all data exports will be generated, and the user will be permanently
            blocked from creating new accounts with this email address. Active
            subscriptions will be cancelled without refund.
          </p>
        </div>

        {/* Reason */}
        <label
          htmlFor="ban-reason"
          style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Reason for permanent ban *
        </label>
        <textarea
          id="ban-reason"
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Minimum 20 characters — be specific..."
          rows={4}
          style={{
            width: '100%',
            backgroundColor: '#131922',
            border: '1px solid rgba(220,38,38,0.2)',
            borderRadius: 6,
            padding: '10px 12px',
            color: '#E2E8F0',
            fontSize: 13,
            fontFamily: '"IBM Plex Mono", monospace',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(220,38,38,0.2)'; }}
        />
        <p style={{ margin: '4px 0 20px 0', fontSize: 11, color: '#64748B' }}>
          {reason.trim().length}/20 characters minimum
        </p>

        {/* Email confirmation */}
        <label
          htmlFor="ban-email-confirm"
          style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Type <span style={{ color: '#E2E8F0', fontWeight: 600 }}>{userEmail}</span> to confirm
        </label>
        <input
          id="ban-email-confirm"
          type="text"
          value={emailConfirm}
          onChange={(e) => setEmailConfirm(e.target.value)}
          placeholder={userEmail}
          autoComplete="off"
          spellCheck={false}
          style={{
            width: '100%',
            backgroundColor: '#131922',
            border: `1px solid ${emailMatch ? 'rgba(34,197,94,0.4)' : 'rgba(220,38,38,0.2)'}`,
            borderRadius: 6,
            padding: '10px 12px',
            color: emailMatch ? '#22C55E' : '#E2E8F0',
            fontSize: 13,
            fontFamily: '"IBM Plex Mono", monospace',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />
        <p style={{ margin: '4px 0 24px 0', fontSize: 11, color: emailMatch ? '#22C55E' : '#64748B' }}>
          {emailMatch ? 'Email confirmed' : 'Email must match exactly'}
        </p>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
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
            onClick={() => { if (isValid) onConfirm(reason.trim()); }}
            disabled={!isValid}
            style={{
              padding: '8px 20px',
              backgroundColor: isValid ? '#7F1D1D' : 'rgba(127,29,29,0.3)',
              border: isValid ? '1px solid #DC2626' : '1px solid transparent',
              borderRadius: 6,
              color: isValid ? '#FCA5A5' : 'rgba(255,255,255,0.3)',
              fontSize: 13,
              fontFamily: '"IBM Plex Mono", monospace',
              cursor: isValid ? 'pointer' : 'not-allowed',
              fontWeight: 700,
            }}
          >
            I understand, Ban Account
          </button>
        </div>
      </div>
    </div>
  );
}
