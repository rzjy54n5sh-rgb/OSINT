import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

/** Route metadata for a client-component page (a 'use client' page cannot export metadata). */
export const metadata: Metadata = pageMetadata({
  title: 'Sign In — MENA Intel Desk',
  description:
    'Sign in or create a free MENA Intel Desk account.',
  path: '/login',
  noindex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
