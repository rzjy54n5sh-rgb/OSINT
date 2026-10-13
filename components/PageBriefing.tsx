interface PageBriefingProps {
  /** How the page's data is made and how to read it (shown when the disclosure is opened). */
  description: string;
  /** Caveats, shown under the description. */
  note?: string;
  className?: string;
}

/**
 * "How to read this page" — the method text for a data page, collapsed by default and placed BELOW
 * the page's h1 (UX audit 2026-10-13, change #6: method text used to sit above the title on every
 * data page). Native <details>/<summary>: keyboard operable (Tab, Enter/Space) and announced as
 * expandable by screen readers without any script.
 */
export function PageBriefing({ description, note, className = '' }: PageBriefingProps) {
  return (
    <details
      className={`page-briefing ${className}`}
      style={{
        border: '1px solid var(--border)',
        background: 'rgba(232,197,71,0.03)',
        borderRadius: 2,
        maxWidth: '72ch',
      }}
      data-testid="page-briefing"
    >
      <summary
        className="page-briefing__summary"
        style={{
          fontFamily: 'IBM Plex Mono',
          fontSize: 12,
          color: 'var(--accent-gold)',
          letterSpacing: '1px',
          padding: '10px 14px',
          minHeight: 44,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          cursor: 'pointer',
        }}
      >
        <span aria-hidden="true" className="page-briefing__icon">ⓘ</span>
        How to read this page
      </summary>
      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, margin: 0 }}>
          {description}
        </p>
        {note && (
          <p style={{ fontFamily: 'IBM Plex Mono', fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, margin: 0 }}>
            {note}
          </p>
        )}
      </div>
    </details>
  );
}
