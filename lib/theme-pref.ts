/**
 * The reader's theme choice (design system v2). Dark is the default; only a choice made with the header's
 * ThemeToggle is stored. Kept in memory too, so a choice made while storage is blocked (private windows)
 * still holds for the page view. Read by the root boot script (same key), ThemeToggle, ThemeGuard and
 * AdminThemeLock.
 */
export const THEME_STORAGE_KEY = 'mid-theme';
/** Set by TranslationBanner when dismissed; mirrored on <html> as data-tb-dismissed. */
export const TB_DISMISSED_KEY = 'mena-translation-dismissed';

export type ThemeChoice = 'dark' | 'light';

declare global {
  interface Window {
    __midTheme?: ThemeChoice;
  }
}

/** The stored choice, or null when the reader never chose (dark default). */
export function readThemePref(): ThemeChoice | null {
  if (typeof window === 'undefined') return null;
  if (window.__midTheme) return window.__midTheme;
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

/** Record a choice (memory first, then storage when available). Call BEFORE changing the attribute. */
export function writeThemePref(theme: ThemeChoice): void {
  window.__midTheme = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    /* storage blocked: the in-memory choice still holds for this page view */
  }
}

export function readTbDismissed(): boolean {
  try {
    return Boolean(localStorage.getItem(TB_DISMISSED_KEY));
  } catch {
    return false;
  }
}

/** The admin panel is not converted to the light theme and is always dark. */
export function isAdminPath(pathname: string): boolean {
  return pathname === '/admin' || pathname.startsWith('/admin/');
}
