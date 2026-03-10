import type { Metadata } from 'next';
import { Bebas_Neue, IBM_Plex_Mono, DM_Sans } from 'next/font/google';
import './globals.css';
import { BackgroundCanvas } from '@/components/BackgroundCanvas';
import { CommandHeader } from '@/components/CommandHeader';

const bebas = Bebas_Neue({ weight: '400', subsets: ['latin'], variable: '--font-bebas' });
const ibmPlexMono = IBM_Plex_Mono({ weight: ['300', '400', '500', '600'], subsets: ['latin'], variable: '--font-mono' });
const dmSans = DM_Sans({ weight: ['300', '400', '500'], style: ['normal', 'italic'], subsets: ['latin'], variable: '--font-dm' });

export const metadata: Metadata = {
  title: 'MENA Intel Desk',
  description: 'OSINT Intelligence Platform — MENA Region Conflict Tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bebas.variable} ${ibmPlexMono.variable} ${dmSans.variable}`}>
      <body className={`min-h-screen overflow-x-hidden ${dmSans.className}`}>
        <BackgroundCanvas />
        <div className="relative flex min-h-screen flex-col" style={{ zIndex: 1 }}>
          <CommandHeader />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
