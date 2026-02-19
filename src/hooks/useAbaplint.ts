import { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { lintABAP } from '../services/abaplint';
import { useEditorStore } from '../stores/editorStore';
import { useConnectionStore } from '../stores/connectionStore';
import type { DiagnosticItem } from '../types/editor';

function severityToMonaco(sev: DiagnosticItem['severity']): monaco.MarkerSeverity {
  switch (sev) {
    case 'error': return monaco.MarkerSeverity.Error;
    case 'warning': return monaco.MarkerSeverity.Warning;
    case 'info': return monaco.MarkerSeverity.Info;
    case 'hint': return monaco.MarkerSeverity.Hint;
  }
}

export function useAbaplint(editor: monaco.editor.IStandaloneCodeEditor | null) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  const disposableRef = useRef<monaco.IDisposable>();

  useEffect(() => {
    if (!editor) return;

    const runLint = () => {
      const model = editor.getModel();
      if (!model) return;

      const offlineLinting = useConnectionStore.getState().offlineLinting;
      if (!offlineLinting) return;

      const source = model.getValue();
      const filename = model.uri.path.split('/').pop() ?? 'source.prog.abap';

      const tabId = findTabIdForModel(model);

      lintABAP(filename, source).then((diagnostics) => {
        const markers = diagnostics.map((d) => ({
          severity: severityToMonaco(d.severity),
          message: d.message,
          startLineNumber: d.startLineNumber,
          startColumn: d.startColumn,
          endLineNumber: d.endLineNumber,
          endColumn: d.endColumn,
          source: d.source,
          code: d.code,
        }));

        monaco.editor.setModelMarkers(model, 'abaplint', markers);

        if (tabId) {
          useEditorStore.getState().setDiagnostics(tabId, diagnostics);
        }
      });
    };

    // Lint on content change with debounce
    disposableRef.current = editor.onDidChangeModel(() => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runLint, 300);
    });

    const contentDisposable = editor.onDidChangeModelContent(() => {
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(runLint, 300);

      // Mark dirty
      const model = editor.getModel();
      if (model) {
        const tabId = findTabIdForModel(model);
        if (tabId) {
          useEditorStore.getState().markDirty(tabId, true);
        }
      }
    });

    // Initial lint
    runLint();

    return () => {
      clearTimeout(timerRef.current);
      disposableRef.current?.dispose();
      contentDisposable.dispose();
    };
  }, [editor]);
}

function findTabIdForModel(model: monaco.editor.ITextModel): string | null {
  const tabs = useEditorStore.getState().tabs;
  const tab = tabs.find((t) => t.model === model);
  return tab?.id ?? null;
}
