import TranspilerWorker from '../workers/transpiler.worker?worker';

let worker: Worker | undefined;
let messageId = 0;

interface TranspileResult {
  js: string;
  error?: string;
}

interface RunResult {
  output: string[];
  error?: string;
}

const pendingTranspile = new Map<number, (result: TranspileResult) => void>();
const pendingRun = new Map<number, (result: RunResult) => void>();

function getWorker(): Worker {
  if (!worker) {
    const w = new TranspilerWorker();
    w.onmessage = (e: MessageEvent<{ type: string; id: number; js?: string; output?: string[]; error?: string }>) => {
      const { type, id } = e.data;
      if (type === 'transpile-result') {
        const resolve = pendingTranspile.get(id);
        if (resolve) {
          resolve({ js: e.data.js ?? '', error: e.data.error });
          pendingTranspile.delete(id);
        }
      }
      if (type === 'run-result') {
        const resolve = pendingRun.get(id);
        if (resolve) {
          resolve({ output: e.data.output ?? [], error: e.data.error });
          pendingRun.delete(id);
        }
      }
    };
    worker = w;
  }
  return worker;
}

export function transpileABAP(filename: string, source: string): Promise<TranspileResult> {
  return new Promise((resolve) => {
    const id = ++messageId;
    pendingTranspile.set(id, resolve);
    getWorker().postMessage({ type: 'transpile', id, filename, source });
  });
}

export function runTranspiledJS(js: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const id = ++messageId;
    pendingRun.set(id, resolve);
    getWorker().postMessage({ type: 'run', id, js });
  });
}
