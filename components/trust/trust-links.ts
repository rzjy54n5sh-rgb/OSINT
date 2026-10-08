/** The six trust pages, in footer / sub-nav order. Shared by the server TrustPage shell and the client footer. */
export const TRUST_LINKS = [
  { href: '/about', label: 'About' },
  { href: '/charter', label: 'Editorial charter' },
  { href: '/ai-disclosure', label: 'AI disclosure' },
  { href: '/corrections', label: 'Corrections' },
  { href: '/track-record', label: 'Track record' },
  { href: '/conflicts-of-interest', label: 'Conflicts of interest' },
] as const;

export type TrustHref = (typeof TRUST_LINKS)[number]['href'];
