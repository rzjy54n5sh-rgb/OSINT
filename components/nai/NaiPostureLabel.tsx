import { NAI_POSTURE_COLOR, NAI_POSTURE_HEADING, NAI_POSTURE_NOTE, postureLabel } from '@/lib/nai-v2';

type Props = {
  /** nai_scores_v2.expressed_score (visible to every tier, so this label is never gated). */
  expressed: number | null;
  /** Hide the "Posture (official)" heading (only where an adjacent heading already names it). */
  hideHeading?: boolean;
  className?: string;
};

/**
 * "Posture (official)" label derived from E by postureLabel() — a display convention, NOT the NAI
 * category (see lib/nai-v2.ts). No hooks — safe in Server and Client Components.
 * Renders nothing when E is null / out of range. Text stays in theme tokens; the colour is only a swatch.
 */
export function NaiPostureLabel({ expressed, hideHeading = false, className = '' }: Props) {
  const label = postureLabel(expressed);
  if (label === null) return null;
  return (
    <span
      className={`inline-flex flex-wrap items-center gap-1 font-mono text-[11px] ${className}`}
      title={NAI_POSTURE_NOTE}
      data-nai-posture={label}
      translate="no"
    >
      {!hideHeading && (
        <span className="uppercase" style={{ color: 'var(--text-muted)' }}>
          {NAI_POSTURE_HEADING}
        </span>
      )}
      <span
        aria-hidden="true"
        className="inline-block w-2.5 h-2.5 rounded-full border"
        style={{ background: NAI_POSTURE_COLOR[label], borderColor: '#8A9BB5' }}
      />
      <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </span>
  );
}
