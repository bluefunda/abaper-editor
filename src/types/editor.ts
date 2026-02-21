import type * as monaco from 'monaco-editor';

export type ABAPObjectType = 'program' | 'class' | 'interface' | 'function' | 'table' | 'structure';

export interface TabState {
  id: string;
  objectName: string;
  objectType: ABAPObjectType;
  model: monaco.editor.ITextModel;
  isDirty: boolean;
  etag: string;
  functionGroup?: string;
  readOnly?: boolean;
  source?: 'sap' | 'github';
}

export interface DiagnosticItem {
  severity: 'error' | 'warning' | 'info' | 'hint';
  message: string;
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
  source: string;
  code?: string;
}

export interface TranspilerOutput {
  js: string;
  consoleOutput: string[];
}
