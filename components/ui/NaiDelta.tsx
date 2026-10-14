interface NaiDeltaProps {
  delta: number | null;
}

export function NaiDelta({ delta }: NaiDeltaProps) {
  if (delta === null) {
    return <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>—</span>;
  }
  if (delta === 0) {
    return (
      <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }} translate="no">
        =
      </span>
    );
  }

  const isPositive = delta > 0;
  // Direction is the arrow, not red/green (design system v2): text colour in both themes.
  const arrow = isPositive ? '↑' : '↓';
  const abs = Math.abs(delta);
  const weight = abs >= 10 ? 'font-bold' : 'font-normal';
  const warning = abs >= 10 ? ' ⚠' : '';

  return (
    <span className={`${weight} text-xs font-mono`} style={{ color: 'var(--text-primary)' }} translate="no">
      {arrow}
      {abs}
      {warning}
    </span>
  );
}
