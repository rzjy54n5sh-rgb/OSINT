import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

/** Route metadata for a client-component page (a 'use client' page cannot export metadata). */
export const metadata: Metadata = pageMetadata({
  title: 'Contact — Company Access, Media & Corrections — MENA Intel Desk',
  description:
    'Ask about Chokepoint Weekly for companies, media and research requests, or report a data correction. Every message is reviewed by the platform operator.',
  path: '/contact',
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
