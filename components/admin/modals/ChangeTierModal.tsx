'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ChangeTierModalProps {
  userId: string;
  userName: string;
  currentTier: string;
  onClose: () => void;
  onConfirm: (tier: string, reason: string) => void;
}

const TIERS = [
  { value: 'free', label: 'FREE', color: '#4A5568', desc: 'Basic access, limited API calls' },
  { value: 'informed', label: 'INFORMED', color: '#1E90FF', desc: 'Full feed access, daily briefings' },
  { value: 'professional', label: 'PROFESSIONAL', color: '#C9A84C', desc: 'All features, API access, priority support' },
] as const;

const REASONS = [
  'Goodwill upgrade',
  'Refund adjustment',
  'Manual override',
  'Error correction',
  'Other',
] as const;

export default function ChangeTierModal({ userId, userName, currentTier, onClose, onConfirm }: ChangeTierModalProps) {
  const [selectedTier, setSelectedTier] = useState(currentTier.toLowerCase());
  const [reason, setReason] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);

  const isValid = selectedTier !== currentTier.toLowerCase() && reason !== '';

  /* Focus trap + Escape */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key !== 'Tab' || !panelRef.current) return;
    const focusable = panelRef.current.querySelectorAll<HTMLElement>(
      'button, input[type="radio"], select, [tabindex]:not([tabindex="-1"])'
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

  const currentTierInfo = TIERS.find(t => t.value === currentTier.toLowerCase()) ?? TIERS[0];

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
        aria-labelledby="tier-title"
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
          id="tier-title"
          style={{
            margin: '0 0 20px 0',
            fontSize: 18,
            fontWeight: 600,
            color: '#C9A84C',
          }}
        >
          Change Plan &mdash; {userName}
        </h2>

        {/* Current tier */}
        <div style={{ marginBottom: 20 }}>
          <span style={{ fontSize: 11, color: '#64748B', textTransform: 'uppercase', letterSpacing: 1 }}>
            Current plan
          </span>
          <div style={{ marginTop: 4, display: 'inline-flex', marginLeft: 12 }}>
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 4,
                backgroundColor: `${currentTierInfo.color}22`,
                color: currentTierInfo.color,
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: 1,
              }}
            >
              {currentTierInfo.label}
            </span>
          </div>
        </div>

        {/* Tier selection */}
        <label
          style={{ display: 'block', marginBottom: 10, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          New plan
        </label>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
          {TIERS.map((tier) => {
            const isSelected = selectedTier === tier.value;
            const isCurrent = currentTier.toLowerCase() === tier.value;
            return (
              <label
                key={tier.value}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '12px 16px',
                  borderRadius: 6,
                  border: `1px solid ${isSelected ? tier.color : 'rgba(148,163,184,0.15)'}`,
                  backgroundColor: isSelected ? `${tier.color}0D` : 'transparent',
                  cursor: isCurrent ? 'default' : 'pointer',
                  opacity: isCurrent ? 0.4 : 1,
                }}
              >
                <input
                  type="radio"
                  name="tier"
                  value={tier.value}
                  checked={isSelected}
                  disabled={isCurrent}
                  onChange={() => setSelectedTier(tier.value)}
                  style={{ accentColor: tier.color, width: 16, height: 16 }}
                />
                <div>
                  <span style={{ fontWeight: 600, color: tier.color, fontSize: 13 }}>
                    {tier.label}
                  </span>
                  {isCurrent && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: '#64748B' }}>(current)</span>
                  )}
                  <p style={{ margin: '2px 0 0 0', fontSize: 11, color: '#64748B' }}>
                    {tier.desc}
                  </p>
                </div>
              </label>
            );
          })}
        </div>

        {/* Reason */}
        <label
          htmlFor="tier-reason"
          style={{ display: 'block', marginBottom: 6, fontSize: 11, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}
        >
          Reason *
        </label>
        <select
          id="tier-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          style={{
            width: '100%',
            backgroundColor: '#131922',
            border: '1px solid rgba(201,168,76,0.2)',
            borderRadius: 6,
            padding: '10px 12px',
            color: reason ? '#E2E8F0' : '#64748B',
            fontSize: 13,
            fontFamily: '"IBM Plex Mono", monospace',
            outline: 'none',
            boxSizing: 'border-box',
            appearance: 'none',
            WebkitAppearance: 'none',
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394A3B8' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat',
            backgroundPosition: 'right 12px center',
          }}
        >
          <option value="" disabled>Select a reason...</option>
          {REASONS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>

        {/* Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginTop: 28 }}>
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
            onClick={() => { if (isValid) onConfirm(selectedTier, reason); }}
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
            Apply Change
          </button>
        </div>
      </div>
    </div>
  );
}
