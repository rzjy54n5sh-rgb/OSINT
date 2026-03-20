'use client';

import { useState } from 'react';

type CodeBlockProps = {
  code: string;
  /** When false, blur and block copy (T0/T1 examples). */
  allowCopy?: boolean;
};

export function CodeBlock({ code, allowCopy = true }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copy = () => {
    if (!allowCopy) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div
      className={`relative my-4 rounded border overflow-x-auto max-w-full ${allowCopy ? '' : 'pointer-events-none select-none blur-sm opacity-45'}`}
      style={{ borderColor: 'var(--border)', background: '#0D1B2A' }}
    >
      {allowCopy && (
        <button
          type="button"
          onClick={copy}
          className="absolute top-2 end-2 z-10 font-mono text-[10px] px-2 py-1 rounded-sm border transition-colors"
          style={{
            borderColor: copied ? 'var(--accent-green)' : 'var(--border)',
            color: copied ? 'var(--accent-green)' : 'var(--text-secondary)',
            background: 'rgba(7,10,15,0.9)',
          }}
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      )}
      <pre className="p-4 pt-11 font-mono text-[11px] leading-relaxed text-start whitespace-pre" style={{ color: 'var(--text-secondary)' }}>
        <code>{code}</code>
      </pre>
    </div>
  );
}
