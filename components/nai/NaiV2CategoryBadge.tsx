import type { NaiCategoryV2 } from '@/types/supabase';
import { NAI_V2_COLOR, NAI_V2_UNSCORABLE_TEXT, NAI_V2_CATEGORY_DEFS } from '@/lib/nai-v2';

type Props = {
  category: NaiCategoryV2 | null;
  /** Viewer's tier cannot see the category. */
  locked?: boolean;
  /** Show the explanatory text next to UNSCORABLE (default true). */
  showUnscorableText?: boolean;
  className?: string;
};

/**
 * War Posture (C2) category badge. No hooks — safe in Server and Client Components.
 * UNSCORABLE is rendered grey WITH its explanation, never hidden.
 * Deliberately does not use the legacy GLOSSARY definitions (old US-referenced axis).
 */
export function NaiV2CategoryBadge({ category, locked = false, showUnscorableText = true, className = '' }: Props) {
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
  const def = NAI_V2_CATEGORY_DEFS.find((d) => d.category === category)?.text;
  return (
    <span className={`inline-flex flex-wrap items-center gap-1.5 ${className}`} data-nai-category={category}>
      <span
        className="font-mono text-[11px] uppercase px-1.5 py-0.5 rounded-sm"
        style={{ color, background: `${color}1A`, border: `1px solid ${color}4D` }}
        title={def}
        translate="no"
      >
        {category}
      </span>
      {category === 'UNSCORABLE' && showUnscorableText && (
        <span className="font-mono text-[11px]" style={{ color: NAI_V2_COLOR.UNSCORABLE }}>
          {NAI_V2_UNSCORABLE_TEXT}
        </span>
      )}
    </span>
  );
}
