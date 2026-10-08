import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, IBM_Plex_Mono, DM_Sans, Noto_Sans_Arabic } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { validateEnv } from '@/lib/env';
import { BackgroundCanvasLazy } from '@/components/BackgroundCanvasLazy';
import { CommandHeader } from '@/components/CommandHeader';
import { TranslationBanner } from '@/components/TranslationBanner';
import { I18nProvider } from '@/components/I18nProvider';
import { SiteFooter } from '@/components/SiteFooter';
import type { Lang } from '@/lib/i18n';
import {
  INJECTED_NEXT_PUBLIC_GLOBAL,
  type InjectedNextPublicRuntime,
} from '@/lib/env/injected-next-public';
import {
  NEXT_PUBLIC_SUPABASE_URL as GEN_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY as GEN_SUPABASE_ANON_KEY,
} from '@/lib/supabase/env.client.generated';
import { STALE_BUILD_RECOVERY_SCRIPT } from '@/lib/stale-build-recovery';
import {
  ARABIC_ENABLED,
  SITE_DESCRIPTION,
  SITE_DESCRIPTOR,
  SITE_NAME,
  SITE_URL,
  RSS_ALTERNATE,
  pageMetadata,
} from '@/lib/site';

validateEnv();

/**
 * Upper bound on how long ANY cached page HTML may live (seconds). The lowest `revalidate` across
 * a route's layouts and page wins, so pages with their own lower value (300, 600, 900) keep it;
 * pages with NO `revalidate` (fully static, e.g. /warroom, /contact, /login, /mediaroom) would
 * otherwise get Next's default `s-maxage=31536000` (one year), and their HTML embeds this
 * build's /_next/static chunk URLs. Incident 2026-10-08: Workers Cache kept serving /warroom
 * HTML from the previous deploy whose chunks no longer existed. Capping it means cached HTML can
 * never outlive a build by more than this, even if a post-deploy purge is missed.
 * Dynamic routes (cookies, no-store) are unaffected.
 */
