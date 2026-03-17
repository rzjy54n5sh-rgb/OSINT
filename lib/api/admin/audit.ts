import { adminFetch } from '@/lib/api/admin/client';
import type { AuditFilters, AuditLogResponse } from '@/types';

export async function getAuditLog(
  filters: AuditFilters,
  token: string
): Promise<AuditLogResponse> {
  return adminFetch<AuditLogResponse>('admin-audit-log', {
    token,
    params: filters as Record<string, string | number | undefined>,
  });
}
