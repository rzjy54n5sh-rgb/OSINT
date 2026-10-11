import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

/** Route metadata for a client-component page (a 'use client' page cannot export metadata). */
export const metadata: Metadata = pageMetadata({
  title: 'Media Room — Live Coverage Monitor — MENA Intel Desk',
  description:
    'Live streams from international broadcasters across editorial perspectives, plus photo-wire and video clips from RSS feeds, each embedded from its original source.',
  path: '/mediaroom',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
