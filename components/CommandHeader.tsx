'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
import { createClient } from '@/utils/supabase/client';
import { useRealtimeCount } from '@/hooks/useRealtimeCount';
import { useConflictDay } from '@/hooks/useConflictDay';
import { useDataFreshness } from '@/hooks/useDataFreshness';
import { GlossaryTooltip } from '@/components/GlossaryTooltip';
import { GLOSSARY } from '@/lib/glossary';
import { GlobeMenu } from '@/components/GlobeMenu';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { useI18n } from '@/components/I18nProvider';
import type { UserTier } from '@/types';
import type { UIStringKey } from '@/lib/i18n';

type NavItem = { href: string; labelKey: UIStringKey; isWarRoom?: boolean };

const NAV_GROUPS: { groupLabelKey: UIStringKey; links: NavItem[] }[] = [
  {
    groupLabelKey: 'navGroupIntel',
    links: [
      { href: '/warroom', labelKey: 'navWarRoom', isWarRoom: true },
      { href: '/briefings', labelKey: 'navBriefings' },
      { href: '/mediaroom', labelKey: 'navMediaRoom' },
      { href: '/feed', labelKey: 'navFeed' },
    ],
  },
  {
    groupLabelKey: 'navGroupData',
    links: [
      { href: '/nai', labelKey: 'navNai' },
      { href: '/countries', labelKey: 'navCountries' },
      { href: '/scenarios', labelKey: 'navScenarios' },
      { href: '/disinfo', labelKey: 'navDisinfo' },
    ],
  },
  {
    groupLabelKey: 'navGroupMarketsSocial',
    links: [
      { href: '/markets', labelKey: 'navMarkets' },
      { href: '/social', labelKey: 'navSocial' },
      { href: '/analytics', labelKey: 'navAnalytics' },
    ],
  },
  {
    groupLabelKey: 'navGroupPlatform',
    links: [
      { href: '/pricing', labelKey: 'pricing' },
      { href: '/methodology', labelKey: 'methodology' },
      { href: '/sources', labelKey: 'sources' },
      { href: '/timeline', labelKey: 'timeline' },
      { href: '/api-docs', labelKey: 'navApiDocs' },
      { href: '/contact', labelKey: 'navContact' },
    ],
  },
];

function tierLabel(tier: UserTier, t: (k: UIStringKey) => string): string {
  if (tier === 'professional') return `◆ ${t('proLabel')}`;
  if (tier === 'informed') return t('informedLabel');
  return t('freeLabel');
}

