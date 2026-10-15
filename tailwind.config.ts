import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{js,ts,jsx,tsx,mdx}', './components/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-card': 'var(--bg-card)',
        border: 'var(--border)',
        'border-bright': 'var(--border-bright)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'accent-gold': 'var(--accent-gold)',
        'accent-red': 'var(--accent-red)',
        'accent-green': 'var(--accent-green)',
        'accent-blue': 'var(--accent-blue)',
        'accent-orange': 'var(--accent-orange)',
        /** Semantic aliases for ConflictDayBadge + UI */
        gold: 'var(--accent-gold)',
        subtle: 'var(--text-muted)',
      },
      /** Design system v2: 13 px UI floor (app/globals.css --fs-meta). `text-xs` was Tailwind's 12 px. */
      fontSize: {
        xs: ['0.8125rem', { lineHeight: '1.125rem' }],
      },
      /** Design system v2 stacks (app/globals.css): Newsreader, IBM Plex Sans, IBM Plex Mono. */
      fontFamily: {
        display: ['var(--font-display)'],
        serif: ['var(--font-display)'],
        sans: ['var(--font-ui)'],
        body: ['var(--font-ui)'],
        mono: ['var(--font-numeric)'],
      },
    },
  },
  plugins: [],
};
export default config;
