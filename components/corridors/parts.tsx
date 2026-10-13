import type { LaneStatus } from '@/lib/corridors';
import { STATUS_GLYPH } from '@/lib/corridors';
import s from './corridors.module.css';

/** Glyph + word + colour, always together (design system v2). The glyph is decorative. */
export function StatusChip({ status }: { status: LaneStatus }) {
  return (
    <span className={s.chip} data-status={status}>
      <span className={s.srOnly}>Status: </span>
      <span aria-hidden="true">{STATUS_GLYPH[status]}</span>
      {status}
    </span>
  );
}

/** 0–100 % of the 2023 baseline (the track end is 100) with ticks at the 50 and 90 band edges. Values above 100 fill it. */
export function IndexGauge({ index, status }: { index: number | null; status: LaneStatus }) {
  const w = index === null ? 0 : Math.max(0, Math.min(100, index));
  return (
    <div className={s.gauge} aria-hidden="true" data-tone={status}>
      <div className={s.gaugeTrack}>
        <div className={s.gaugeFill} style={{ width: `${w}%` }} />
        <div className={s.gaugeTick} style={{ left: '50%' }} />
        <div className={s.gaugeTick} style={{ left: '90%' }} />
      </div>
      <div className={`${s.gaugeScale} ${s.num}`}>
        <span style={{ left: 0 }}>0</span>
        <span style={{ left: '50%', transform: 'translateX(-50%)' }}>50</span>
        <span style={{ left: '90%', transform: 'translateX(-50%)' }}>90%</span>
      </div>
    </div>
  );
}

export function StaleNote({ children }: { children: React.ReactNode }) {
  return (
    <p className={s.staleNote}>
      <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 4.5V8l2.5 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <span>{children}</span>
    </p>
  );
}
