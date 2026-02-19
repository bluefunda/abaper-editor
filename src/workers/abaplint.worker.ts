import { Registry, MemoryFile, Config } from '@abaplint/core';
import type { DiagnosticItem } from '../types/editor';

interface LintRequest {
  type: 'lint';
  id: number;
  filename: string;
  source: string;
}

interface LintResponse {
  type: 'lint-result';
  id: number;
  diagnostics: DiagnosticItem[];
}

const defaultConfig = Config.getDefault();

self.onmessage = async (e: MessageEvent<LintRequest>) => {
  const { type, id, filename, source } = e.data;
  if (type !== 'lint') return;

  try {
    const reg = new Registry(defaultConfig);
    reg.addFile(new MemoryFile(filename, source));
    await reg.parseAsync();
    const issues = reg.findIssues();

    const diagnostics: DiagnosticItem[] = issues.map((issue) => ({
      severity: mapSeverity(issue.getSeverity().toString()),
      message: issue.getMessage(),
      startLineNumber: issue.getStart().getRow(),
      startColumn: issue.getStart().getCol(),
      endLineNumber: issue.getEnd().getRow(),
      endColumn: issue.getEnd().getCol() + 1,
      source: 'abaplint',
      code: issue.getKey(),
    }));

    const response: LintResponse = { type: 'lint-result', id, diagnostics };
    self.postMessage(response);
  } catch (err) {
    const response: LintResponse = {
      type: 'lint-result',
      id,
      diagnostics: [{
        severity: 'error',
        message: `abaplint error: ${err instanceof Error ? err.message : String(err)}`,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1,
        source: 'abaplint',
      }],
    };
    self.postMessage(response);
  }
};

function mapSeverity(sev: string): DiagnosticItem['severity'] {
  switch (sev.toLowerCase()) {
    case 'error': return 'error';
    case 'warning': return 'warning';
    case 'information': return 'info';
    default: return 'hint';
  }
}
