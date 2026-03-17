import { adminFetch } from '@/lib/api/admin/client';
import type {
  UserTier,
  UserListResponse,
  UserDetailResponse,
  UserFilters,
} from '@/types';

export async function listUsers(
  filters: UserFilters,
  token: string
): Promise<UserListResponse> {
  return adminFetch<UserListResponse>('admin-users-list', {
    token,
    params: filters as Record<string, string | number | undefined>,
  });
}

export async function getUserDetail(
  userId: string,
  token: string
): Promise<UserDetailResponse> {
  return adminFetch<UserDetailResponse>('admin-users-detail', {
    token,
    params: { userId },
  });
}

export async function setUserTier(
  userId: string,
  tier: UserTier,
  token: string
): Promise<void> {
  await adminFetch('admin-users-set-tier', {
    method: 'PATCH',
    token,
    body: { userId, tier },
  });
}

export async function suspendUser(
  userId: string,
  reason: string,
  token: string
): Promise<void> {
  await adminFetch('admin-users-suspend', {
    method: 'POST',
    token,
    body: { userId, reason },
  });
}

export async function unsuspendUser(
  userId: string,
  token: string
): Promise<void> {
  await adminFetch('admin-users-unsuspend', {
    method: 'POST',
    token,
    body: { userId },
  });
}
