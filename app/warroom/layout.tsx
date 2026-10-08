import { pageMetadata } from '@/lib/site';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The page is a client component (no segment config there), so this layout sets it. Without it
// /warroom is fully static and Next sends `s-maxage=31536000`: Workers Cache then kept a previous
// build's HTML (pointing at deleted /_next/static chunks) for up to a year (incident 2026-10-08).
// 300 s matches the client router's stale time and the other live views.
export const revalidate = 300;

// The War Room page is a client component, so its metadata lives here.
export const metadata: Metadata = pageMetadata({
  title: 'War Room — Unified Intelligence View — MENA Intel Desk',
  description:
    'Live feed, War Posture, scenario probabilities, market indicators and fact-checks on one screen; each section shows the day its data belongs to.',
  path: '/warroom',
});

export default function WarRoomLayout({ children }: { children: ReactNode }) {
  return children;
}
