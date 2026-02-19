import { X } from 'lucide-react';
import { useEditorStore } from '../../stores/editorStore';

export function TabBar() {
  const tabs = useEditorStore((s) => s.tabs);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const closeTab = useEditorStore((s) => s.closeTab);

  if (tabs.length === 0) return null;

  return (
    <div className="flex items-center h-9 bg-tab-bg overflow-x-auto shrink-0">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          className={`flex items-center h-full px-3 gap-2 cursor-pointer text-xs border-r border-panel-border group min-w-0 ${
            tab.id === activeTabId
              ? 'bg-tab-active-bg text-white'
              : 'text-sidebar-fg/70 hover:bg-tab-hover-bg'
          }`}
          onClick={() => setActiveTab(tab.id)}
        >
          <span className="truncate max-w-[160px]">
            {tab.isDirty && <span className="text-dirty mr-1">●</span>}
            {tab.objectName}
          </span>
          <button
            className="opacity-0 group-hover:opacity-100 hover:bg-white/20 rounded p-0.5"
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
          >
            <X size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}
