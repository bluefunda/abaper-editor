import { useSettingsStore, type BottomPanelTab } from '../../stores/settingsStore';
import { useResizable } from '../../hooks/useResizable';
import { ChevronDown } from 'lucide-react';
import { Icon } from '../common/Icon';

interface BottomPanelProps {
  problemsContent: React.ReactNode;
  outputContent: React.ReactNode;
  transpilerContent: React.ReactNode;
}

const panelTabs: { id: BottomPanelTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'transpiler', label: 'Transpiler' },
];

export function BottomPanel({ problemsContent, outputContent, transpilerContent }: BottomPanelProps) {
  const { bottomPanelVisible, bottomPanelTab, bottomPanelHeight, setBottomPanelTab, setBottomPanelHeight, toggleBottomPanel } =
    useSettingsStore();

  const { onMouseDown } = useResizable({
    direction: 'vertical',
    initialSize: bottomPanelHeight,
    min: 100,
    max: 600,
    reverse: true,
    onResize: setBottomPanelHeight,
  });

  if (!bottomPanelVisible) return null;

  const content: Record<BottomPanelTab, React.ReactNode> = {
    problems: problemsContent,
    output: outputContent,
    transpiler: transpilerContent,
  };

  return (
    <div className="flex flex-col border-t border-panel-border bg-panel-bg shrink-0" style={{ height: bottomPanelHeight }}>
      {/* Drag handle */}
      <div
        className="h-1 cursor-row-resize hover:bg-accent shrink-0 transition-colors"
        onMouseDown={onMouseDown}
      />
      <div className="flex items-center h-8 border-b border-panel-border shrink-0 px-2">
        <div className="flex items-center gap-0 flex-1">
          {panelTabs.map((tab) => (
            <button
              key={tab.id}
              className={`px-3 h-8 text-xs ${
                bottomPanelTab === tab.id
                  ? 'text-white border-b-2 border-accent'
                  : 'text-sidebar-fg/60 hover:text-sidebar-fg'
              }`}
              onClick={() => setBottomPanelTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <button
          className="text-sidebar-fg/60 hover:text-sidebar-fg"
          onClick={toggleBottomPanel}
          title="Close Panel"
        >
          <Icon icon={ChevronDown} size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-auto text-xs">{content[bottomPanelTab]}</div>
    </div>
  );
}
