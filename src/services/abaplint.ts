import type { DiagnosticItem } from '../types/editor';
import AbaplintWorker from '../workers/abaplint.worker?worker';

let worker: Worker | undefined;
let messageId = 0;
const pending = new Map<number, (diagnostics: DiagnosticItem[]) => void>();

function getWorker(): Worker {
  if (!worker) {
    const w = new AbaplintWorker();
    w.onmessage = (e: MessageEvent<{ type: string; id: number; diagnostics: DiagnosticItem[] }>) => {
      if (e.data.type === 'lint-result') {
        const resolve = pending.get(e.data.id);
        if (resolve) {
          resolve(e.data.diagnostics);
          pending.delete(e.data.id);
        }
      }
    };
    worker = w;
  }
  return worker;
}

export function lintABAP(filename: string, source: string): Promise<DiagnosticItem[]> {
  return new Promise((resolve) => {
    const id = ++messageId;
    pending.set(id, resolve);
    getWorker().postMessage({ type: 'lint', id, filename, source });
  });
}
