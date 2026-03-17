import { create } from 'zustand';
import { sendAgentMessage, confirmAgentAction } from '@/lib/api/admin/agent';
import type { AgentMessage, AgentPendingAction } from '@/types';

type AgentState = {
  conversationHistory: AgentMessage[];
  isOpen: boolean;
  currentPage: string;
  isLoading: boolean;
  pendingAction: AgentPendingAction | null;
};

type AgentActions = {
  togglePanel: () => void;
  setCurrentPage: (page: string) => void;
  sendMessage: (message: string, token: string) => Promise<void>;
  confirmPendingAction: (token: string) => Promise<void>;
  cancelPendingAction: () => void;
  clearConversation: () => void;
};

export const useAgentStore = create<AgentState & AgentActions>((set, get) => ({
  conversationHistory: [],
  isOpen: false,
  currentPage: 'dashboard',
  isLoading: false,
  pendingAction: null,

  togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),

  setCurrentPage: (page: string) => set({ currentPage: page }),

  sendMessage: async (message: string, token: string) => {
    const { conversationHistory, currentPage } = get();
    set({ isLoading: true, pendingAction: null });
    const userMsg: AgentMessage = { role: 'user', content: message, timestamp: new Date() };
    set((s) => ({ conversationHistory: [...s.conversationHistory, userMsg] }));
    try {
      const historyForApi = conversationHistory.map((m) => ({ role: m.role, content: m.content }));
      const res = await sendAgentMessage(message, historyForApi as AgentMessage[], currentPage, token);
      const responseText = (res as { response?: string }).response ?? '';
      const assistantMsg: AgentMessage = { role: 'assistant', content: responseText, timestamp: new Date() };
      set((s) => ({ conversationHistory: [...s.conversationHistory, assistantMsg] }));
      const hasConfirm = /Confirm\s*\?/i.test(responseText);
      if (hasConfirm) {
        const lastUser = [...conversationHistory, userMsg].filter((m) => m.role === 'user').pop();
        set({
          pendingAction: {
            actionType: 'AI_PROPOSAL',
            actionData: { proposal: responseText },
            aiProposal: responseText,
            aiPrompt: lastUser?.content ?? message,
          },
        });
      }
    } catch {
      set((s) => ({
        conversationHistory: [
          ...s.conversationHistory,
          { role: 'assistant', content: 'Failed to get response.', timestamp: new Date() },
        ],
      }));
    } finally {
      set({ isLoading: false });
    }
  },

  confirmPendingAction: async (token: string) => {
    const { pendingAction, conversationHistory } = get();
    if (!pendingAction) return;
    try {
      await confirmAgentAction(pendingAction, token);
      set((s) => ({
        conversationHistory: [
          ...s.conversationHistory,
          { role: 'assistant', content: 'Action confirmed and logged.', timestamp: new Date() },
        ],
        pendingAction: null,
      }));
    } catch {
      set((s) => ({
        conversationHistory: [
          ...s.conversationHistory,
          { role: 'assistant', content: 'Confirmation failed.', timestamp: new Date() },
        ],
        pendingAction: null,
      }));
    }
  },

  cancelPendingAction: () => {
    set((s) => ({
      pendingAction: null,
      conversationHistory: [
        ...s.conversationHistory,
        { role: 'assistant', content: 'Action cancelled.', timestamp: new Date() },
      ],
    }));
  },

  clearConversation: () => set({ conversationHistory: [], pendingAction: null }),
}));
