import { IBM_Plex_Sans, Newsreader } from 'next/font/google';

/**
 * Design system v2 faces, scoped to the corridor components through CSS variables
 * (--cor-font-sans, --cor-font-serif) on their root element only. Site-wide fonts are unchanged;
 * IBM Plex Mono is already loaded by the root layout (--font-mono). preload: false so placing the
 * strip on another route adds no preload links; text renders in the fallback until the face loads.
 */
export const corridorSans = IBM_Plex_Sans({
  weight: ['400', '500', '600'],
  subsets: ['latin'],
  variable: '--cor-font-sans',
  display: 'swap',
  preload: false,
});

export const corridorSerif = Newsreader({
  weight: ['500'],
  subsets: ['latin'],
  variable: '--cor-font-serif',
  display: 'swap',
  preload: false,
});

export const corridorFontVars = `${corridorSans.variable} ${corridorSerif.variable}`;
