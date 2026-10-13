/**
 * Inline SVG icons (design system v2): 20 px box, 1.5 px stroke, round caps, currentColor.
 * Decorative by default (aria-hidden); the text beside an icon carries the meaning. Never emoji or flags.
 * The first four paths are the System artboard's correction / track record / method / stale icons.
 */
import type { SVGProps } from 'react';

export type IconName =
  | 'correction'
  | 'track-record'
  | 'method'
  | 'stale'
  | 'menu'
  | 'close'
  | 'chevron-down'
  | 'sun'
  | 'moon'
  | 'globe';

const PATHS: Record<IconName, React.ReactNode> = {
  correction: <path d="M4 3.5h9l3 3v10H4z M13 3.5v3h3 M7 10h6 M7 13h4" strokeLinejoin="round" />,
  'track-record': <path d="M3 16.5h14 M5 13l3-4 3 2 4-6" />,
  method: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 9v5 M10 6.2v.1" />
    </>
  ),
  stale: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M10 5.5V10l3 2" />
    </>
  ),
  menu: <path d="M3 6h14M3 10h14M3 14h14" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  'chevron-down': <path d="M6 8l4 4 4-4" />,
  sun: (
    <>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2.5v1.5M10 16v1.5M2.5 10H4M16 10h1.5M4.7 4.7l1.06 1.06M14.24 14.24l1.06 1.06M4.7 15.3l1.06-1.06M14.24 5.76l1.06-1.06" />
    </>
  ),
  moon: <path d="M15.5 12.5A6.5 6.5 0 0 1 7.5 4.5a6.5 6.5 0 1 0 8 8Z" strokeLinejoin="round" />,
  globe: (
    <>
      <circle cx="10" cy="10" r="7" />
      <path d="M3 10h14M10 3c2 2.2 2.8 4.5 2.8 7s-.8 4.8-2.8 7c-2-2.2-2.8-4.5-2.8-7S8 5.2 10 3Z" strokeLinejoin="round" />
    </>
  ),
};

export function Icon({ name, size = 20, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}
