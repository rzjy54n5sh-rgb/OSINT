import { STATUS_GLYPHS, type LaneStatusCode } from '@/lib/design-tokens';
/** Global .chip-* classes (app/globals.css, "SHARED CHIPS"). */
const s = {
  srOnly: 'chip-sr-only',
  status: 'chip-status',
} as const;

/**
 * Lane status (design system v2): glyph + word + colour, always together. The glyph is decorative;
 * screen readers hear "Status: DISRUPTED". UNKNOWN (stale or withheld data) is dashed. Server-safe.
 */
export function StatusChip({ status, size = 'md' }: { status: LaneStatusCode; size?: 'md' | 'sm' }) {
  return (
    <span className={s.status} data-status={status} data-size={size}>
      <span className={s.srOnly}>Status: </span>
      <span aria-hidden="true">{STATUS_GLYPHS[status]}</span>
      {status}
    </span>
  );
}

export default StatusChip;
