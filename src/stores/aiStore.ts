import { create } from 'zustand';
import type { AIMessage, ReviewFinding, S4RemediationResult } from '../types/mcp';

interface AIState {
  messages: AIMessage[];
  isAnalyzing: boolean;
  abortController: AbortController | null;
  lastReviewResult: ReviewFinding[] | null;
  lastS4Result: S4RemediationResult | null;

  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => void;
  clearMessages: () => void;
  setAnalyzing: (analyzing: boolean) => void;
  cancelAnalysis: () => void;
  getAbortSignal: () => AbortSignal;
  setReviewResult: (result: ReviewFinding[] | null) => void;
  setS4Result: (result: S4RemediationResult | null) => void;
}

export const useAIStore = create<AIState>()((set, get) => ({
  messages: [],
  isAnalyzing: false,
  abortController: null,
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

  setAnalyzing: (analyzing) => {
    if (analyzing) {
      const controller = new AbortController();
      set({ isAnalyzing: true, abortController: controller });
    } else {
      set({ isAnalyzing: false, abortController: null });
    }
  },

  cancelAnalysis: () => {
    const { abortController } = get();
    if (abortController) {
      abortController.abort();
    }
    set({ isAnalyzing: false, abortController: null });
  },

  getAbortSignal: () => {
    const { abortController } = get();
    return abortController?.signal ?? new AbortController().signal;
  },

  setReviewResult: (result) => set({ lastReviewResult: result }),

  setS4Result: (result) => set({ lastS4Result: result }),
}));
