import { IBM_Plex_Mono, IBM_Plex_Sans, Newsreader, Noto_Sans_Arabic } from 'next/font/google';

/**
 * Design system v2 faces, self-hosted at build time by next/font (no runtime request to Google).
 *
 * Preloads (budget ≤ 3): 2 files on every page, the small faces used above the fold everywhere —
 *   1. IBM Plex Sans 400   (interface text, --font-sans; ~18 KB)
 *   2. IBM Plex Mono 400   (numbers, times, codes; --font-mono; ~10 KB)
 * Newsreader (headings and reading, --font-serif) is not preloaded and loads WITHOUT the optical-size
 * axis: the opsz + wght file is ~130 KB (latin) against ~58 KB for wght alone, and measured −4 to −5
 * Lighthouse mobile points on /warroom whether preloaded or not (2026-10-13, 3 runs each). It swaps in
 * over a metric-matched Times New Roman fallback. The other weights share each family name (the
 * @font-face rules join it) and are fetched only when text actually uses them. All faces use font-display: swap with
 * next/font's metric-adjusted fallbacks (Arial / Times New Roman / Courier New), so the swap does
 * not move the layout. Noto Sans Arabic is unchanged from perf batch 1: never preloaded, downloaded
 * only when Arabic UI text renders in it. The v2 Arabic faces (Noto Kufi Arabic, IBM Plex Sans
 * Arabic) belong to /ar and are not loaded here.
 */
export const plexSans = IBM_Plex_Sans({ weight: '400', subsets: ['latin'], variable: '--font-sans', display: 'swap' });
export const plexSansOther = IBM_Plex_Sans({
  weight: ['500', '600'],
  subsets: ['latin'],
  variable: '--font-sans-other',
  display: 'swap',
  preload: false,
});
export const newsreader = Newsreader({
  subsets: ['latin'],
  style: 'normal',
  weight: ['400', '500', '600'],
  variable: '--font-serif',
  display: 'swap',
  preload: false,
});
export const plexMono = IBM_Plex_Mono({ weight: '400', subsets: ['latin'], variable: '--font-mono', display: 'swap' });
export const plexMonoOther = IBM_Plex_Mono({
  weight: '500',
  subsets: ['latin'],
  variable: '--font-mono-other',
  display: 'swap',
  preload: false,
});
export const notoArabic = Noto_Sans_Arabic({
  weight: ['400', '500', '600'],
  subsets: ['arabic'],
  variable: '--font-arabic',
  display: 'swap',
  preload: false,
});

/** Class names for <html>: each defines its CSS variable (and keeps its @font-face rules in the bundle). */
export const fontVariables = [plexSans, plexSansOther, newsreader, plexMono, plexMonoOther, notoArabic]
  .map((f) => f.variable)
  .join(' ');
