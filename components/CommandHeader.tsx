'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useConflictDay } from '@/hooks/useConflictDay';
import { useDataFreshness } from '@/hooks/useDataFreshness';
import { resolveViewerProfile } from '@/hooks/useViewerTier';
import { formatUtcStamp } from '@/lib/data-freshness';
import { GlobeMenu } from '@/components/GlobeMenu';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { TrustChip } from '@/components/ui/TrustChip';
import { Icon } from '@/components/ui/icons';
import { ThemeToggle } from '@/components/header/ThemeToggle';
import { useI18n } from '@/components/I18nProvider';
import { ARABIC_ENABLED } from '@/lib/site';
import type { UserTier } from '@/types';
import type { UIStringKey } from '@/lib/i18n';
import s from '@/components/header/header.module.css';

/**
 * Site header, design system v2 (Main.dc.html desktop, Home-Mobile.dc.html mobile).
 * Primary nav = the design's five destinations; every other route stays one click away under "More"
 * (desktop) or in the menu (mobile), grouped as before. Both menus are disclosures: a button with
 * aria-expanded, aria-controls only while the panel exists, Escape closes and returns focus to it.
 * Every href here is an existing app route (tests/unit/header-links.check.ts).
 */
type NavItem = { href: string; en: string; key?: UIStringKey };

export const PRIMARY_NAV: readonly NavItem[] = [
  { href: '/briefings', en: 'Today', key: 'navBriefings' },
  { href: '/corridors', en: 'Corridors' },
  { href: '/nai', en: 'War Posture', key: 'navNai' },
  { href: '/scenarios', en: 'Scenarios', key: 'navScenarios' },
  { href: '/countries', en: 'Countries', key: 'navCountries' },
];

export const MORE_GROUPS: readonly { key: UIStringKey; en: string; links: readonly NavItem[] }[] = [
  {
    key: 'navGroupIntel',
    en: 'Intel',
    links: [
      { href: '/warroom', en: 'War Room', key: 'navWarRoom' },
      { href: '/mediaroom', en: 'Media Room', key: 'navMediaRoom' },
      { href: '/feed', en: 'Feed', key: 'navFeed' },
    ],
  },
  {
    key: 'navGroupData',
    en: 'Data',
    links: [
      { href: '/disinfo', en: 'Disinfo', key: 'navDisinfo' },
      { href: '/timeline', en: 'Timeline', key: 'timeline' },
    ],
  },
  {
    key: 'navGroupMarketsSocial',
    en: 'Markets & social',
    links: [
      { href: '/markets', en: 'Markets', key: 'navMarkets' },
      { href: '/social', en: 'Social', key: 'navSocial' },
      { href: '/analytics', en: 'Analytics', key: 'navAnalytics' },
    ],
  },
  {
    key: 'navGroupPlatform',
    en: 'Platform',
    links: [
      { href: '/methodology', en: 'Methodology', key: 'methodology' },
      { href: '/sources', en: 'Sources', key: 'sources' },
      { href: '/api-docs', en: 'API docs', key: 'navApiDocs' },
      { href: '/contact', en: 'Contact', key: 'navContact' },
    ],
  },
];

/** The one primary call to action (gold). */
export const HEADER_CTA = { href: '/corridors#weekly', en: 'Chokepoint Weekly' } as const;

function tierLabel(tier: UserTier, t: (k: UIStringKey) => string): string {
  if (tier === 'professional') return t('proLabel');
  if (tier === 'informed') return t('informedLabel');
  return t('freeLabel');
}

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));
}

/** Diamond mark (gold, decorative). */
function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path d="M9 1.5 16.5 9 9 16.5 1.5 9Z" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M9 6 12 9 9 12 6 9Z" fill="var(--accent)" />
    </svg>
  );
}

/** Escape closes an open disclosure and returns focus to its button; a click outside closes it too. */
function useDisclosure(open: boolean, close: () => void, button: React.RefObject<HTMLButtonElement | null>, panel: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        button.current?.focus();
      }
    };
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !button.current?.contains(t)) close();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onDown);
    };
  }, [open, close, button, panel]);
}

