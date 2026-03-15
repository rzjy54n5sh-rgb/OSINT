interface PageBriefingProps {
  title: string;
  description: string;
  note?: string;
}

export function PageBriefing({ title, description, note }: PageBriefingProps) {
  return (
    <div
      style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        background: 'rgba(232,197,71,0.03)',
        display: 'flex', flexDirection: 'column', gap: 3,
      }}
    >
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--accent-gold)', letterSpacing: '2px' }}>
        ◆ {title}
      </span>
      <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 10, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
        {description}
      </span>
      {note && (
        <span style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', lineHeight: 1.5 }}>
          {note}
        </span>
      )}
    </div>
  );
}
