import { useEffect, useCallback, useState } from 'react';
import Editor from '@monaco-editor/react';
import { useABAPEditor } from '../../hooks/useABAPEditor';
import { useAbaplint } from '../../hooks/useAbaplint';
import { useEditorStore } from '../../stores/editorStore';
import { useSettingsStore } from '../../stores/settingsStore';
import type * as monacoNs from 'monaco-editor';

interface ABAPEditorProps {
  onCursorChange: (line: number, column: number) => void;
}

export function ABAPEditor({ onCursorChange }: ABAPEditorProps) {
  const { editorRef, beforeMount, onMount: baseOnMount } = useABAPEditor();
  const [mounted, setMounted] = useState(false);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const theme = useSettingsStore((s) => s.theme);
  const fontSize = useSettingsStore((s) => s.fontSize);

  const activeTab = tabs.find((t) => t.id === activeTabId);

  const onMount = useCallback(
    (editor: monacoNs.editor.IStandaloneCodeEditor) => {
      baseOnMount(editor);
      setMounted(true);

      editor.onDidChangeCursorPosition((e) => {
        onCursorChange(e.position.lineNumber, e.position.column);
      });
    },
    [baseOnMount, onCursorChange],
  );

  // Switch model when active tab changes or editor mounts
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !activeTab) return;

    const currentModel = editor.getModel();
    if (currentModel !== activeTab.model) {
      editor.setModel(activeTab.model);
    }
  }, [activeTab, editorRef, mounted]);

  // Use abaplint
  useAbaplint(mounted ? editorRef.current : null);

  if (!activeTab) {
    return (
      <div className="flex-1 flex items-center justify-center text-sidebar-fg/40">
        <div className="text-center">
          <div className="text-4xl mb-4 font-bold text-accent/40">ABAPer</div>
          <div className="text-sm">
            Press <kbd className="px-1.5 py-0.5 bg-sidebar-bg rounded border border-panel-border text-xs">Ctrl+P</kbd> to open an ABAP object
          </div>
          <div className="text-sm mt-1">
            or start typing to create a new file
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        theme={theme === 'dark' ? 'abaper-dark' : 'abaper-light'}
        language="abap"
        beforeMount={beforeMount}
        onMount={onMount}
        options={{
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Menlo, Monaco, monospace",
          fontLigatures: true,
          minimap: { enabled: true, maxColumn: 80 },
          scrollBeyondLastLine: false,
          renderWhitespace: 'selection',
          bracketPairColorization: { enabled: true },
          guides: { bracketPairs: true, indentation: true },
          smoothScrolling: true,
          cursorBlinking: 'smooth',
          cursorSmoothCaretAnimation: 'on',
          padding: { top: 8 },
          wordWrap: 'off',
          tabSize: 2,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
