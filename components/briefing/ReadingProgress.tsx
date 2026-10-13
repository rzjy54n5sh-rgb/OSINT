'use client';

import { useEffect, useRef } from 'react';
import s from './brief.module.css';

/**
 * The reader's only client code (R12: no stored "read" marks, just the progress bar).
 *  - Reading progress: a 3 px bar under the header, scaled with scroll (no number, no transition, so
 *    nothing animates under prefers-reduced-motion).
 *  - Scrollspy: marks the contents entry of the section being read with aria-current="location" (the
 *    CSS styles it with weight + underline). The contents are server-rendered; this only sets the attribute.
 *  - Closes the phone contents disclosure after a link in it is followed.
 *  - Keeps the sticky offsets under the real header height (--brief-top), re-measured whenever the header
 *    box changes size (ResizeObserver), e.g. a two-line stamp on phones.
 */
export function ReadingProgress() {
  const fill = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = fill.current?.closest<HTMLElement>('[data-brief-root]');
    if (!root) return;
    const header = document.querySelector('header');
    const syncTop = () => {
      const h = header?.getBoundingClientRect().height;
      if (h && h > 0 && h < 200) root.style.setProperty('--brief-top', `${Math.round(h)}px`);
    };
    syncTop();
    const targets = Array.from(root.querySelectorAll<HTMLElement>('[data-toc-target]'));
    const links = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[data-toc]'));
    let active: string | null = null;
    let frame = 0;

    const update = () => {
      frame = 0;
      const el = document.documentElement;
      const max = el.scrollHeight - el.clientHeight;
      const p = max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
      if (fill.current) fill.current.style.transform = `scaleX(${p})`;
      const line = (header?.getBoundingClientRect().bottom ?? 0) + 48;
      let next: string | null = targets[0]?.id ?? null;
      for (const t of targets) if (t.getBoundingClientRect().top <= line) next = t.id;
      if (max > 0 && el.scrollTop >= max - 2 && targets.length) next = targets[targets.length - 1].id;
      if (next !== active) {
        active = next;
        for (const a of links) {
          if (a.dataset.toc === active) a.setAttribute('aria-current', 'location');
          else a.removeAttribute('aria-current');
        }
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const onResize = () => {
      syncTop();
      onScroll();
    };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.('a[data-toc]');
      const d = a?.closest('details');
      if (d) d.removeAttribute('open');
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // The header can change height after hydration (its stamp fills in client-side and can wrap to two
    // lines on phones), so follow its box, not just window resizes.
    const ro = typeof ResizeObserver !== 'undefined' && header ? new ResizeObserver(onResize) : null;
    if (ro && header) ro.observe(header);
    root.addEventListener('click', onClick);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
      ro?.disconnect();
      root.removeEventListener('click', onClick);
    };
  }, []);

  return (
    <div className={s.progress} aria-hidden="true">
      <div ref={fill} className={s.progressFill} />
    </div>
  );
}

export default ReadingProgress;
