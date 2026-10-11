import type { Metadata } from 'next';
import { pageMetadata } from '@/lib/site';

/** Route metadata for a client-component page (a 'use client' page cannot export metadata). */
export const metadata: Metadata = pageMetadata({
  title: 'Reset Password — MENA Intel Desk',
  description:
    'Request a password reset link.',
  path: '/forgot-password',
  noindex: true,
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
