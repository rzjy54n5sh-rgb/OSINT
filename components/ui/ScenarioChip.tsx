import type { ReactNode } from 'react';
import s from './chips.module.css';

/**
 * Scenario identity (design system v2): colour + letter, never colour alone. A #4DA6FF, B #D6B370,
 * C #36B8C8, D #A78BFA (theme tokens --scn-*); no red or green. B is always a range: hatched swatch and
 * the word "range" after its value. E (and any scenario without a market) is unmeasured: dashed outline,
 * no fill. Codes beyond A–E get a neutral swatch. Server-safe.
 */
export function ScenarioChip({
  code,
  label,
  value,
  kind,
  className,
}: {
  code: string;
  /** Scenario name, e.g. "US announces blockade end or a deal". */
  label?: ReactNode;
  /** Published figure: "14%", "58–78%", "Unmeasured". */
  value?: ReactNode;
  /** 'range' is implied for B; 'unmeasured' draws the dashed outline. */
  kind?: 'point' | 'range' | 'unmeasured';
  className?: string;
}) {
  const k = kind ?? (code === 'B' ? 'range' : code === 'E' ? 'unmeasured' : 'point');
  return (
    <span className={`${s.scenario} ${className ?? ''}`} data-code={code} data-kind={k}>
      <span className={s.swatch} aria-hidden="true" />
      <span className={s.letter} translate="no">
        {code}
      </span>
      {label != null ? <span>{label}</span> : null}
      {value != null ? (
        <span className={s.scnValue} translate="no">
          {value}
          {k === 'range' ? <span className={s.rangeWord}> range</span> : null}
        </span>
      ) : null}
    </span>
  );
}

export default ScenarioChip;
