import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The War Room page is a client component, so its metadata lives here.
export const metadata: Metadata = {
  title: 'War Room — Unified Intelligence View — MENA Intel Desk',
  description:
    'Live feed, War Posture, scenario probabilities, market indicators and fact-checks on one screen; each section shows the day its data belongs to.',
};

export default function WarRoomLayout({ children }: { children: ReactNode }) {
  return children;
}