export function CommandHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { articleCount, lastUpdate, live } = useRealtimeCount();
  const conflictDay = useConflictDay();
  const { lastNaiUpdate, stale } = useDataFreshness();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userTier, setUserTier] = useState<UserTier | null | undefined>(undefined);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    const load = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        setUserTier(null);
        setIsAdmin(false);
        return;
      }
      const [tierRes, adminRes] = await Promise.all([
        supabase.from('users').select('tier').eq('id', session.user.id).maybeSingle(),
        supabase.from('admin_users').select('id').eq('user_id', session.user.id).eq('is_active', true).maybeSingle(),
      ]);
      setUserTier((tierRes.data?.tier as UserTier) ?? null);
      setIsAdmin(!!adminRes.data);
    };
    load();
    const { data: { subscription } } = supabase.auth.onAuthStateChange(load);
    return () => subscription.unsubscribe();
  }, []);

  const loggedIn = userTier === 'free' || userTier === 'informed' || userTier === 'professional';
  const showGuestAuth = !loggedIn; /* null, undefined, or unexpected */

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(7, 10, 15, 0.88)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        borderBottom: '1px solid var(--border)',
      }}
    >
      <div
        style={{
          maxWidth: '1800px',
          margin: '0 auto',
          padding: '0 24px',
          height: '44px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          <span style={{ color: 'var(--accent-gold)', fontSize: '14px', lineHeight: 1 }}>◆</span>
          <span
            style={{
              fontFamily: 'Bebas Neue, sans-serif',
              fontSize: '16px',
              letterSpacing: '3px',
              color: 'var(--text-primary)',
            }}
          >
            MENA INTEL DESK
          </span>
        </Link>

        {/* Center stats */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            fontFamily: 'IBM Plex Mono, monospace',
            fontSize: '9px',
            letterSpacing: '1.5px',
            color: 'var(--text-muted)',
            textTransform: 'uppercase',
            flexShrink: 0,
          }}
          className="hidden-mobile"
        >
          <GlossaryTooltip term="CONFLICT_DAY" definition={GLOSSARY.CONFLICT_DAY}>
            <span>
              <span translate="no">DAY: </span>
              <span style={{ color: 'var(--accent-red)' }}>{conflictDay ?? '—'}</span>
            </span>
          </GlossaryTooltip>
          <span style={{ color: 'var(--border-bright)' }}>|</span>
          <span>
            UPDATE:{' '}
            <span style={{ color: 'var(--text-secondary)' }}>{lastUpdate}</span>
          </span>
          <span style={{ color: 'var(--border-bright)' }}>|</span>
          <span>
            ARTICLES:{' '}
            <span style={{ color: 'var(--accent-gold)' }}>{articleCount}</span>
          </span>
          <span style={{ color: 'var(--border-bright)' }}>|</span>
          {/* Live indicator */}
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ position: 'relative', display: 'inline-flex', width: '8px', height: '8px' }}>
              {live && (
                <span
                  className="pulse-ring"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: 'var(--accent-red)',
                    opacity: 0.6,
                  }}
                />
              )}
              <span
                style={{
                  position: 'relative',
                  display: 'inline-flex',
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: live ? 'var(--accent-red)' : 'var(--text-muted)',
                }}
              />
            </span>
            <span style={{ color: live ? 'var(--accent-red)' : 'var(--text-muted)' }}>
              {live ? 'LIVE' : 'STANDBY'}
            </span>
          </span>
          {stale && (
            <span
              style={{
                fontFamily: 'IBM Plex Mono', fontSize: 8, letterSpacing: '1px',
                color: 'var(--accent-orange)',
                border: '1px solid var(--accent-orange)',
                padding: '2px 8px',
                animation: 'pulse 2s infinite',
              }}
              title={lastNaiUpdate ? `NAI scores last updated: ${new Date(lastNaiUpdate).toLocaleString()}` : 'NAI scores last updated: unknown'}
            >
              ⚠ DATA STALE
            </span>
          )}
          {!stale && lastNaiUpdate && (
            <span
              style={{ fontFamily: 'IBM Plex Mono', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '1px' }}
              title={`NAI scores last updated: ${new Date(lastNaiUpdate).toLocaleString()}`}
            >
              ◆ SYNCED
            </span>
          )}
        </div>

        {/* Desktop nav — mega menu (hover / focus-within) */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            flexShrink: 1,
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
          className="hidden-mobile"
          aria-label="Main navigation"
        >
          <div className="desktop-nav-mega">
            {NAV_GROUPS.map((group) => (
              <div key={group.groupLabelKey} className="desktop-nav-mega__item">
                <button type="button" className="desktop-nav-mega__trigger" aria-haspopup="true" aria-label={t(group.groupLabelKey)}>
                  <span>{t(group.groupLabelKey)}</span>
                  <span className="desktop-nav-mega__chev" aria-hidden>
                    ▾
                  </span>
                </button>
                <div className="desktop-nav-mega__hover-bridge" aria-hidden />
                <div className="desktop-nav-mega__panel" aria-label={t(group.groupLabelKey)}>
                  {group.links.map(({ href, labelKey, isWarRoom }) => {
                    const active = pathname === href;
                    return (
                      <Link
                        key={href}
                        href={href}
                        className={`desktop-nav-mega__link${active ? ' desktop-nav-mega__link--active' : ''}${isWarRoom ? ' desktop-nav-mega__link--war' : ''}`}
                      >
                        {isWarRoom && (
                          <span className="desktop-nav-mega__dot" aria-hidden>
                            <span
                              className="pulse-ring"
                              style={{
                                position: 'absolute',
                                inset: -2,
                                borderRadius: '50%',
                                background: 'var(--accent-red)',
                                opacity: 0.4,
                              }}
                            />
                          </span>
                        )}
                        <span>{t(labelKey)}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
            {/* Account: tier, sign-in, billing, admin — same hover bridge as other megas */}
            <div className="desktop-nav-mega__item">
              <button type="button" className="desktop-nav-mega__trigger" aria-haspopup="true" aria-label={t('navGroupAccount')}>
                <span>{t('navGroupAccount')}</span>
                {loggedIn && (
                  <span className="desktop-nav-mega__trigger-tier" translate="no">
                    · {tierLabel(userTier, t)}
                  </span>
                )}
                <span className="desktop-nav-mega__chev" aria-hidden>
                  ▾
                </span>
              </button>
              <div className="desktop-nav-mega__hover-bridge" aria-hidden />
              <div className="desktop-nav-mega__panel" aria-label={t('navGroupAccount')}>
                {loggedIn && (
                  <div className="desktop-nav-mega__tier-meta">
                    {t('navCurrentPlan')}
                    <span
                      className={`desktop-nav-mega__tier-value${userTier === 'professional' ? ' desktop-nav-mega__tier-value--pro' : ''}${userTier === 'informed' ? ' desktop-nav-mega__tier-value--informed' : ''}${userTier === 'free' ? ' desktop-nav-mega__tier-value--free' : ''}`}
                      translate="no"
                    >
                      {tierLabel(userTier, t)}
                    </span>
                  </div>
                )}
                {showGuestAuth && (
                  <Link
                    href="/login"
                    className={`desktop-nav-mega__link${pathname === '/login' ? ' desktop-nav-mega__link--active' : ''}`}
                  >
                    {t('login')}
                  </Link>
                )}
                {loggedIn && (
                  <Link
                    href="/account"
                    className={`desktop-nav-mega__link${pathname === '/account' ? ' desktop-nav-mega__link--active' : ''}`}
                  >
                    {t('account')}
                  </Link>
                )}
                <Link href="/pricing" className={`desktop-nav-mega__link${pathname === '/pricing' ? ' desktop-nav-mega__link--active' : ''}`}>
                  {t('pricing')}
                </Link>
                {isAdmin && (
                  <Link href="/admin" className={`desktop-nav-mega__link${pathname.startsWith('/admin') ? ' desktop-nav-mega__link--active' : ''}`} style={{ color: 'var(--accent-gold)' }}>
                    {t('admin')}
                  </Link>
                )}
              </div>
            </div>
          </div>
          <span style={{ width: 1, height: 14, background: 'var(--border)', flexShrink: 0 }} aria-hidden />
          <GlobeMenu />
          <LanguageToggle />
        </nav>

        {/* Mobile hamburger */}
        <button
          onClick={() => setMenuOpen(v => !v)}
          aria-label="Toggle menu"
          style={{
            display: 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            padding: '4px',
            color: 'var(--text-secondary)',
          }}
          className="show-mobile"
        >
          <span
            style={{
              fontFamily: 'IBM Plex Mono, monospace',
              fontSize: '11px',
              letterSpacing: '2px',
            }}
          >
            {menuOpen ? t('menuClose') : t('menuOpen')}
          </span>
        </button>
      </div>

      {/* Mobile dropdown — grouped, compact */}
      {menuOpen && (
        <nav
          style={{
            borderTop: '1px solid var(--border)',
            padding: '10px 16px 12px',
            background: 'rgba(7,10,15,0.96)',
            maxHeight: '70vh',
            overflowY: 'auto',
          }}
        >
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', columnGap: 16, rowGap: 12 }}>
            {NAV_GROUPS.map((group) => (
              <div key={group.groupLabelKey} style={{ display: 'contents' }}>
                <div
                  style={{
                    gridColumn: '1 / -1',
                    fontFamily: 'IBM Plex Mono, monospace',
                    fontSize: 8,
                    letterSpacing: '1.5px',
                    color: 'var(--text-muted)',
                    marginTop: 4,
                  }}
                >
                  {t(group.groupLabelKey)}
                </div>
                {group.links.map(({ href, labelKey, isWarRoom }) => (
                  <Link
                    key={href}
                    href={href}
                    className="header-link"
                    onClick={() => setMenuOpen(false)}
                    style={{
                      fontSize: 10,
                      color: isWarRoom ? 'var(--accent-red)' : pathname === href ? 'var(--accent-gold)' : undefined,
                    }}
                  >
                    {t(labelKey)}
                  </Link>
                ))}
              </div>
            ))}
          </div>
          <div
            style={{
              marginTop: 12,
              paddingTop: 10,
              borderTop: '1px solid var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontFamily: 'IBM Plex Mono, monospace',
                fontSize: 8,
                letterSpacing: '1.5px',
                color: 'var(--text-muted)',
              }}
            >
              {t('navGroupAccount')}
            </div>
            {loggedIn && (
              <span
                className="font-mono"
                style={{
                  fontSize: 10,
                  ...(userTier === 'professional' ? { color: '#E8C547' } : userTier === 'informed' ? { color: '#1E90FF' } : { color: '#4A5568' }),
                }}
                translate="no"
              >
                {t('navCurrentPlan')}: {tierLabel(userTier, t)}
              </span>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
              {showGuestAuth && (
                <Link href="/login" onClick={() => setMenuOpen(false)} className="header-link" style={{ fontSize: 10 }}>
                  {t('login')}
                </Link>
              )}
              {loggedIn && (
                <Link href="/account" onClick={() => setMenuOpen(false)} className="header-link" style={{ fontSize: 10 }}>
                  {t('account')}
                </Link>
              )}
              <Link href="/pricing" onClick={() => setMenuOpen(false)} className="header-link" style={{ fontSize: 10 }}>
                {t('pricing')}
              </Link>
              {isAdmin && (
                <Link href="/admin" onClick={() => setMenuOpen(false)} className="header-link" style={{ fontSize: 10, color: 'var(--accent-gold)' }}>
                  {t('admin')}
                </Link>
              )}
              <GlobeMenu />
              <LanguageToggle />
            </div>
          </div>
        </nav>
      )}

      <style>{`
        @media (max-width: 900px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
        }
        @media (min-width: 901px) {
          .show-mobile { display: none !important; }
        }
      `}</style>
    </header>
  );
}
