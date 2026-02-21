import { useState, useEffect, useCallback, useRef } from 'react';
import { MenuBar } from './components/layout/MenuBar';
import { Sidebar } from './components/layout/Sidebar';
import { TabBar } from './components/layout/TabBar';
import { BottomPanel } from './components/layout/BottomPanel';
import { StatusBar } from './components/layout/StatusBar';
import { ABAPEditor } from './components/editor/ABAPEditor';
import { ExplorerPanel } from './components/panels/ExplorerPanel';
import { SearchPanel } from './components/panels/SearchPanel';
import { ProblemsPanel } from './components/panels/ProblemsPanel';
import { OutputPanel } from './components/panels/OutputPanel';
import { TranspilerPanel } from './components/panels/TranspilerPanel';
import { AIPanel } from './components/panels/AIPanel';
import { GitPanel } from './components/panels/GitPanel';
import { OpenObjectDialog } from './components/dialogs/OpenObjectDialog';
import { ConnectionDialog } from './components/dialogs/ConnectionDialog';
import { NewObjectDialog } from './components/dialogs/NewObjectDialog';
import { useSettingsStore } from './stores/settingsStore';
import { useEditorStore } from './stores/editorStore';
import { useConnectionStore } from './stores/connectionStore';
import { useAIStore } from './stores/aiStore';
import { useSAPConnection } from './hooks/useSAPConnection';
import { useAIAssistant } from './hooks/useAIAssistant';
import { saveObject, activateObject, syntaxCheck, getObject } from './services/api';
import { initMCP } from './services/mcp';
import type { ABAPObjectType } from './types/editor';

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const sidebarPanel = useSettingsStore((s) => s.sidebarPanel);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleBottomPanel = useSettingsStore((s) => s.toggleBottomPanel);
  const setBottomPanelTab = useSettingsStore((s) => s.setBottomPanelTab);

  const [openObjectDialogOpen, setOpenObjectDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [newObjectDialogOpen, setNewObjectDialogOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);

  const editorRef = useRef<{ revealLineInCenter: (line: number) => void; setPosition: (pos: { lineNumber: number; column: number }) => void } | null>(null);

  useSAPConnection();

  const { reviewCode, analyzeS4, explainCode, runTests, optimizeCode } = useAIAssistant();

  // Initialize MCP connection
  useEffect(() => {
    initMCP();
  }, []);

  const handleCursorChange = useCallback((line: number, column: number) => {
    setCursorLine(line);
    setCursorColumn(column);
  }, []);

  const handleSave = useCallback(async () => {
    const tab = useEditorStore.getState().getActiveTab();
    if (!tab) return;
    const source = tab.model.getValue();
    const appendOutput = useEditorStore.getState().appendOutput;
    const markDirty = useEditorStore.getState().markDirty;
    const activateOnSave = useConnectionStore.getState().activateOnSave;

    try {
      appendOutput(`Saving ${tab.objectName}...`);
      await saveObject(tab.objectName, tab.objectType, source, tab.etag);
      markDirty(tab.id, false);
      appendOutput(`Saved ${tab.objectName}`);

      if (activateOnSave) {
        appendOutput(`Activating ${tab.objectName}...`);
        const result = await activateObject(tab.objectName, tab.objectType);
        appendOutput(
          result.success
            ? `Activated ${tab.objectName}`
            : `Activation failed: ${result.messages?.map((m) => m.text).join(', ')}`,
        );
      }
    } catch (err) {
      appendOutput(`Save error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleActivate = useCallback(async () => {
    const tab = useEditorStore.getState().getActiveTab();
    if (!tab) return;
    const appendOutput = useEditorStore.getState().appendOutput;

    try {
      appendOutput(`Activating ${tab.objectName}...`);
      const result = await activateObject(tab.objectName, tab.objectType);
      appendOutput(
        result.success
          ? `Activated ${tab.objectName}`
          : `Activation failed: ${result.messages?.map((m) => m.text).join(', ')}`,
      );
    } catch (err) {
      appendOutput(`Activation error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleSyntaxCheck = useCallback(async () => {
    const tab = useEditorStore.getState().getActiveTab();
    if (!tab) return;
    const appendOutput = useEditorStore.getState().appendOutput;
    const setDiagnostics = useEditorStore.getState().setDiagnostics;

    try {
      appendOutput(`Running syntax check on ${tab.objectName}...`);
      const source = tab.model.getValue();
      const result = await syntaxCheck(tab.objectName, tab.objectType, source);
      const diagnostics = result.messages.map((m) => ({
        severity: m.severity,
        message: m.text,
        startLineNumber: m.line,
        startColumn: m.column,
        endLineNumber: m.end_line,
        endColumn: m.end_col,
        source: 'SAP',
        code: m.code,
      }));
      setDiagnostics(tab.id, diagnostics);
      appendOutput(
        diagnostics.length === 0
          ? `Syntax check OK for ${tab.objectName}`
          : `${diagnostics.length} issue(s) found`,
      );
    } catch (err) {
      appendOutput(`Syntax check error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleOpenObject = useCallback(
    async (name: string, type: string) => {
      const appendOutput = useEditorStore.getState().appendOutput;
      const openTab = useEditorStore.getState().openTab;
      try {
        appendOutput(`Opening ${type} ${name}...`);
        const source = await getObject(type, name);
        openTab(
          source.object_name,
          source.object_type as ABAPObjectType,
          source.source,
          source.etag,
        );
        appendOutput(`Opened ${name}`);
      } catch (err) {
        appendOutput(`Error: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [],
  );

  const handleNavigateToLine = useCallback((line: number, column: number) => {
    editorRef.current?.setPosition({ lineNumber: line, column });
    editorRef.current?.revealLineInCenter(line);
  }, []);

  // AI action helpers — get active tab context and switch to AI panel
  const withActiveTab = useCallback(
    (action: (objectType: string, objectName: string) => void) => {
      const tab = useEditorStore.getState().getActiveTab();
      if (!tab) return;
      setBottomPanelTab('ai');
      action(tab.objectType, tab.objectName);
    },
    [setBottomPanelTab],
  );

  const handleAIReview = useCallback(() => {
    withActiveTab((type, name) => reviewCode(type, name));
  }, [withActiveTab, reviewCode]);

  const handleAIS4Check = useCallback(() => {
    withActiveTab((type, name) => analyzeS4(type, name));
  }, [withActiveTab, analyzeS4]);

  const handleAIExplain = useCallback(() => {
    const tab = useEditorStore.getState().getActiveTab();
    if (!tab) return;
    setBottomPanelTab('ai');
    explainCode(tab.model.getValue());
  }, [setBottomPanelTab, explainCode]);

  const handleAIRunTests = useCallback(() => {
    withActiveTab((type, name) => runTests(type, name));
  }, [withActiveTab, runTests]);

  const handleAIOptimize = useCallback(() => {
    withActiveTab((type, name) => optimizeCode(type, name));
  }, [withActiveTab, optimizeCode]);

  const handleAIClear = useCallback(() => {
    useAIStore.getState().clearMessages();
  }, []);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      if (mod && e.key === 'p') {
        e.preventDefault();
        setOpenObjectDialogOpen(true);
      }
      if (mod && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (mod && e.shiftKey && e.key === 'A') {
        e.preventDefault();
        handleActivate();
      }
      if (mod && e.shiftKey && e.key === 'B') {
        e.preventDefault();
        handleSyntaxCheck();
      }
      if (mod && e.key === 'b' && !e.shiftKey) {
        e.preventDefault();
        toggleSidebar();
      }
      if (mod && e.key === 'j') {
        e.preventDefault();
        toggleBottomPanel();
      }
      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        setNewObjectDialogOpen(true);
      }
      // AI shortcuts
      if (mod && e.shiftKey && e.key === 'R') {
        e.preventDefault();
        handleAIReview();
      }
      if (mod && e.shiftKey && e.key === '4') {
        e.preventDefault();
        handleAIS4Check();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, handleActivate, handleSyntaxCheck, toggleSidebar, toggleBottomPanel, handleAIReview, handleAIS4Check]);

  // Apply theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  const sidebarContent = (() => {
    switch (sidebarPanel) {
      case 'explorer':
        return <ExplorerPanel onOpenObject={handleOpenObject} />;
      case 'search':
        return <SearchPanel onOpenObject={handleOpenObject} />;
      case 'git':
        return <GitPanel />;
    }
  })();

  return (
    <div className="h-full flex flex-col bg-editor-bg text-editor-fg">
      <MenuBar
        onOpenObject={() => setOpenObjectDialogOpen(true)}
        onSave={handleSave}
        onActivate={handleActivate}
        onSyntaxCheck={handleSyntaxCheck}
        onConnectionDialog={() => setConnectionDialogOpen(true)}
        onNewObject={() => setNewObjectDialogOpen(true)}
        onAIReview={handleAIReview}
        onAIS4Check={handleAIS4Check}
        onAIExplain={handleAIExplain}
        onAIRunTests={handleAIRunTests}
        onAIClear={handleAIClear}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar>{sidebarContent}</Sidebar>

        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar />
          <ABAPEditor onCursorChange={handleCursorChange} />
          <BottomPanel
            problemsContent={<ProblemsPanel onNavigate={handleNavigateToLine} />}
            outputContent={<OutputPanel />}
            transpilerContent={<TranspilerPanel />}
            aiContent={
              <AIPanel
                onReview={handleAIReview}
                onS4Check={handleAIS4Check}
                onExplain={handleAIExplain}
                onRunTests={handleAIRunTests}
                onOptimize={handleAIOptimize}
                onNavigateToLine={handleNavigateToLine}
              />
            }
          />
        </div>
      </div>

      <StatusBar cursorLine={cursorLine} cursorColumn={cursorColumn} />

      <OpenObjectDialog
        open={openObjectDialogOpen}
        onClose={() => setOpenObjectDialogOpen(false)}
      />
      <ConnectionDialog
        open={connectionDialogOpen}
        onClose={() => setConnectionDialogOpen(false)}
      />
      <NewObjectDialog
        open={newObjectDialogOpen}
        onClose={() => setNewObjectDialogOpen(false)}
      />
    </div>
  );
}
