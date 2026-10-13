import Link from 'next/link';
import type { ReactNode } from 'react';
import { Icon, type IconName } from './icons';
/** Global .chip-* classes (app/globals.css, "SHARED CHIPS"). */
const s = {
  meta: 'chip-meta',
  num: 'chip-num',
  party: 'chip-party',
  trust: 'chip-trust',
  trustLink: 'chip-trust-link',
} as const;

/**
 * Trust components (System artboard, "Trust components"), server-safe:
 *  - source:       outlet name, optional item count and tier, and a STATE/PARTY badge for party sources.
 *  - correction, track-record, method: icon + label (+ meta), usually a link to the trust page.
 *  - stale:        dashed grey chip with a clock — data that is not current. Never label old data live.
 * The label is always text; the icon is decorative.
 */
type Common = { href?: string; className?: string };

export type TrustChipProps =
  | (Common & { kind: 'source'; name: string; count?: number | null; tier?: string | null; party?: boolean })
  | (Common & { kind: 'correction' | 'track-record' | 'method'; label: ReactNode; meta?: ReactNode })
  | (Common & { kind: 'stale'; label: ReactNode; title?: string });

const ICON: Record<'correction' | 'track-record' | 'method' | 'stale', IconName> = {
  correction: 'correction',
  'track-record': 'track-record',
  method: 'method',
  stale: 'stale',
};

export function TrustChip(props: TrustChipProps) {
  let chip: ReactNode;
  if (props.kind === 'source') {
    chip = (
      <span className={`${s.trust} ${props.className ?? ''}`} data-kind="source">
        {props.count != null ? <span className={`${s.num} ${s.meta}`}>{props.count}</span> : null}
        <span>{props.name}</span>
        {props.tier ? <span className={`${s.num} ${s.meta}`}>{props.tier}</span> : null}
        {props.party ? <span className={s.party}>STATE/PARTY</span> : null}
      </span>
    );
  } else if (props.kind === 'stale') {
    chip = (
      <span className={`${s.trust} ${props.className ?? ''}`} data-kind="stale" title={props.title}>
        <Icon name={ICON.stale} />
        <span>{props.label}</span>
      </span>
    );
  } else {
    chip = (
      <span className={`${s.trust} ${props.className ?? ''}`} data-kind={props.kind}>
        <Icon name={ICON[props.kind]} />
        <span>{props.label}</span>
        {props.meta != null ? <span className={s.meta}>{props.meta}</span> : null}
      </span>
    );
  }
  return props.href ? (
    <Link href={props.href} prefetch={false} className={s.trustLink}>
      {chip}
    </Link>
  ) : (
    chip
  );
}

export default TrustChip;