export function CommandHeader() {
  const { t, lang } = useI18n();
  const label = (item: { en: string; key?: UIStringKey }) => (lang === 'ar' && item.key ? t(item.key) : item.en);
  const pathname = usePathname() ?? '/';
  const conflictDay = useConflictDay();
  const { lastUpdateAt, stale, staleReasons } = useDataFreshness();
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [userTier, setUserTier] = useState<UserTier | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const morePanel = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const menuPanel = useRef<HTMLElement>(null);
  const closeMore = useCallback(() => setMoreOpen(false), []);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  useDisclosure(moreOpen, closeMore, moreButton, morePanel);
  useDisclosure(menuOpen, closeMenu, menuButton, menuPanel);

  // A route change closes both menus.
  useEffect(() => {
    setMoreOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setUserTier(null);
        setIsAdmin(false);
        return;
      }
      // Shared with useViewerTier: one users + admin_users lookup per page, not one per consumer.
      const { profileTier, isAdmin: admin } = await resolveViewerProfile(supabase, session.user.id);
      setUserTier(profileTier);
      setIsAdmin(admin);
    };
    load();
    // Never await Supabase calls inside onAuthStateChange: auth-js runs the callback while holding
    // its auth lock, and load() -> getSession() waits for that same lock (deadlock: with a stored
    // session every later Supabase call on the page hung). Defer to the next tick instead.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'INITIAL_SESSION') return; // the eager load() above already covers it
      setTimeout(() => void load(), 0);
    });
    return () => subscription.unsubscribe();
  }, []);

  const loggedIn = userTier === 'free' || userTier === 'informed' || userTier === 'professional';
  const accountLinks: NavItem[] = [
    loggedIn ? { href: '/account', en: 'Account', key: 'account' } : { href: '/login', en: 'Sign in', key: 'login' },
    { href: '/pricing', en: 'Access', key: 'pricing' },
    ...(isAdmin ? [{ href: '/admin', en: 'Admin', key: 'admin' as UIStringKey }] : []),
  ];
  const groups = [...MORE_GROUPS, { key: 'navGroupAccount' as UIStringKey, en: 'Account', links: accountLinks }];

  // "Day 228 · 10:05 UTC": calendar day (DAY LOCK) and the newest article's real timestamp.
  const updated = formatUtcStamp(lastUpdateAt);
  const staleTitle = staleReasons.join(' · ') || 'Data may be out of date';
  const stamp = (
    <span className={s.stamp}>
      <span>Day {conflictDay}</span>
      <span className={s.sep} aria-hidden="true">
        {' · '}
      </span>
      <span>
        <span className="sr-only">, updated </span>
        {updated}
      </span>
    </span>
  );

  const groupBlocks = (onNavigate?: () => void) =>
    groups.map((g) => (
      <div key={g.key} className={s.group}>
        <p className={s.groupLabel} id={`hdr-${g.key}`}>
          {label(g)}
        </p>
        {g.key === 'navGroupAccount' && loggedIn ? (
          <span className={s.planLine} translate="no">
            {t('navCurrentPlan')}: {tierLabel(userTier, t)}
          </span>
        ) : null}
        <ul className={s.groupList} aria-labelledby={`hdr-${g.key}`}>
          {g.links.map((l) => (
            <li key={l.href}>
              <Link
                prefetch={false}
                href={l.href}
                className={s.groupLink}
                aria-current={isCurrent(pathname, l.href) ? 'page' : undefined}
                onClick={onNavigate}
              >
                {label(l)}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    ));

  return (
    <header className={s.header}>
      <div className={s.bar}>
        <Link prefetch={false} href="/" className={s.logo} aria-current={pathname === '/' ? 'page' : undefined}>
          <Mark />
          <span className={s.logoText}>MENA Intel Desk</span>
        </Link>

        <nav aria-label="Main" className={s.nav}>
          {PRIMARY_NAV.map((item) => (
            <Link
              prefetch={false}
              key={item.href}
              href={item.href}
              className={s.navLink}
              aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
            >
              {label(item)}
            </Link>
          ))}
          <button
            ref={moreButton}
            type="button"
            className={s.moreButton}
            aria-expanded={moreOpen}
            aria-controls={moreOpen ? 'header-more' : undefined}
            onClick={() => setMoreOpen((v) => !v)}
          >
            More
            <Icon name="chevron-down" />
          </button>
          {moreOpen ? (
            <div ref={morePanel} id="header-more" className={s.morePanel}>
              {groupBlocks(closeMore)}
              <div className={s.group}>
                <GlobeMenu inline />
              </div>
            </div>
          ) : null}
        </nav>

        <div className={s.right}>
          {stamp}
          {stale ? (
            <span className={s.desktopOnly}>
              <TrustChip kind="stale" label="Data stale" title={staleTitle} />
            </span>
          ) : null}
          {ARABIC_ENABLED ? (
            <span className={s.desktopOnly}>
              <LanguageToggle />
            </span>
          ) : null}
          <span className={s.desktopOnly}>
            <ThemeToggle />
          </span>
          <Link prefetch={false} href={HEADER_CTA.href} className={`${s.cta} ${s.desktopOnly}`}>
            {HEADER_CTA.en}
          </Link>
          <button
            ref={menuButton}
            type="button"
            className={`${s.iconButton} ${s.menuButton}`}
            aria-expanded={menuOpen}
            aria-controls={menuOpen ? 'header-menu' : undefined}
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <Icon name={menuOpen ? 'close' : 'menu'} size={22} />
          </button>
        </div>
      </div>

      {menuOpen ? (
        <nav ref={menuPanel} id="header-menu" aria-label="Menu" className={s.menu}>
          <div className={s.menuInner}>
            {stale ? <TrustChip kind="stale" label="Data stale" title={staleTitle} /> : null}
            <ul className={s.menuPrimary}>
              {PRIMARY_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    prefetch={false}
                    href={item.href}
                    className={s.groupLink}
                    aria-current={isCurrent(pathname, item.href) ? 'page' : undefined}
                    onClick={closeMenu}
                  >
                    {label(item)}
                  </Link>
                </li>
              ))}
              <li>
                <Link prefetch={false} href={HEADER_CTA.href} className={s.cta} onClick={closeMenu} style={{ marginBlock: 8 }}>
                  {HEADER_CTA.en}
                </Link>
              </li>
            </ul>
            <div className={s.menuGroups}>{groupBlocks(closeMenu)}</div>
            <div className={s.menuTools}>
              <ThemeToggle withLabel />
              {ARABIC_ENABLED ? <LanguageToggle /> : null}
              <GlobeMenu inline />
            </div>
          </div>
        </nav>
      ) : null}
    </header>
  );
}
