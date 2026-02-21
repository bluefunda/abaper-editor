import { useSettingsStore, type BottomPanelTab } from '../../stores/settingsStore';
import { ChevronDown } from 'lucide-react';
import { Icon } from '../common/Icon';

interface BottomPanelProps {
  problemsContent: React.ReactNode;
  outputContent: React.ReactNode;
  transpilerContent: React.ReactNode;
  aiContent: React.ReactNode;
}

const panelTabs: { id: BottomPanelTab; label: string }[] = [
  { id: 'problems', label: 'Problems' },
  { id: 'output', label: 'Output' },
  { id: 'transpiler', label: 'Transpiler' },
  { id: 'ai', label: 'AI Assistant' },
];

export function BottomPanel({ problemsContent, outputContent, transpilerContent, aiContent }: BottomPanelProps) {
  const { bottomPanelVisible, bottomPanelTab, setBottomPanelTab, toggleBottomPanel } =
    useSettingsStore();

  if (!bottomPanelVisible) return null;

  const content = {
    problems: problemsContent,
    output: outputContent,
    transpiler: transpilerContent,
    ai: aiContent,
  };

  return (
    <div className="flex flex-col border-t border-panel-border bg-panel-bg h-[200px] shrink-0">
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
