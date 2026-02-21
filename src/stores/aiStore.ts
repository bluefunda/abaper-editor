import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AIMessage, ReviewFinding, S4RemediationResult } from '../types/mcp';

interface AIState {
  messages: AIMessage[];
  isAnalyzing: boolean;
  lastReviewResult: ReviewFinding[] | null;
  lastS4Result: S4RemediationResult | null;

  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setAnalyzing: (analyzing: boolean) => void;
  setReviewResult: (result: ReviewFinding[] | null) => void;
  setS4Result: (result: S4RemediationResult | null) => void;
}

export const useAIStore = create<AIState>()(
  persist(
    (set) => ({
      messages: [],
      isAnalyzing: false,
      lastReviewResult: null,
      lastS4Result: null,

      addMessage: (msg) =>
        set((s) => ({
          messages: [
            ...s.messages,
            { ...msg, id: crypto.randomUUID(), timestamp: Date.now() },
          ],
        })),

      clearMessages: () =>
        set({ messages: [], lastReviewResult: null, lastS4Result: null }),

      setAnalyzing: (analyzing) => set({ isAnalyzing: analyzing }),

      setReviewResult: (result) => set({ lastReviewResult: result }),

      setS4Result: (result) => set({ lastS4Result: result }),
    }),
    {
      name: 'abaper-ai',
      partialize: (state) => ({
        messages: state.messages.slice(-50), // keep last 50 messages
      }),
    },
  ),
);
