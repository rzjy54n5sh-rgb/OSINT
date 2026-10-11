import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

/** Route metadata for a client-component page (a 'use client' page cannot export metadata). */
export const metadata: Metadata = pageMetadata({
  title: 'Choose a New Password — MENA Intel Desk',
  description:
    'Set a new password for your account.',
  path: '/reset-password',
  noindex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
