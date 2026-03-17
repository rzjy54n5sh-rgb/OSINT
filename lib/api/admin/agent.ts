import { adminFetch } from '@/lib/api/admin/client';
import type { AgentMessage, AgentPendingAction, AdminRole } from '@/types';

export async function sendAgentMessage(
  message: string,
  conversationHistory: AgentMessage[],
  currentPage: string,
  token: string
): Promise<{
  response: string;
  role: AdminRole;
  capabilities: string[];
}> {
  return adminFetch('admin-agent', {
    method: 'POST',
    token,
    body: { message, conversationHistory, currentPage },
  });
}

export async function confirmAgentAction(
  confirmedAction: AgentPendingAction,
  token: string
): Promise<void> {
  await adminFetch('admin-agent', {
    method: 'POST',
    token,
    body: { confirmedAction },
  });
}
