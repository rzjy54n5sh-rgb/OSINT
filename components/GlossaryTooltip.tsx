'use client';

import { useState, useRef, useEffect, ReactNode } from 'react';

type GlossaryTooltipProps = {
  term: string;
  definition: ReactNode;
  children: ReactNode;
  className?: string;
};

export function GlossaryTooltip({ term, definition, children, className = '' }: GlossaryTooltipProps) {
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!visible) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setVisible(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [visible]);

  return (
    <span
      ref={wrapperRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <span
          className="absolute bottom-full left-0 mb-1 p-3 font-mono text-xs leading-relaxed rounded-sm whitespace-normal z-[100] shadow-lg"
          style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border-bright)',
            color: 'var(--text-secondary)',
            maxWidth: 280,
          }}
        >
          {definition}
        </span>
      )}
    </span>
  );
}
