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
      fontFamily: {
        display: ['var(--font-bebas)', 'Bebas Neue', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
        body: ['DM Sans', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
export default config;
