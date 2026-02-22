import { Buffer } from 'buffer';
(globalThis as unknown as Record<string, unknown>).Buffer = Buffer;

import { Transpiler } from '@abaplint/transpiler';

interface TranspileRequest {
  type: 'transpile';
  id: number;
  filename: string;
  source: string;
}

interface RunRequest {
  type: 'run';
  id: number;
  js: string;
}

type WorkerRequest = TranspileRequest | RunRequest;

interface TranspileResponse {
  type: 'transpile-result';
  id: number;
  js: string;
  error?: string;
}

interface RunResponse {
  type: 'run-result';
  id: number;
  output: string[];
  error?: string;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;

  if (msg.type === 'transpile') {
    try {
      const transpiler = new Transpiler();
      const result = await transpiler.runRaw([
        { filename: msg.filename, contents: msg.source },
      ]);

      const jsChunks: string[] = [];
      for (const obj of result.objects) {
        jsChunks.push(obj.chunk.getCode());
      }

      const response: TranspileResponse = {
        type: 'transpile-result',
        id: msg.id,
        js: jsChunks.join('\n'),
      };
      self.postMessage(response);
    } catch (err) {
      const response: TranspileResponse = {
        type: 'transpile-result',
        id: msg.id,
        js: '',
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  }

  if (msg.type === 'run') {
    const output: string[] = [];
    try {
      // Create a mock ABAP runtime with WRITE support
      const mockRuntime = `
        const __output = [];
        const abap = {
          Console: { log: (v) => __output.push(String(v)) },
          statements: {
            write: (v) => __output.push(String(v)),
          },
          types: {},
          Classes: {},
          builtin: {
            sy: { get: () => ({ subrc: { get: () => 0 }, index: { get: () => 0 }, tabix: { get: () => 0 } }) },
          },
        };
        const WRITE = (v) => __output.push(String(v));
      `;

      const wrappedCode = `${mockRuntime}\n${msg.js}\n__output;`;
      const fn = new Function(wrappedCode);
      const result = fn();
      if (Array.isArray(result)) {
        output.push(...result.map(String));
      }

      const response: RunResponse = {
        type: 'run-result',
        id: msg.id,
        output,
      };
      self.postMessage(response);
    } catch (err) {
      const response: RunResponse = {
        type: 'run-result',
        id: msg.id,
        output,
        error: err instanceof Error ? err.message : String(err),
      };
      self.postMessage(response);
    }
  }
};
