import { useEditorStore } from '../../stores/editorStore';

export function OutputPanel() {
  const outputLog = useEditorStore((s) => s.outputLog);
  const clearOutput = useEditorStore((s) => s.clearOutput);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-end px-2 py-1 shrink-0">
        <button
          className="text-sidebar-fg/40 hover:text-sidebar-fg text-[10px]"
          onClick={clearOutput}
        >
          Clear
        </button>
      </div>
      <div className="flex-1 overflow-auto px-3 font-mono">
        {outputLog.length === 0 ? (
          <div className="text-sidebar-fg/30 py-2">No output</div>
        ) : (
          outputLog.map((line, i) => (
            <div key={i} className="py-0.5 whitespace-pre-wrap">
              {line}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
