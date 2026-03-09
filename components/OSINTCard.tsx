import { SourceStamp, type SourceStampProps } from './SourceStamp';

type AccentColor = 'aligned' | 'stable' | 'tension' | 'fracture' | 'inversion' | 'gold';

const accentBarColors: Record<AccentColor, string> = {
  aligned: 'var(--nai-aligned)',
  stable: 'var(--nai-stable)',
  tension: 'var(--nai-tension)',
  fracture: 'var(--nai-fracture)',
  inversion: 'var(--nai-inversion)',
  gold: 'var(--accent-gold)',
};

export interface OSINTCardProps {
  title: string;
  children?: React.ReactNode;
  accent?: AccentColor;
  sourceStamp: SourceStampProps;
  confidenceScore?: number | null;
  className?: string;
}

export function OSINTCard({
  title,
  children,
  accent = 'gold',
  sourceStamp,
  confidenceScore,
  className = '',
}: OSINTCardProps) {
  return (
    <article
      className={`osint-card relative overflow-hidden rounded-lg bg-bg-card ${className}`}
    >
      <div
        className="absolute left-0 top-0 h-full w-[3px]"
        style={{ backgroundColor: accentBarColors[accent] }}
        aria-hidden
      />
      <div className="p-4 pl-5">
        <h3 className="font-heading text-sm font-semibold text-text-primary">{title}</h3>
        {children ? <div className="mt-2 text-text-secondary">{children}</div> : null}
        <SourceStamp {...sourceStamp} confidenceScore={confidenceScore ?? sourceStamp.confidenceScore} />
        {confidenceScore != null && (
          <div className="mt-2 flex justify-end">
            <span
              className="osint-label rounded px-2 py-0.5"
              style={{
                backgroundColor: 'var(--bg-elevated)',
                color:
                  confidenceScore >= 70
                    ? 'var(--accent-green)'
                    : confidenceScore >= 40
                      ? 'var(--accent-gold)'
                      : 'var(--accent-red)',
              }}
            >
              CONF: {Math.round(confidenceScore)}%
            </span>
          </div>
        )}
      </div>
    </article>
  );
}
