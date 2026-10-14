'use client';

import { useLayoutEffect } from 'react';

/**
 * The admin panel is not converted to the light theme (about 190 hard-coded dark colours), so it is
 * forced dark: its layout wraps everything in data-theme="dark" (globals.css re-declares the dark
 * tokens for that selector), the root boot script never applies a stored 'light' on /admin, and this
 * keeps <html> dark while an admin route is open after a client-side navigation from a light page, so
 * the site header around the panel is never half-light. Leaving the panel restores the stored choice.
 */
export function AdminThemeLock() {
  // Layout effect: on a client-side navigation into /admin it runs after the DOM update and BEFORE the
  // browser paints, so the header around the panel never shows one light frame. (On a full load the root
  // boot script already skipped a stored 'light' on /admin, and the server-rendered wrapper is dark.)
  useLayoutEffect(() => {
    const root = document.documentElement;
    const before = root.getAttribute('data-theme');
    root.setAttribute('data-theme', 'dark');
    return () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem('mid-theme');
      } catch {
        /* storage blocked */
      }
      const next = stored === 'light' || stored === 'dark' ? stored : before;
      if (next) root.setAttribute('data-theme', next);
      else root.removeAttribute('data-theme');
    };
  }, []);
  return null;
}
