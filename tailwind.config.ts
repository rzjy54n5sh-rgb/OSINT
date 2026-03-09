import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'bg-primary': 'var(--bg-primary)',
        'bg-secondary': 'var(--bg-secondary)',
        'bg-card': 'var(--bg-card)',
        'bg-elevated': 'var(--bg-elevated)',
        border: 'var(--border)',
        'border-accent': 'var(--border-accent)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'accent-gold': 'var(--accent-gold)',
        'accent-red': 'var(--accent-red)',
        'accent-orange': 'var(--accent-orange)',
        'accent-green': 'var(--accent-green)',
        'accent-blue': 'var(--accent-blue)',
        'accent-teal': 'var(--accent-teal)',
        'nai-aligned': 'var(--nai-aligned)',
        'nai-stable': 'var(--nai-stable)',
        'nai-tension': 'var(--nai-tension)',
        'nai-fracture': 'var(--nai-fracture)',
        'nai-inversion': 'var(--nai-inversion)',
      },
      fontFamily: {
        mono: ['var(--font-plex-mono)', 'monospace'],
        heading: ['var(--font-space-grotesk)', 'sans-serif'],
        sans: ['var(--font-inter)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
