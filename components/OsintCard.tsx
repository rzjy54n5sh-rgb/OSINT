'use client';

import { ReactNode } from 'react';

type OsintCardProps = {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
};

export function OsintCard({ children, className = '', style }: OsintCardProps) {
  return <div className={`osint-card p-5 ${className}`} style={style}>{children}</div>;
}