export const revalidate = 900;

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const ibmPlexMono = IBM_Plex_Mono({ weight: ['300', '400', '500', '600'], subsets: ['latin'], variable: '--font-mono' });
const dmSans = DM_Sans({ weight: ['300', '400', '500'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-dm' });
const notoArabic = Noto_Sans_Arabic({ weight: ['400', '500', '600'], subsets: ['arabic'], variable: '--font-arabic' });

export const viewport: Viewport = {
  themeColor: '#070A0F',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
};

/**
 * Site-wide defaults. Every public route overrides title/description/openGraph/twitter through
 * `pageMetadata()` (lib/site.ts) so link previews are per-route. metadataBase comes from
 * NEXT_PUBLIC_SITE_URL and defaults to the live workers.dev origin (mena-intel-desk.com does not
 * resolve — never point og:url or canonical at it).
 */
const ROOT_DEFAULTS = pageMetadata({
  title: `${SITE_NAME} — ${SITE_DESCRIPTOR}`,
  description: SITE_DESCRIPTION,
  path: '/',
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  ...ROOT_DEFAULTS,
  // Inherited only by routes without their own metadata: no og:url / canonical here, so such a
  // route never claims to be the home page.
  openGraph: { ...ROOT_DEFAULTS.openGraph, url: undefined },
  applicationName: SITE_NAME,
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Intel Desk',
  },
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '16x16 32x32 48x48' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [{ url: '/apple-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  alternates: { types: RSS_ALTERNATE },
};

/**
 * Applies the `lang` cookie (set by LanguageToggle) to <html lang/dir> before first paint, and
 * the TranslationBanner dismissal flag (localStorage).
 * The layout deliberately does NOT read cookies on the server: a cookie read makes every route
 * dynamic (`private, no-store`), which is what kept every page from being cached. The server
 * HTML is always the English/LTR document; this runs before paint and I18nProvider switches the
 * UI strings after hydration. While the Arabic UI is switched off (NEXT_PUBLIC_ENABLE_AR unset),
 * a stale `lang=ar` cookie is ignored and the page stays English/LTR.
 */
const LANG_BOOT_SCRIPT =
  'try{var d=document.documentElement;' +
  (ARABIC_ENABLED ? "if(/(?:^|; )lang=ar(?:;|$)/.test(document.cookie)){d.lang='ar';d.dir='rtl';}" : '') +
  // Hide an already-dismissed TranslationBanner before paint (no layout shift when it unmounts).
  "if(localStorage.getItem('mena-translation-dismissed'))d.setAttribute('data-tb-dismissed','');}catch(e){}";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  // Server-rendered default. The visitor's language preference is applied client-side (above);
  // suppressHydrationWarning on <html>/<body> covers the lang/dir/class attributes that the boot
  // script and I18nProvider change (attributes of those two elements only, not their children).
  const lang: Lang = 'en';

  /**
   * Prefer Worker `process.env`, fall back to build-inlined `env.client.generated.ts`
   * so the browser still gets keys if CF bindings are missing on this request.
   */
  const runtimeSupabaseUrl =
    (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim() ||
    (typeof GEN_SUPABASE_URL === 'string' ? GEN_SUPABASE_URL.trim() : '');
  const fromEnvAnon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();
  const fromEnvPub = (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '').trim();
  const fromGenAnon =
    typeof GEN_SUPABASE_ANON_KEY === 'string' ? GEN_SUPABASE_ANON_KEY.trim() : '';

  /** Property names must match GitHub/CF env names (see PROJECT.md). Same precedence as `resolve-public-env`. */
  const injectedRuntime: InjectedNextPublicRuntime = {
    NEXT_PUBLIC_SUPABASE_URL: runtimeSupabaseUrl,
    ...(fromEnvAnon
      ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: fromEnvAnon }
      : !fromEnvPub && fromGenAnon
        ? { NEXT_PUBLIC_SUPABASE_ANON_KEY: fromGenAnon }
        : {}),
    ...(fromEnvPub ? { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: fromEnvPub } : {}),
  };

  const hasInjectableKey = Boolean(
    injectedRuntime.NEXT_PUBLIC_SUPABASE_ANON_KEY || injectedRuntime.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  );

  return (
    <html
      lang={lang}
      dir="ltr"
      translate="yes"
      suppressHydrationWarning
      className={`${bebas.variable} ${ibmPlexMono.variable} ${dmSans.variable} ${notoArabic.variable}`}
    >
      <head>
        {/* First script in <head>: recovers from cached HTML whose build assets are gone. */}
        <script dangerouslySetInnerHTML={{ __html: STALE_BUILD_RECOVERY_SCRIPT }} />
        <script dangerouslySetInnerHTML={{ __html: LANG_BOOT_SCRIPT }} />
        {runtimeSupabaseUrl && hasInjectableKey ? (
          <script
            // Same values as NEXT_PUBLIC_* env vars; keys on the object = exact env names.
            dangerouslySetInnerHTML={{
              __html: `window[${JSON.stringify(INJECTED_NEXT_PUBLIC_GLOBAL)}]=${JSON.stringify(injectedRuntime)};`,
            }}
          />
        ) : null}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        {process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN && (
          <script
            defer
            data-domain={process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN}
            src="https://plausible.io/js/script.js"
          />
        )}
      </head>
      <body
        className={`min-h-screen overflow-x-hidden ${dmSans.className}`}
        suppressHydrationWarning
      >
        <TranslationBanner />
        <BackgroundCanvasLazy />
        <I18nProvider lang={lang}>
          <div className="relative flex min-h-screen flex-col" style={{ zIndex: 1 }}>
            <CommandHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </div>
        </I18nProvider>
        {/* Register service worker */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            // afterInteractive often runs after 'load' has fired: register now in that case.
            var registerSw = function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); };
            if (document.readyState === 'complete') registerSw();
            else window.addEventListener('load', registerSw, { once: true });
          }
        `}</Script>
      </body>
    </html>
  );
}
