import { create } from 'zustand';
import * as monaco from 'monaco-editor';
import type { TabState, DiagnosticItem, ABAPObjectType } from '../types/editor';

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
