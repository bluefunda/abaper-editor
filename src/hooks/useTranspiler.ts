import { useState, useCallback } from 'react';
import { transpileABAP, runTranspiledJS } from '../services/transpiler';

export function useTranspiler() {
  const [js, setJs] = useState('');
  const [consoleOutput, setConsoleOutput] = useState<string[]>([]);
  const [isTranspiling, setIsTranspiling] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const transpile = useCallback(async (filename: string, source: string) => {
    setIsTranspiling(true);
    setError(null);
    try {
      const result = await transpileABAP(filename, source);
      if (result.error) {
        setError(result.error);
        setJs('');
      } else {
        setJs(result.js);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsTranspiling(false);
    }
  }, []);

  const run = useCallback(async (jsCode: string) => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await runTranspiledJS(jsCode);
      if (result.error) {
        setConsoleOutput((prev) => [...prev, `Error: ${result.error}`]);
      }
      if (result.output.length > 0) {
        setConsoleOutput((prev) => [...prev, ...result.output]);
      }
    } catch (err) {
      setConsoleOutput((prev) => [
        ...prev,
        `Error: ${err instanceof Error ? err.message : String(err)}`,
      ]);
    } finally {
      setIsRunning(false);
    }
  }, []);

  const clearConsole = useCallback(() => setConsoleOutput([]), []);

  return { js, consoleOutput, isTranspiling, isRunning, error, transpile, run, clearConsole };
}
