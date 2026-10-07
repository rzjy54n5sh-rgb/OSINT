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

validateEnv();

/** Resolves relative OG/Twitter image URLs; silences Next.js metadataBase build warnings. */
const metadataBaseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://mena-intel-desk.com';

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

export const metadata: Metadata = {
  metadataBase: new URL(metadataBaseUrl),
  title: 'MENA Intel Desk — US-Iran Conflict Intelligence',
  description: 'Real-time OSINT platform tracking the US-Iran conflict. Narrative Alignment Index, scenario probabilities, disinformation tracker, and live intelligence feed across 29 countries.',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Intel Desk',
  },
  icons: {
    apple: '/icons/icon-192.png',
    icon: '/icons/icon-192.png',
  },
  openGraph: {
    title: 'MENA Intel Desk — US-Iran Conflict Intelligence',
    description: 'Real-time OSINT platform tracking the US-Iran conflict. Narrative Alignment Index, scenario probabilities, disinformation tracker, and live intelligence feed across 29 countries.',
    url: 'https://mena-intel-desk.com',
    siteName: 'MENA Intel Desk',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'MENA Intel Desk — OSINT Intelligence Platform',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'MENA Intel Desk — US-Iran Conflict Intelligence',
    description: 'Real-time OSINT platform tracking the US-Iran conflict. NAI scores, scenario probabilities, live intel feed across 29 countries.',
    images: ['/og-image.png'],
  },
};

/**
 * Applies the `lang` cookie (set by LanguageToggle) to <html lang/dir> before first paint, and
 * the TranslationBanner dismissal flag (localStorage).
 * The layout deliberately does NOT read cookies on the server: a cookie read makes every route
 * dynamic (`private, no-store`), which is what kept every page from being cached. The server
 * HTML is always the English/LTR document; this runs before paint and I18nProvider switches the
 * UI strings after hydration.
 */
const LANG_BOOT_SCRIPT =
  "try{var d=document.documentElement;if(/(?:^|; )lang=ar(?:;|$)/.test(document.cookie)){d.lang='ar';d.dir='rtl';}" +
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
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
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
