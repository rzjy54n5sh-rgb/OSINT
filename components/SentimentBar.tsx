'use client';

type SentimentBarProps = {
  value: number;
  category?: string;
  className?: string;
};

const NAI_CLASS: Record<string, string> = {
  SAFE: 'safe',
  STABLE: 'stable',
  TENSION: 'tension',
  FRACTURE: 'fracture',
  INVERSION: 'inversion',
};

export function SentimentBar({ value, category = 'neutral', className = '' }: SentimentBarProps) {
  const pct = value <= 1 ? value * 100 : Math.min(100, value);
  const variant = NAI_CLASS[category.toUpperCase()] ?? 'tension';
  return (
    <div className={`nai-bar-track w-full ${className}`}>
      <div
        className={`nai-bar-fill ${variant}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
