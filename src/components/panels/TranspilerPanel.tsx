import { Play, Code, Trash2 } from 'lucide-react';
import { useTranspiler } from '../../hooks/useTranspiler';
import { useEditorStore } from '../../stores/editorStore';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';

export function TranspilerPanel() {
  const { js, consoleOutput, isTranspiling, isRunning, error, transpile, run, clearConsole } =
    useTranspiler();
  const getActiveTab = useEditorStore((s) => s.getActiveTab);

  const handleTranspile = () => {
    const tab = getActiveTab();
    if (!tab) return;
    const source = tab.model.getValue();
    const filename = tab.objectName.toLowerCase() + '.prog.abap';
    transpile(filename, source);
  };

  const handleRun = () => {
    if (js) run(js);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-panel-border shrink-0">
        <button
          className="flex items-center gap-1 px-2 py-0.5 bg-accent hover:bg-accent-hover text-white rounded text-[11px]"
          onClick={handleTranspile}
          disabled={isTranspiling}
        >
          {isTranspiling ? <Spinner size={12} /> : <Icon icon={Code} size={12} />}
          Transpile
        </button>
        <button
          className="flex items-center gap-1 px-2 py-0.5 bg-success/20 hover:bg-success/30 text-success rounded text-[11px] disabled:opacity-40"
          onClick={handleRun}
          disabled={!js || isRunning}
        >
          {isRunning ? <Spinner size={12} /> : <Icon icon={Play} size={12} />}
          Run
        </button>
        <button
          className="flex items-center gap-1 px-2 py-0.5 text-sidebar-fg/40 hover:text-sidebar-fg text-[11px]"
          onClick={clearConsole}
        >
          <Icon icon={Trash2} size={12} />
          Clear
        </button>
        {error && <span className="text-error text-[11px] truncate">{error}</span>}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* JS output */}
        <div className="flex-1 overflow-auto border-r border-panel-border">
          <pre className="px-3 py-2 text-[11px] font-mono whitespace-pre-wrap text-sidebar-fg/80">
            {js || 'Click "Transpile" to convert ABAP to JavaScript'}
          </pre>
        </div>

        {/* Console output */}
        <div className="w-1/3 overflow-auto">
          <div className="px-2 py-1 text-[10px] text-sidebar-fg/40 font-semibold uppercase border-b border-panel-border">
            Console
          </div>
          <div className="px-3 py-2 font-mono text-[11px]">
            {consoleOutput.length === 0 ? (
              <span className="text-sidebar-fg/30">No output</span>
            ) : (
              consoleOutput.map((line, i) => (
                <div key={i} className="py-0.5">
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
