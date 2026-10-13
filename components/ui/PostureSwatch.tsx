import type { ReactNode } from 'react';
import { isPostureNoGrade, postureBand } from '@/lib/design-tokens';
import s from './chips.module.css';

/**
 * War Posture scale swatch (design system v2): 0–30 / 31–60 / 61–80 / 81–100 in the scale's own colours
 * (--posture-1..4), never status colours. The number (or the label) is printed beside the swatch, so the
 * colour is never the only carrier.
 *
 * EG / AE / SA are published as stated positions only: the component REFUSES them a colour, band or
 * number even if a score is passed — outline only, with the words "Stated positions only" (or the
 * label given). A missing score also draws the outline and no number. Server-safe.
 */
export function PostureSwatch({
  score,
  countryCode,
  label,
  showNumber = true,
  className,
}: {
  score: number | null | undefined;
  countryCode?: string | null;
  label?: ReactNode;
  showNumber?: boolean;
  className?: string;
}) {
  if (isPostureNoGrade(countryCode)) {
    return (
      <span className={`${s.posture} ${className ?? ''}`} data-band="none" data-no-grade="true">
        <span className={s.postureSwatch} aria-hidden="true" />
        <span>{label ?? 'Stated positions only'}</span>
      </span>
    );
  }
  const band = postureBand(score);
  return (
    <span className={`${s.posture} ${className ?? ''}`} data-band={band ?? 'none'}>
      <span className={s.postureSwatch} aria-hidden="true" />
      {showNumber && band !== null ? (
        <span className={s.num} translate="no">
          {Math.round(score as number)}
        </span>
      ) : null}
      {label != null ? <span>{label}</span> : null}
    </span>
  );
}

export default PostureSwatch;
