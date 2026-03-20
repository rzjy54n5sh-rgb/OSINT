'use client';

type TimelineScrubberProps = {
  min?: number;
  max: number;
  value: number;
  onChange: (day: number) => void;
  label?: string;
  className?: string;
};

export function TimelineScrubber({
  min = 1,
  max,
  value,
  onChange,
  label = 'CONFLICT DAY',
  className = '',
}: TimelineScrubberProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div
        className="flex justify-between items-center font-mono text-xs uppercase"
        style={{ color: 'var(--text-secondary)' }}
      >
        <span>{label}</span>
        <span style={{ color: 'var(--accent-gold)' }} translate="no">
          {value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded cursor-pointer"
        style={{
          accentColor: 'var(--accent-gold)',
          background: 'var(--border)',
        }}
      />
    </div>
  );
}
