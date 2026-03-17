import type { AdminRole } from '@/types';

/**
 * Same PAGE_PERMISSIONS as in supabase/functions/_shared/admin-middleware.ts.
 * Used by AdminSidebar to show/hide nav items by role.
 */
export const PAGE_PERMISSIONS: Record<string, AdminRole[]> = {
  dashboard: ['SUPER_ADMIN', 'INTEL_ANALYST', 'USER_MANAGER', 'FINANCE_MANAGER', 'CONTENT_REVIEWER'],
  feed: ['SUPER_ADMIN', 'INTEL_ANALYST', 'CONTENT_REVIEWER'],
  alerts: ['SUPER_ADMIN', 'INTEL_ANALYST'],
  pipeline: ['SUPER_ADMIN', 'INTEL_ANALYST'],
  nai: ['SUPER_ADMIN', 'INTEL_ANALYST'],
  reports: ['SUPER_ADMIN', 'INTEL_ANALYST', 'CONTENT_REVIEWER'],
  sources: ['SUPER_ADMIN', 'INTEL_ANALYST'],
  admins: ['SUPER_ADMIN'],
  users: ['SUPER_ADMIN', 'USER_MANAGER'],
  subscriptions: ['SUPER_ADMIN', 'USER_MANAGER', 'FINANCE_MANAGER'],
  'api-keys': ['SUPER_ADMIN', 'USER_MANAGER'],
  disputes: ['SUPER_ADMIN', 'USER_MANAGER'],
  payments: ['SUPER_ADMIN', 'FINANCE_MANAGER'],
  pricing: ['SUPER_ADMIN', 'FINANCE_MANAGER'],
  'tier-features': ['SUPER_ADMIN'],
  config: ['SUPER_ADMIN'],
  audit: ['SUPER_ADMIN', 'INTEL_ANALYST', 'USER_MANAGER', 'FINANCE_MANAGER', 'CONTENT_REVIEWER'],
};

export function canAccess(page: string, role: AdminRole): boolean {
  const roles = PAGE_PERMISSIONS[page];
  if (!roles) return false;
  return roles.includes(role);
}
