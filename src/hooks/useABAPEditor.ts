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

let languageRegistered = false;

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
