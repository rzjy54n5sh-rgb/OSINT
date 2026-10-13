'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import s from './header.module.css';

/** localStorage key read by the root layout's boot script (applied before first paint). */
export const THEME_STORAGE_KEY = 'mid-theme';

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/**
 * Dark (default) / light switch. The icon is chosen in CSS from [data-theme], so it is already right
 * before hydration; aria-pressed is synced on mount. The choice persists in localStorage when storage
 * is available (try/catch: private windows and blocked storage still switch for the page view).
 */
export function ThemeToggle({ withLabel = false }: { withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => setTheme(readTheme()), []);

  const toggle = () => {
    const next: Theme = readTheme() === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage blocked: the switch still applies to this page view */
    }
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={withLabel ? s.lang : s.iconButton}
      onClick={toggle}
      aria-pressed={theme === 'light'}
      aria-label={withLabel ? undefined : 'Light theme'}
      title="Light theme"
    >
      <Icon name="moon" className={s.iconMoon} />
      <Icon name="sun" className={s.iconSun} />
      {withLabel ? <span style={{ marginInlineStart: 8 }}>Light theme</span> : null}
    </button>
  );
}
