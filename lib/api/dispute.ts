import { apiFetch } from '@/lib/api/client';

export async function submitDispute(payload: {
  article_id: string;
  article_url?: string;
  claim_text: string;
  source_url: string;
}): Promise<{ success: boolean; disputeId: string }> {
  return apiFetch<{ success: boolean; disputeId: string }>('api-dispute', {
    method: 'POST',
    body: payload,
  });
}
