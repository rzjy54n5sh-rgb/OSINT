'use client';

import { useLayoutEffect } from 'react';
import { usePathname } from 'next/navigation';
import { LIGHT_THEME_ENABLED } from '@/lib/design-tokens';
import { isAdminPath, readTbDismissed, readThemePref } from '@/lib/theme-pref';

/**
 * Keeps <html data-theme> and <html data-tb-dismissed> equal to the reader's stored choices.
 *
 * The root boot script sets both before first paint, but when hydration fails at the root (React #418:
 * the server HTML differs from the client render, which in-page translators cause by rewriting text
 * nodes — and the site recommends browser translate) React re-renders the document and resets <html>'s
 * attributes to its props, so a light reader flipped to dark and the dismissed banner came back.
 * This re-applies them in a layout effect (before paint) and whenever those attributes change
 * (MutationObserver callbacks run before the next paint). On /admin the theme is always dark.
 *
 * It never fights the ThemeToggle: the toggle records the new choice (writeThemePref) before it changes
 * the attribute, so by the time this observer runs the attribute already matches the choice.
 */
export function ThemeGuard() {
  const admin = isAdminPath(usePathname() ?? '/');
  useLayoutEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      if (LIGHT_THEME_ENABLED) {
        const want = admin ? 'dark' : readThemePref();
        if (want && root.getAttribute('data-theme') !== want) root.setAttribute('data-theme', want);
      }
      if (readTbDismissed() && !root.hasAttribute('data-tb-dismissed')) root.setAttribute('data-tb-dismissed', '');
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme', 'data-tb-dismissed'] });
    return () => observer.disconnect();
  }, [admin]);
  return null;
}
