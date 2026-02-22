import { create } from 'zustand';
import * as monaco from 'monaco-editor';
import type { TabState, DiagnosticItem, ABAPObjectType } from '../types/editor';

const ADT_TYPE_MAP: Record<string, ABAPObjectType> = {
  'PROG': 'program', 'PROG/P': 'program',
  'CLAS': 'class', 'CLAS/OC': 'class',
  'INTF': 'interface', 'INTF/OI': 'interface',
  'FUGR': 'function', 'FUGR/F': 'function',
  'TABL': 'table', 'TABL/DT': 'table',
  'STRU': 'structure',
};

export function normalizeObjectType(type: string): ABAPObjectType {
  return ADT_TYPE_MAP[type.toUpperCase()] ?? ADT_TYPE_MAP[type.split('/')[0]?.toUpperCase() ?? ''] ?? 'program';
}

const EXTENSION_LANGUAGE_MAP: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'typescript',
  '.js': 'javascript', '.jsx': 'javascript',
  '.go': 'go',
  '.py': 'python',
  '.rs': 'rust',
  '.java': 'java',
  '.json': 'json',
  '.yaml': 'yaml', '.yml': 'yaml',
  '.xml': 'xml',
  '.html': 'html',
  '.css': 'css',
  '.scss': 'scss',
  '.md': 'markdown',
  '.sql': 'sql',
  '.sh': 'shell', '.bash': 'shell',
  '.dockerfile': 'dockerfile',
  '.abap': 'abap',
  '.toml': 'toml',
};

function inferLanguage(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower === 'dockerfile') return 'dockerfile';
  const dotIdx = lower.lastIndexOf('.');
  if (dotIdx === -1) return 'plaintext';
  return EXTENSION_LANGUAGE_MAP[lower.slice(dotIdx)] ?? 'plaintext';
}

function objectTypeToExtension(type: ABAPObjectType): string {
  switch (type) {
    case 'program': return '.prog.abap';
    case 'class': return '.clas.abap';
    case 'interface': return '.intf.abap';
    case 'function': return '.fugr.abap';
    case 'table': return '.tabl.abap';
    case 'structure': return '.stru.abap';
  }
}

interface EditorState {
  tabs: TabState[];
  activeTabId: string | null;
  diagnosticsMap: Record<string, DiagnosticItem[]>;
  outputLog: string[];

  openTab: (objectName: string, objectType: ABAPObjectType, source: string, etag: string, functionGroup?: string) => void;
  openReadOnlyTab: (name: string, content: string, language?: string) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  markDirty: (id: string, dirty: boolean) => void;
  setDiagnostics: (id: string, diagnostics: DiagnosticItem[]) => void;
  appendOutput: (line: string) => void;
  clearOutput: () => void;
  getActiveTab: () => TabState | undefined;
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  diagnosticsMap: {},
  outputLog: [],

  openTab: (objectName, objectType, source, etag, functionGroup) => {
    const existing = get().tabs.find(
      (t) => t.objectName === objectName && t.objectType === objectType,
    );
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const filename = objectName.toLowerCase() + objectTypeToExtension(objectType);
    const uri = monaco.Uri.parse(`inmemory://model/${filename}`);
    // Dispose any stale model with the same URI (e.g. after close+reopen)
    const staleModel = monaco.editor.getModel(uri);
    if (staleModel) staleModel.dispose();
    const model = monaco.editor.createModel(source, 'abap', uri);

    const id = `${objectType}:${objectName}`;
    const tab: TabState = {
      id,
      objectName,
      objectType,
      model,
      isDirty: false,
      etag,
      functionGroup,
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
  },

  openReadOnlyTab: (name, content, language) => {
    const id = `github:${name}`;
    const existing = get().tabs.find((t) => t.id === id);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const lang = language ?? inferLanguage(name);
    const uri = monaco.Uri.parse(`inmemory://github/${name}`);
    const model = monaco.editor.createModel(content, lang, uri);

    const tab: TabState = {
      id,
      objectName: name,
      objectType: 'program',
      model,
      isDirty: false,
      etag: '',
      readOnly: true,
      source: 'github',
    };

    set((state) => ({
      tabs: [...state.tabs, tab],
      activeTabId: id,
    }));
  },

  closeTab: (id) => {
    const state = get();
    const tab = state.tabs.find((t) => t.id === id);
    if (tab) {
      tab.model.dispose();
    }
    const remaining = state.tabs.filter((t) => t.id !== id);
    const newDiagnostics = { ...state.diagnosticsMap };
    delete newDiagnostics[id];

    let newActiveId = state.activeTabId;
    if (state.activeTabId === id) {
      const idx = state.tabs.findIndex((t) => t.id === id);
      newActiveId = remaining[Math.min(idx, remaining.length - 1)]?.id ?? null;
    }

    set({
      tabs: remaining,
      activeTabId: newActiveId,
      diagnosticsMap: newDiagnostics,
    });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  markDirty: (id, dirty) =>
    set((state) => ({
      tabs: state.tabs.map((t) => (t.id === id ? { ...t, isDirty: dirty } : t)),
    })),

  setDiagnostics: (id, diagnostics) =>
    set((state) => ({
      diagnosticsMap: { ...state.diagnosticsMap, [id]: diagnostics },
    })),

  appendOutput: (line) =>
    set((state) => ({ outputLog: [...state.outputLog, line] })),

  clearOutput: () => set({ outputLog: [] }),

  getActiveTab: () => {
    const state = get();
    return state.tabs.find((t) => t.id === state.activeTabId);
  },
}));
