import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, IBM_Plex_Mono, DM_Sans } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { validateEnv } from '@/lib/env';
import { BackgroundCanvas } from '@/components/BackgroundCanvas';
import { CommandHeader } from '@/components/CommandHeader';
import { TranslationBanner } from '@/components/TranslationBanner';

validateEnv();

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const ibmPlexMono = IBM_Plex_Mono({ weight: ['300', '400', '500', '600'], subsets: ['latin'], variable: '--font-mono' });
const dmSans = DM_Sans({ weight: ['300', '400', '500'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-dm' });

export const viewport: Viewport = {
  themeColor: '#070A0F',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
  viewportFit: 'cover',
};

export const metadata: Metadata = {
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" translate="yes" className={`${bebas.variable} ${ibmPlexMono.variable} ${dmSans.variable}`}>
      <head>
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
      <body className={`min-h-screen overflow-x-hidden ${dmSans.className}`}>
        <TranslationBanner />
        <BackgroundCanvas />
        <div className="relative flex min-h-screen flex-col" style={{ zIndex: 1 }}>
          <CommandHeader />
          <main className="flex-1">{children}</main>
        </div>
        {/* Register service worker */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
              navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
          }
        `}</Script>
      </body>
    </html>
  );
}
