import { useRef, useCallback } from 'react';
import type * as monacoNs from 'monaco-editor';
import {
  abapMonarchLanguage,
  abapLanguageConfiguration,
  abaperDarkTheme,
  abaperLightTheme,
  createABAPCompletionProvider,
  createABAPSnippetProvider,
} from '../languages/abap';
import { getCompletionProposals } from '../services/api';
import { useEditorStore } from '../stores/editorStore';

let languageRegistered = false;

// Map ADT completion kind numbers to Monaco CompletionItemKind
function mapCompletionKind(kind: number, monaco: typeof monacoNs): monacoNs.languages.CompletionItemKind {
  // ADT kind mapping: 1=keyword, 2=method, 3=property, 4=variable, 5=class, 6=interface, 7=type, 8=function, 9=event
  switch (kind) {
    case 1: return monaco.languages.CompletionItemKind.Keyword;
    case 2: return monaco.languages.CompletionItemKind.Method;
    case 3: return monaco.languages.CompletionItemKind.Property;
    case 4: return monaco.languages.CompletionItemKind.Variable;
    case 5: return monaco.languages.CompletionItemKind.Class;
    case 6: return monaco.languages.CompletionItemKind.Interface;
    case 7: return monaco.languages.CompletionItemKind.TypeParameter;
    case 8: return monaco.languages.CompletionItemKind.Function;
    case 9: return monaco.languages.CompletionItemKind.Event;
    default: return monaco.languages.CompletionItemKind.Text;
  }
}

function createServerCompletionProvider(monaco: typeof monacoNs): monacoNs.languages.CompletionItemProvider {
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  return {
    triggerCharacters: ['>', '=', '.', ' '],
    provideCompletionItems: (model, position, _context, token) => {
      return new Promise((resolve) => {
        if (debounceTimer) clearTimeout(debounceTimer);

        debounceTimer = setTimeout(async () => {
          if (token.isCancellationRequested) {
            resolve({ suggestions: [] });
            return;
          }

          const tab = useEditorStore.getState().getActiveTab();
          if (!tab || tab.readOnly) {
            resolve({ suggestions: [] });
            return;
          }

          try {
            const source = model.getValue();
            const proposals = await getCompletionProposals(
              tab.objectType,
              tab.objectName,
              source,
              position.lineNumber,
              position.column,
            );

            if (token.isCancellationRequested) {
              resolve({ suggestions: [] });
              return;
            }

            const word = model.getWordUntilPosition(position);
            const range = {
              startLineNumber: position.lineNumber,
              startColumn: word.startColumn,
              endLineNumber: position.lineNumber,
              endColumn: word.endColumn,
            };

            const suggestions: monacoNs.languages.CompletionItem[] = proposals.map((p) => ({
              label: p.identifier,
              kind: mapCompletionKind(p.kind, monaco),
              insertText: p.insert_text || p.identifier,
              range,
              sortText: `1_${p.identifier}`,
            }));

            resolve({ suggestions });
          } catch {
            resolve({ suggestions: [] });
          }
        }, 300);
      });
    },
  };
}

export function useABAPEditor() {
  const editorRef = useRef<monacoNs.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoNs | null>(null);

  const beforeMount = useCallback((monaco: typeof monacoNs) => {
    monacoRef.current = monaco;

    if (!languageRegistered) {
      monaco.languages.register({ id: 'abap' });
      monaco.languages.setMonarchTokensProvider('abap', abapMonarchLanguage);
      monaco.languages.setLanguageConfiguration('abap', abapLanguageConfiguration);
      monaco.languages.registerCompletionItemProvider('abap', createABAPCompletionProvider());
      monaco.languages.registerCompletionItemProvider('abap', createABAPSnippetProvider());
      monaco.languages.registerCompletionItemProvider('abap', createServerCompletionProvider(monaco));

      monaco.editor.defineTheme('abaper-dark', abaperDarkTheme);
      monaco.editor.defineTheme('abaper-light', abaperLightTheme);

      languageRegistered = true;
    }
  }, []);

  const onMount = useCallback((editor: monacoNs.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
    editor.focus();
  }, []);

  return { editorRef, monacoRef, beforeMount, onMount };
}
