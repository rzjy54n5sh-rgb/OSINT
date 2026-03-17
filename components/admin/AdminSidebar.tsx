'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { PAGE_PERMISSIONS, canAccess } from '@/lib/admin/permissions';
import type { AdminRole } from '@/types';

type NavSection = { label: string; pages: { page: string; href: string; icon: string; label: string }[] };

const SECTIONS: NavSection[] = [
  {
    label: 'Overview',
    pages: [
      { page: 'dashboard', href: '/admin', icon: '◈', label: 'Dashboard' },
      { page: 'feed', href: '/admin/feed', icon: '◎', label: 'Live Feed' },
      { page: 'alerts', href: '/admin/alerts', icon: '◉', label: 'Alerts & Banners' },
    ],
  },
  {
    label: 'Intelligence',
    pages: [
      { page: 'pipeline', href: '/admin/pipeline', icon: '▣', label: 'Pipeline' },
      { page: 'nai', href: '/admin/nai', icon: '▣', label: 'NAI Scores' },
      { page: 'reports', href: '/admin/reports', icon: '▣', label: 'Country Reports' },
      { page: 'sources', href: '/admin/sources', icon: '▣', label: 'RSS Sources' },
      { page: 'admins', href: '/admin/admins', icon: '▣', label: 'Admin Users' },
    ],
  },
  {
    label: 'Users & Access',
    pages: [
      { page: 'users', href: '/admin/users', icon: '▣', label: 'Platform Users' },
      { page: 'subscriptions', href: '/admin/subscriptions', icon: '▣', label: 'Subscriptions' },
      { page: 'api-keys', href: '/admin/api-keys', icon: '▣', label: 'API Keys' },
      { page: 'disputes', href: '/admin/disputes', icon: '▣', label: 'Disputes' },
    ],
  },
  {
    label: 'Revenue & System',
    pages: [
      { page: 'payments', href: '/admin/payments', icon: '▣', label: 'Payments' },
      { page: 'pricing', href: '/admin/pricing', icon: '▣', label: 'Pricing Config' },
      { page: 'tier-features', href: '/admin/tier-features', icon: '▣', label: 'Tier Features' },
      { page: 'config', href: '/admin/config', icon: '▣', label: 'Platform Config' },
      { page: 'audit', href: '/admin/audit', icon: '▣', label: 'Audit Log' },
    ],
  },
];

type AdminSidebarProps = {
  role: AdminRole;
  /** Optional counts for badge (e.g. open disputes, failing sources) */
  disputeCount?: number;
  failingSourcesCount?: number;
};

export function AdminSidebar({ role, disputeCount = 0, failingSourcesCount = 0 }: AdminSidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className="w-56 flex-shrink-0 border-r flex flex-col"
      style={{
        borderColor: 'var(--border)',
        background: 'rgba(7,10,15,0.98)',
      }}
    >
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <Link href="/admin" className="flex items-center gap-2 no-underline">
          <span style={{ color: 'var(--accent-gold)', fontSize: '14px' }}>◆</span>
          <span className="font-mono text-xs uppercase" style={{ color: 'var(--text-primary)', letterSpacing: '1px' }}>
            Admin
          </span>
        </Link>
      </div>
      <nav className="flex-1 overflow-y-auto p-2">
        {SECTIONS.map((section) => {
          const visiblePages = section.pages.filter((p) => canAccess(p.page, role));
          if (visiblePages.length === 0) return null;
          return (
            <div key={section.label} className="mb-6">
              <p
                className="font-mono text-[10px] uppercase px-3 py-1 mb-1"
                style={{ color: 'var(--text-muted)', letterSpacing: '1.5px' }}
              >
                {section.label}
              </p>
              <ul className="space-y-0.5">
                {visiblePages.map(({ page, href, icon, label }) => {
                  const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href));
                  const badge =
                    (page === 'disputes' && disputeCount > 0) || (page === 'sources' && failingSourcesCount > 0)
                      ? page === 'disputes'
                        ? disputeCount
                        : failingSourcesCount
                      : null;
                  return (
                    <li key={page}>
                      <Link
                        href={href}
                        className="flex items-center gap-2 font-mono text-xs py-2 px-3 rounded-sm no-underline block"
                        style={{
                          color: isActive ? 'var(--accent-gold)' : 'var(--text-secondary)',
                          borderLeft: isActive ? '3px solid var(--accent-gold)' : '3px solid transparent',
                          background: isActive ? 'rgba(232,197,71,0.08)' : 'transparent',
                        }}
                      >
                        <span style={{ opacity: 0.9 }}>{icon}</span>
                        <span className="flex-1">{label}</span>
                        {badge != null && badge > 0 && (
                          <span
                            className="min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-mono"
                            style={{ background: 'var(--accent-red)', color: '#fff' }}
                          >
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>
    </aside>
  );
}
