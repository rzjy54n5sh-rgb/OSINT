'use client';

const NAI_CLASS: Record<string, string> = {
  SAFE: 'safe',
  STABLE: 'stable',
  TENSION: 'tension',
  FRACTURE: 'fracture',
  INVERSION: 'inversion',
};

type NaiScoreBadgeProps = {
  category: string;
  score?: number;
  className?: string;
};

export function NaiScoreBadge({ category, score, className = '' }: NaiScoreBadgeProps) {
  const key = (category || '').toUpperCase().replace(/\s+/g, '_');
  const variant = NAI_CLASS[key] ?? 'safe';
  return (
    <span className={`nai-badge ${variant} ${className}`}>
      {category || '—'}
      {score != null && <span className="opacity-80 ml-1">({score})</span>}
    </span>
  );
}
