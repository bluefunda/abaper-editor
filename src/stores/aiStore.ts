import { create } from 'zustand';
import type { AIMessage, ReviewFinding, S4RemediationResult, MCPToolInfo } from '../types/mcp';

export interface ToolExecution {
  toolName: string;
  status: string;
  durationMs: number;
  resultSummary: string;
  iteration: number;
}

export interface ArtifactEvent {
  artifactName: string;
  artifactType: string;
  action: string;
  success: boolean;
  message: string;
}

interface AIState {
  messages: AIMessage[];
  isAnalyzing: boolean;
  abortController: AbortController | null;
  lastReviewResult: ReviewFinding[] | null;
  lastS4Result: S4RemediationResult | null;
  mcpTools: MCPToolInfo[];
  mcpConnected: boolean;
  chatId: string | null;
  isStreaming: boolean;
  streamingContent: string;
  selectedModel: string;
  toolExecutions: ToolExecution[];
  artifacts: ArtifactEvent[];

  addMessage: (message: Omit<AIMessage, 'id' | 'timestamp'>) => string;
  clearMessages: () => void;
  setAnalyzing: (analyzing: boolean) => void;
  cancelAnalysis: () => void;
  getAbortSignal: () => AbortSignal;
  setReviewResult: (result: ReviewFinding[] | null) => void;
  setS4Result: (result: S4RemediationResult | null) => void;
  setMcpTools: (tools: MCPToolInfo[]) => void;
  setMcpConnected: (connected: boolean) => void;
  setChatId: (id: string | null) => void;
  setStreaming: (streaming: boolean) => void;
  setSelectedModel: (model: string) => void;
  appendStreamContent: (chunk: string) => void;
  resetStreamContent: () => void;
  updateLastMessage: (content: string) => void;
  processStreamChunk: (chunk: string) => void;
  addToolExecution: (exec: ToolExecution) => void;
  addArtifact: (artifact: ArtifactEvent) => void;
  resetAgentState: () => void;
}

export const useAIStore = create<AIState>()((set, get) => ({
  messages: [],
  isAnalyzing: false,
  abortController: null,
  lastReviewResult: null,
  lastS4Result: null,
  mcpTools: [],
  mcpConnected: false,
  chatId: null,
  isStreaming: false,
  streamingContent: '',
  selectedModel: 'gemini',
  toolExecutions: [],
  artifacts: [],

  addMessage: (msg) => {
    const id = crypto.randomUUID();
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id, timestamp: Date.now() },
      ],
    }));
    return id;
  },

  clearMessages: () =>
    set({ messages: [], lastReviewResult: null, lastS4Result: null, chatId: null, streamingContent: '' }),

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

  setMcpTools: (tools) => set({ mcpTools: tools }),

  setMcpConnected: (connected) => set({ mcpConnected: connected }),

  setChatId: (id) => set({ chatId: id }),

  setStreaming: (streaming) => set({ isStreaming: streaming }),

  setSelectedModel: (model) => set({ selectedModel: model }),

  appendStreamContent: (chunk) =>
    set((s) => ({ streamingContent: s.streamingContent + chunk })),

  resetStreamContent: () => set({ streamingContent: '' }),

  updateLastMessage: (content) =>
    set((s) => {
      const msgs = [...s.messages];
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1]!;
        msgs[msgs.length - 1] = { ...last, content };
      }
      return { messages: msgs };
    }),

  processStreamChunk: (chunk) =>
    set((s) => {
      const newContent = s.streamingContent + chunk;
      const msgs = [...s.messages];
      if (msgs.length > 0) {
        const last = msgs[msgs.length - 1]!;
        msgs[msgs.length - 1] = { ...last, content: newContent };
      }
      return { streamingContent: newContent, messages: msgs };
    }),

  addToolExecution: (exec) =>
    set((s) => ({ toolExecutions: [...s.toolExecutions, exec] })),

  addArtifact: (artifact) =>
    set((s) => ({ artifacts: [...s.artifacts, artifact] })),

  resetAgentState: () =>
    set({ toolExecutions: [], artifacts: [] }),
}));
