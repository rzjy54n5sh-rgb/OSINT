import type { NaiCategoryV2 } from '@/types/supabase';
import { NAI_V2_COLOR, NAI_V2_CATEGORY_DEFS, unscorableReason, type LatentEvidence } from '@/lib/nai-v2';

type Props = {
  category: NaiCategoryV2 | null;
  /** Viewer's tier cannot see the category. */
  locked?: boolean;
  /** Show the explanatory text next to UNSCORABLE (default true). */
  showUnscorableText?: boolean;
  /**
   * What latent evidence the viewer can see — selects the UNSCORABLE reason: 'band' = band spans
   * more than one category, 'none' = no admissible latent evidence, 'locked' (default) = generic.
   */
  latentEvidence?: LatentEvidence;
  /** Expressed score (null = no expressed evidence, which is also UNSCORABLE). */
  expressed?: number | null;
  className?: string;
};

/**
 * War Posture (C2) category badge. No hooks — safe in Server and Client Components.
 * UNSCORABLE is rendered grey WITH its explanation, never hidden.
 * Deliberately does not use the legacy GLOSSARY definitions (old US-referenced axis).
 */
export function NaiV2CategoryBadge({
  category,
  locked = false,
  showUnscorableText = true,
  latentEvidence = 'locked',
  expressed = 0,
  className = '',
}: Props) {
  if (locked || category === null) {
    return (
      <span
        className={`font-mono text-[11px] uppercase px-1.5 py-0.5 rounded-sm border ${className}`}
        style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        translate="no"
        data-nai-category="LOCKED"
      >
        CATEGORY LOCKED
      </span>
    );
  }
  const color = NAI_V2_COLOR[category];
  // UNSCORABLE grey (#6B7280) is 3.6:1 on the dark surfaces; the chip TEXT uses a lighter grey (AA).
  const textColor = category === 'UNSCORABLE' ? '#A3ACB9' : color;
  const def = NAI_V2_CATEGORY_DEFS.find((d) => d.category === category)?.text;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} data-nai-category={category}>
      <span
        className="font-mono text-[11px] uppercase px-1.5 py-0.5 rounded-sm"
        style={{ color: textColor, background: `${color}1A`, border: `1px solid ${color}4D` }}
        title={def}
        translate="no"
      >
        {category}
      </span>
      {category === 'UNSCORABLE' && showUnscorableText && (
        <span className="font-mono text-[11px]" style={{ color: 'var(--text-secondary)' }} data-unscorable-reason={latentEvidence}>
          {unscorableReason(latentEvidence, expressed)}
        </span>
      )}
    </span>
  );
}
