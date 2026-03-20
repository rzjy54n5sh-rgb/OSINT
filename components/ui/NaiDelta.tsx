interface NaiDeltaProps {
  delta: number | null;
}

export function NaiDelta({ delta }: NaiDeltaProps) {
  if (delta === null) {
    return <span className="text-white/20 text-xs font-mono">—</span>;
  }
  if (delta === 0) {
    return (
      <span className="text-white/40 text-xs font-mono" translate="no">
        =
      </span>
    );
  }

  const isPositive = delta > 0;
  const color = isPositive ? 'text-emerald-400' : 'text-red-400';
  const arrow = isPositive ? '↑' : '↓';
  const abs = Math.abs(delta);
  const weight = abs >= 10 ? 'font-bold' : 'font-normal';
  const warning = abs >= 10 ? ' ⚠' : '';

  return (
    <span className={`${color} ${weight} text-xs font-mono`} translate="no">
      {arrow}
      {abs}
      {warning}
    </span>
  );
}
