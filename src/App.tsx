import { useState, useEffect, useCallback, useRef } from 'react';
import { MenuBar } from './components/layout/MenuBar';
import { Sidebar } from './components/layout/Sidebar';
import { TabBar } from './components/layout/TabBar';
import { BottomPanel } from './components/layout/BottomPanel';
import { RightPanel } from './components/layout/RightPanel';
import { StatusBar } from './components/layout/StatusBar';
import { ABAPEditor } from './components/editor/ABAPEditor';
import { ExplorerPanel } from './components/panels/ExplorerPanel';
import { SearchPanel } from './components/panels/SearchPanel';
import { ProblemsPanel } from './components/panels/ProblemsPanel';
import { OutputPanel } from './components/panels/OutputPanel';
import { TranspilerPanel } from './components/panels/TranspilerPanel';
import { AIPanel } from './components/panels/AIPanel';
import { GitPanel } from './components/panels/GitPanel';
import { GitHubExplorerPanel } from './components/panels/GitHubExplorerPanel';
import { OpenObjectDialog } from './components/dialogs/OpenObjectDialog';
import { ConnectionDialog } from './components/dialogs/ConnectionDialog';
import { NewObjectDialog } from './components/dialogs/NewObjectDialog';
import { AddSystemDialog } from './components/dialogs/AddSystemDialog';
import { useSettingsStore } from './stores/settingsStore';
import { useEditorStore } from './stores/editorStore';
import { useConnectionStore } from './stores/connectionStore';
import { useAIStore } from './stores/aiStore';
import { useSAPConnection } from './hooks/useSAPConnection';
import { useAIAssistant } from './hooks/useAIAssistant';
import * as monaco from 'monaco-editor';
import { saveObject, activateObject, syntaxCheck, getObject, formatCode } from './services/api';
import { initAgent } from './services/mcp';
import { normalizeObjectType } from './stores/editorStore';
import type { DiagnosticItem } from './types/editor';

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const sidebarPanel = useSettingsStore((s) => s.sidebarPanel);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const toggleBottomPanel = useSettingsStore((s) => s.toggleBottomPanel);
  const toggleRightPanel = useSettingsStore((s) => s.toggleRightPanel);

  const [openObjectDialogOpen, setOpenObjectDialogOpen] = useState(false);
  const [connectionDialogOpen, setConnectionDialogOpen] = useState(false);
  const [newObjectDialogOpen, setNewObjectDialogOpen] = useState(false);
  const [addSystemDialogOpen, setAddSystemDialogOpen] = useState(false);
  const [cursorLine, setCursorLine] = useState(1);
  const [cursorColumn, setCursorColumn] = useState(1);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);

  useSAPConnection();

  const { reviewCode, analyzeS4, explainCode, runTests, optimizeCode, fixError, sendPrompt } = useAIAssistant();

  // Initialize agent connection
  useEffect(() => {
    initAgent();
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
        const result = await activateObject(tab.objectName, tab.objectType, source);
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
    const markDirty = useEditorStore.getState().markDirty;
    const source = tab.model.getValue();

    try {
      appendOutput(`Activating ${tab.objectName}...`);
      const result = await activateObject(tab.objectName, tab.objectType, source);
      if (result.success) {
        markDirty(tab.id, false);
        appendOutput(`Activated ${tab.objectName}`);
      } else {
        appendOutput(`Activation failed for ${tab.objectName}:`);
        for (const m of result.messages ?? []) {
          const line = m.line ? ` (Line ${m.line})` : '';
          appendOutput(`  [${m.severity?.toUpperCase() ?? 'ERROR'}]${line} ${m.text}`);
        }
      }
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
      const diagnostics: DiagnosticItem[] = result.messages.map((m) => ({
        severity: m.severity,
        message: m.text,
        startLineNumber: m.line,
        startColumn: m.column,
        endLineNumber: m.end_line,
        endColumn: m.end_col,
        source: 'SAP',
        code: m.code,
      }));
      setDiagnostics(tab.id, 'SAP', diagnostics);

      // Set Monaco markers for squiggly underlines
      const sevMap: Record<string, monaco.MarkerSeverity> = {
        error: monaco.MarkerSeverity.Error,
        warning: monaco.MarkerSeverity.Warning,
        info: monaco.MarkerSeverity.Info,
        hint: monaco.MarkerSeverity.Hint,
      };
      monaco.editor.setModelMarkers(
        tab.model,
        'sap',
        diagnostics.map((d) => ({
          severity: sevMap[d.severity] ?? monaco.MarkerSeverity.Error,
          message: d.message,
          startLineNumber: d.startLineNumber,
          startColumn: d.startColumn,
          endLineNumber: d.endLineNumber,
          endColumn: d.endColumn,
          source: 'SAP',
        })),
      );

      if (diagnostics.length === 0) {
        appendOutput(`Syntax check OK for ${tab.objectName}`);
        // Clear SAP markers
        monaco.editor.setModelMarkers(tab.model, 'sap', []);
      } else {
        appendOutput(`${diagnostics.length} issue(s) found:`);
        for (const d of diagnostics) {
          const sev = d.severity.toUpperCase();
          appendOutput(`  [${sev}] Line ${d.startLineNumber}: ${d.message}`);
        }
      }
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
          normalizeObjectType(source.object_type),
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

  const handleFormatCode = useCallback(async () => {
    const tab = useEditorStore.getState().getActiveTab();
    if (!tab || tab.readOnly) return;
    const appendOutput = useEditorStore.getState().appendOutput;
    try {
      appendOutput(`Formatting ${tab.objectName}...`);
      const source = tab.model.getValue();
      const formatted = await formatCode(source);
      if (formatted !== source) {
        tab.model.pushEditOperations(
          [],
          [{ range: tab.model.getFullModelRange(), text: formatted }],
          () => null,
        );
        appendOutput(`Formatted ${tab.objectName}`);
      } else {
        appendOutput(`No formatting changes for ${tab.objectName}`);
      }
    } catch (err) {
      appendOutput(`Format error: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  const handleFixError = useCallback(
    (diagnostic: DiagnosticItem) => {
      const tab = useEditorStore.getState().getActiveTab();
      if (!tab) return;
      useSettingsStore.setState({ rightPanelVisible: true });
      fixError(
        diagnostic.message,
        diagnostic.startLineNumber,
        tab.model.getValue(),
        tab.objectType,
        tab.objectName,
      );
    },
    [fixError],
  );

  const handleNavigateToLine = useCallback((line: number, column: number) => {
    editorRef.current?.setPosition({ lineNumber: line, column });
    editorRef.current?.revealLineInCenter(line);
  }, []);

  const handleEditorReady = useCallback((editor: unknown) => {
    editorRef.current = editor;
  }, []);

  // AI action helpers — get active tab context and open right panel
  const withActiveTab = useCallback(
    (action: (objectType: string, objectName: string) => void) => {
      const tab = useEditorStore.getState().getActiveTab();
      if (!tab) return;
      useSettingsStore.setState({ rightPanelVisible: true });
      action(tab.objectType, tab.objectName);
    },
    [],
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
    useSettingsStore.setState({ rightPanelVisible: true });
    explainCode(tab.model.getValue());
  }, [explainCode]);

  const handleAIRunTests = useCallback(() => {
    withActiveTab((type, name) => runTests(type, name));
  }, [withActiveTab, runTests]);

  const handleAIOptimize = useCallback(() => {
    withActiveTab((type, name) => optimizeCode(type, name));
  }, [withActiveTab, optimizeCode]);

  const handleAIClear = useCallback(() => {
    useAIStore.getState().clearMessages();
  }, []);

  const handleSendPrompt = useCallback(
    (text: string) => {
      const tab = useEditorStore.getState().getActiveTab();
      useSettingsStore.setState({ rightPanelVisible: true });

      // If the prompt already contains a fenced code block (user pasted code),
      // use that as context instead of the active editor file
      const hasInlineCode = /```[\s\S]*```/.test(text);

      let source = '';
      let isSelection = false;

      if (!hasInlineCode) {
        // Use selected text if available, otherwise full source
        source = tab?.model.getValue() ?? '';
        const editor = editorRef.current;
        if (editor && tab) {
          const selection = editor.getSelection();
          if (selection && !selection.isEmpty()) {
            const selectedText = editor.getModel()?.getValueInRange(selection) ?? '';
            if (selectedText) {
              source = selectedText;
              isSelection = true;
            }
          }
        }
      }

      sendPrompt(
        text,
        tab?.objectType ?? '',
        tab?.objectName ?? '',
        source,
        isSelection,
      );
    },
    [sendPrompt],
  );

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
      if (mod && e.key === 'l' && !e.shiftKey) {
        e.preventDefault();
        toggleRightPanel();
      }
      if (mod && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        setNewObjectDialogOpen(true);
      }
      if (e.shiftKey && e.altKey && e.key === 'F') {
        e.preventDefault();
        handleFormatCode();
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
  }, [handleSave, handleActivate, handleSyntaxCheck, toggleSidebar, toggleBottomPanel, toggleRightPanel, handleAIReview, handleAIS4Check, handleFormatCode]);

  // Apply theme class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('theme-light', theme === 'light');
  }, [theme]);

  const sidebarContent = (() => {
    switch (sidebarPanel) {
      case 'explorer':
        return <ExplorerPanel onOpenObject={handleOpenObject} onAddSystem={() => setAddSystemDialogOpen(true)} />;
      case 'search':
        return <SearchPanel onOpenObject={handleOpenObject} />;
      case 'git':
        return <GitPanel />;
      case 'github':
        return <GitHubExplorerPanel />;
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
        onFormatCode={handleFormatCode}
      />

      <div className="flex flex-1 overflow-hidden">
        <Sidebar>{sidebarContent}</Sidebar>

        <div className="flex-1 flex flex-col overflow-hidden">
          <TabBar />
          <ABAPEditor onCursorChange={handleCursorChange} onEditorReady={handleEditorReady} />
          <BottomPanel
            problemsContent={<ProblemsPanel onNavigate={handleNavigateToLine} onFixError={handleFixError} />}
            outputContent={<OutputPanel />}
            transpilerContent={<TranspilerPanel />}
          />
        </div>

        <RightPanel>
          <AIPanel
            onReview={handleAIReview}
            onS4Check={handleAIS4Check}
            onExplain={handleAIExplain}
            onRunTests={handleAIRunTests}
            onOptimize={handleAIOptimize}
            onFormatCode={handleFormatCode}
            onNavigateToLine={handleNavigateToLine}
            onSendPrompt={handleSendPrompt}
          />
        </RightPanel>
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
      <AddSystemDialog
        open={addSystemDialogOpen}
        onClose={() => setAddSystemDialogOpen(false)}
      />
    </div>
  );
}
