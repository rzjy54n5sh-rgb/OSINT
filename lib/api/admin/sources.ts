import { adminFetch } from '@/lib/api/admin/client';
import type {
  ArticleSource,
  SourceFilters,
  SourceListResponse,
  FeedTestResult,
} from '@/types';

export async function listSources(
  filters: SourceFilters,
  token: string
): Promise<SourceListResponse> {
  return adminFetch<SourceListResponse>('admin-sources-list', {
    token,
    params: filters as Record<string, string | number | undefined>,
  });
}

export async function addSource(
  source: Partial<ArticleSource>,
  token: string
): Promise<ArticleSource> {
  return adminFetch<ArticleSource>('admin-sources-add', {
    method: 'POST',
    token,
    body: source,
  });
}

export async function editSource(
  sourceId: string,
  updates: Partial<ArticleSource>,
  token: string
): Promise<void> {
  await adminFetch('admin-sources-edit', {
    method: 'PATCH',
    token,
    body: { sourceId, updates },
  });
}

export async function toggleSource(
  sourceId: string,
  active: boolean,
  token: string
): Promise<void> {
  await adminFetch('admin-sources-toggle', {
    method: 'PATCH',
    token,
    body: { sourceId, active },
  });
}

export async function deleteSource(
  sourceId: string,
  token: string
): Promise<void> {
  await adminFetch('admin-sources-delete', {
    method: 'DELETE',
    token,
    params: { sourceId },
  });
}

export async function testFeedUrl(
  rssUrl: string,
  useProxy: boolean,
  token: string
): Promise<FeedTestResult> {
  return adminFetch<FeedTestResult>('admin-sources-test-feed', {
    method: 'POST',
    token,
    body: { rssUrl, useProxy },
  });
}
