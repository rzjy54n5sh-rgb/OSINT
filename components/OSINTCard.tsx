'use client';

import { ReactNode } from 'react';

type OsintCardProps = {
  children: ReactNode;
  className?: string;
};

export function OsintCard({ children, className = '' }: OsintCardProps) {
  return <div className={`osint-card p-5 ${className}`}>{children}</div>;
}
