'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface SuspendModalProps {
  userId: string;
  userName: string;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}

export default function SuspendModal({ userId, userName, onClose, onConfirm }: SuspendModalProps) {
  const [reason, setReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isValid = reason.trim().length >= 10;

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
        aria-labelledby="suspend-title"
        style={{
          backgroundColor: '#0C1018',
          border: '1px solid rgba(201,168,76,0.3)',
          borderRadius: 8,
          padding: 32,
          width: '100%',
          maxWidth: 480,
          color: '#E2E8F0',
          fontSize: 13,
        }}
      >
        {/* Title */}
        <h2
          id="suspend-title"
          style={{
            margin: '0 0 8px 0',
            fontSize: 18,
            fontWeight: 600,
            color: '#C9A84C',
          }}
        >
          Suspend {userName}&apos;s Account
        </h2>

        {/* Warning */}
        <p style={{ margin: '0 0 20px 0', fontSize: 12, color: '#F59E0B', lineHeight: 1.6 }}>
          This will immediately block the user from accessing all platform features.
          API keys will be deactivated and active sessions terminated. The user will
          be notified by email.
        </p>

        {/* Reason */}
        <label
          htmlFor="suspend-reason"
          style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Reason for suspension *
        </label>
        <textarea
          id="suspend-reason"
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Minimum 10 characters..."
          rows={4}
          style={{
            width: '100%',
            backgroundColor: '#131922',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 6,
            padding: '10px 12px',
            color: '#E2E8F0',
            fontSize: 13,
            fontFamily: '"IBM Plex Mono", monospace',
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.5)'; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = 'rgba(201,168,76,0.2)'; }}
        />
        <p style={{ margin: '4px 0 24px 0', fontSize: 11, color: '#64748B' }}>
          {reason.trim().length}/10 characters minimum
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
              backgroundColor: isValid ? '#DC2626' : 'rgba(220,38,38,0.3)',
              border: 'none',
              borderRadius: 6,
              color: isValid ? '#FFFFFF' : 'rgba(255,255,255,0.4)',
              fontSize: 13,
              fontFamily: '"IBM Plex Mono", monospace',
              cursor: isValid ? 'pointer' : 'not-allowed',
              fontWeight: 600,
            }}
          >
            Suspend Account
          </button>
        </div>
      </div>
    </div>
  );
}
