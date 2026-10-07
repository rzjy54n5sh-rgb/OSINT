'use client';

import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';

const FOCUSABLE =
  'a[href], area[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

type Props = {
  /** Accessible name; rendered as the dialog heading. */
  title: ReactNode;
  onClose: () => void;
  children: ReactNode;
  className?: string;
};

/**
 * Modal dialog for the /nai country details: role="dialog" + aria-modal, labelled by its heading,
 * focus moved inside on open and trapped (Tab / Shift+Tab wrap), Escape and backdrop click close it,
 * focus returns to the element that opened it, and background scroll is locked while open.
 */
export function NaiDialog({ title, onClose, children, className = '' }: Props) {
  const headingId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !panelRef.current.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      if (opener && document.contains(opener)) opener.focus();
    };
  }, []);

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={() => onCloseRef.current()}
      data-testid="nai-dialog-backdrop"
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        onClick={(e) => e.stopPropagation()}
        className={`osint-card p-5 max-w-lg w-full max-h-[80vh] overflow-y-auto ${className}`}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id={headingId} className="font-display text-xl" style={{ color: 'var(--text-primary)' }} translate="no">
            {title}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onCloseRef.current()}
            className="font-mono text-xs px-3 py-2 border rounded-sm min-w-[44px] min-h-[44px]"
            style={{ borderColor: 'var(--border)', color: 'var(--text-secondary)' }}
            aria-label="Close country details"
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
