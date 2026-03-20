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

const NAV_LINKS: { href: string; labelKey: UIStringKey; isWarRoom?: boolean }[] = [
  { href: '/warroom', labelKey: 'navWarRoom', isWarRoom: true },
  { href: '/briefings', labelKey: 'navBriefings' },
  { href: '/mediaroom', labelKey: 'navMediaRoom' },
  { href: '/feed', labelKey: 'navFeed' },
  { href: '/nai', labelKey: 'navNai' },
  { href: '/countries', labelKey: 'navCountries' },
  { href: '/scenarios', labelKey: 'navScenarios' },
  { href: '/disinfo', labelKey: 'navDisinfo' },
  { href: '/pricing', labelKey: 'pricing' },
  { href: '/markets', labelKey: 'navMarkets' },
  { href: '/social', labelKey: 'navSocial' },
  { href: '/analytics', labelKey: 'navAnalytics' },
  { href: '/methodology', labelKey: 'methodology' },
  { href: '/sources', labelKey: 'sources' },
  { href: '/timeline', labelKey: 'timeline' },
  { href: '/contact', labelKey: 'navContact' },
];

export function CommandHeader() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { articleCount, lastUpdate, live } = useRealtimeCount();
  const conflictDay = useConflictDay();
  const { lastNaiUpdate, stale } = useDataFreshness();
  const [menuOpen, setMenuOpen] = useState(false);
  const [userTier, setUserTier] = useState<UserTier | null | undefined>(undefined);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user?.id) {
        setUserTier(null);
        return;
      }
      supabase.from('users').select('tier').eq('id', session.user.id).maybeSingle().then(({ data }) => {
        setUserTier((data?.tier as UserTier) ?? null);
      });
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (!session?.user?.id) {
          setUserTier(null);
          return;
        }
        supabase.from('users').select('tier').eq('id', session.user.id).maybeSingle().then(({ data }) => {
          setUserTier((data?.tier as UserTier) ?? null);
        });
      });
    });
    return () => subscription.unsubscribe();
  }, []);

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

        {/* Desktop nav */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            flexShrink: 0,
          }}
          className="hidden-mobile"
        >
          {NAV_LINKS.map(({ href, labelKey, isWarRoom }) => (
            <Link
              key={href}
              href={href}
              className="header-link"
              style={{
                color: isWarRoom ? 'var(--accent-red)' : pathname === href ? 'var(--accent-gold)' : undefined,
                opacity: isWarRoom ? 1 : undefined,
                filter: isWarRoom ? 'none' : undefined,
              }}
            >
              {isWarRoom && (
                <span
                  style={{
                    position: 'relative',
                    display: 'inline-flex',
                    marginInlineEnd: '4px',
                  }}
                >
                  <span className="pulse-ring" style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--accent-red)', opacity: 0.5 }} />
                  <span style={{ position: 'relative', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-red)', display: 'inline-block' }} />
                </span>
              )}
              {t(labelKey)}
            </Link>
          ))}
          <GlobeMenu />
          <LanguageToggle />
          {userTier === null && (
            <Link
              href="/login"
              className="header-link font-mono"
              style={{ fontSize: '10px', letterSpacing: '1.5px', border: '1px solid var(--border)', padding: '4px 10px', borderRadius: 2 }}
            >
              {t('signIn')}
            </Link>
          )}
          {userTier && userTier !== undefined && (
            <>
              <span
                className="font-mono"
                style={{
                  fontSize: '9px',
                  letterSpacing: '1.5px',
                  border: '1px solid',
                  padding: '4px 8px',
                  borderRadius: 2,
                  ...(userTier === 'professional' ? { borderColor: '#E8C547', color: '#E8C547' } : userTier === 'informed' ? { borderColor: '#1E90FF', color: '#1E90FF' } : { borderColor: '#4A5568', color: '#4A5568' }),
                }}
              >
                {userTier === 'professional'
                  ? `◆ ${t('proLabel')}`
                  : userTier === 'informed'
                    ? t('informedLabel')
                    : t('freeLabel')}
              </span>
              <Link href="/account" className="header-link" style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '10px' }}>
                {t('account')}
              </Link>
            </>
          )}
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

      {/* Mobile dropdown */}
      {menuOpen && (
        <nav
          style={{
            borderTop: '1px solid var(--border)',
            padding: '12px 24px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            background: 'rgba(7,10,15,0.96)',
          }}
        >
          {NAV_LINKS.map(({ href, labelKey, isWarRoom }) => (
            <Link
              key={href}
              href={href}
              className="header-link"
              onClick={() => setMenuOpen(false)}
              style={{
                fontSize: '11px',
                color: isWarRoom ? 'var(--accent-red)' : pathname === href ? 'var(--accent-gold)' : undefined,
              }}
            >
              {t(labelKey)}
            </Link>
          ))}
          <GlobeMenu />
          <div className="py-1">
            <LanguageToggle />
          </div>
          {userTier === null && (
            <Link href="/login" onClick={() => setMenuOpen(false)} className="header-link" style={{ fontSize: '11px' }}>
              {t('signIn')}
            </Link>
          )}
          {userTier && userTier !== undefined && (
            <>
              <span
                className="font-mono"
                style={{
                  fontSize: '10px',
                  ...(userTier === 'professional' ? { color: '#E8C547' } : userTier === 'informed' ? { color: '#1E90FF' } : { color: '#4A5568' }),
                }}
              >
                {userTier === 'professional'
                  ? `◆ ${t('proLabel')}`
                  : userTier === 'informed'
                    ? t('informedLabel')
                    : t('freeLabel')}
              </span>
              <Link href="/account" onClick={() => setMenuOpen(false)} className="header-link" style={{ fontSize: '11px' }}>
                {t('account')}
              </Link>
            </>
          )}
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
