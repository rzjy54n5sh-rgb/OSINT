import type { Metadata, Viewport } from 'next';
import { Bebas_Neue, IBM_Plex_Mono, DM_Sans } from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import { BackgroundCanvas } from '@/components/BackgroundCanvas';
import { CommandHeader } from '@/components/CommandHeader';

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
  title: 'MENA Intel Desk',
  description: 'OSINT Intelligence Platform — MENA Region Conflict Tracker',
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
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${ibmPlexMono.variable} ${dmSans.variable}`}>
      <head>
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-touch-fullscreen" content="yes" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <link rel="apple-touch-icon" sizes="512x512" href="/icons/icon-512.png" />
      </head>
      <body className={`min-h-screen overflow-x-hidden ${dmSans.className}`}>
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
