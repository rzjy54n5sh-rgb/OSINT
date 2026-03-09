import type { Metadata } from 'next';
import { Inter, Space_Grotesk, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';
import { CommandHeader } from '@/components/CommandHeader';
import { BackgroundCanvas } from '@/components/BackgroundCanvas';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['300', '400', '500', '600'],
});

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  variable: '--font-space-grotesk',
  weight: ['600', '700'],
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  variable: '--font-plex-mono',
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'MENA Intel Desk',
  description: 'OSINT conflict intelligence dashboard',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${spaceGrotesk.variable} ${ibmPlexMono.variable}`}
    >
      <body className="min-h-screen overflow-x-hidden">
        <BackgroundCanvas />
        <div className="relative z-10 flex min-h-screen flex-col">
          <CommandHeader />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
