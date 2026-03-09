import type { Metadata } from 'next';
import './globals.css';
import { BackgroundCanvas } from '@/components/BackgroundCanvas';
import { CommandHeader } from '@/components/CommandHeader';

export const metadata: Metadata = {
  title: 'MENA Intel Desk',
  description: 'OSINT Intelligence Platform — MENA Region Conflict Tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=IBM+Plex+Mono:wght@300;400;500;600&family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen overflow-x-hidden">
        <BackgroundCanvas />
        <div className="relative flex min-h-screen flex-col" style={{ zIndex: 1 }}>
          <CommandHeader />
          <main className="flex-1">{children}</main>
        </div>
      </body>
    </html>
  );
}
