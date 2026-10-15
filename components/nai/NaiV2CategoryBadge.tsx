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
        className={`font-mono text-[13px] uppercase px-1.5 py-0.5 rounded-sm border ${className}`}
        style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}
        translate="no"
        data-nai-category="LOCKED"
      >
        CATEGORY LOCKED
      </span>
    );
  }
  // Neutral swatch + the category word in text colour (no red/green; the word carries the meaning).
  const unscorable = category === 'UNSCORABLE';
  const def = NAI_V2_CATEGORY_DEFS.find((d) => d.category === category)?.text;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} data-nai-category={category}>
      <span
        className="inline-flex items-center gap-1.5 font-mono text-[13px] uppercase px-1.5 py-0.5 rounded-sm"
        style={{ color: unscorable ? 'var(--text-secondary)' : 'var(--text-primary)', border: `1px ${unscorable ? 'dashed' : 'solid'} var(--line-strong)` }}
        title={def}
        translate="no"
      >
        <span
          aria-hidden="true"
          style={{ width: 8, height: 8, flex: 'none', background: NAI_V2_COLOR[category], border: '1px solid var(--line-strong)', borderStyle: unscorable ? 'dashed' : 'solid' }}
        />
        {category}
      </span>
      {category === 'UNSCORABLE' && showUnscorableText && (
        <span className="font-mono text-[13px]" style={{ color: 'var(--text-secondary)' }} data-unscorable-reason={latentEvidence}>
          {unscorableReason(latentEvidence, expressed)}
        </span>
      )}
    </span>
  );
}
