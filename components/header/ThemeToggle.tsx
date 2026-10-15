'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/icons';
import { THEME_STORAGE_KEY, writeThemePref } from '@/lib/theme-pref';

/** localStorage key read by the root layout's boot script (applied before first paint, so no flash). */
export { THEME_STORAGE_KEY };

type Theme = 'dark' | 'light';

function readTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

/** Browser chrome colour follows the page ground (--bg of the theme now applied). */
function syncThemeColor() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (bg && meta) meta.setAttribute('content', bg);
}

/**
 * Dark (default) / light switch, design system v2: an icon button (global .hdr-icon-button) with a fixed
 * accessible name and aria-pressed. The header renders it with its visible label "Light theme" in More
 * (desktop) and in the menu (phones): the bar has no room for it next to the nav, the dated stamp and the
 * stale chip (tests/e2e/header-layout.spec.ts). The icon is chosen in CSS from [data-theme] (.hdr-theme-icon-*), so
 * it is already right before hydration; aria-pressed is synced on mount. Dark is the default and the OS
 * setting is not read: only a choice made here is stored, in localStorage when it is available
 * (try/catch: private windows and blocked storage still switch for this page view).
 */
export function ThemeToggle({ className = '', withLabel = false }: { className?: string; withLabel?: boolean }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => {
    const t = readTheme();
    setTheme(t);
    if (t === 'light') syncThemeColor(); // the boot script may run before the theme-color meta exists
  }, []);

  const toggle = () => {
    const next: Theme = readTheme() === 'light' ? 'dark' : 'light';
    // Choice first (memory + storage), then the attribute: ThemeGuard re-applies the recorded choice on
    // any change to data-theme, so recording it first means the guard never undoes the switch.
    writeThemePref(next);
    document.documentElement.setAttribute('data-theme', next);
    syncThemeColor();
    setTheme(next);
  };

  return (
    <button
      type="button"
      className={`${withLabel ? 'hdr-lang hdr-theme-toggle-labelled' : 'hdr-icon-button hdr-theme-toggle'} ${className}`}
      onClick={toggle}
      aria-pressed={theme === 'light'}
      aria-label={withLabel ? undefined : 'Light theme'}
      title="Light theme"
    >
      <Icon name="moon" className="hdr-theme-icon-dark" />
      <Icon name="sun" className="hdr-theme-icon-light" />
      {withLabel ? <span className="hdr-tool-label">Light theme</span> : null}
    </button>
  );
}
