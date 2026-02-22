import { Buffer } from 'buffer';
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;

import { Registry, MemoryFile, Config } from '@abaplint/core';
import type { DiagnosticItem } from '../types/editor';
import type { IConfig } from '@abaplint/core';

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

// Relaxed config: syntax/parser errors + important semantic checks only.
// Disable all style, formatting, and naming rules to reduce noise.
const lintConfig: IConfig = {
  ...(Config.getDefault() as unknown as { config: IConfig }).config,
  rules: {
    // Parser & syntax (critical)
    parser_error: true,
    parser_missing_space: true,
    parser_bad_exceptions: true,
    // Semantic checks
    begin_end_names: true,
    method_implemented_twice: true,
    unreachable_code: true,
    empty_statement: true,
    empty_structure: true,
    obsolete_statement: true,
    ambiguous_statement: true,
    identical_conditions: true,
    identical_contents: true,
    // Useful warnings
    sy_modification: true,
    dangerous_statement: true,
    try_without_catch: true,
    mix_returning: true,
    when_others_last: true,
    // Everything else off
  },
};

const editorConfig = new Config(JSON.stringify(lintConfig));

self.onmessage = async (e: MessageEvent<LintRequest>) => {
  const { type, id, filename, source } = e.data;
  if (type !== 'lint') return;

  try {
    const reg = new Registry(editorConfig);
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
