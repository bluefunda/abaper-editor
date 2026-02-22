import { useSettingsStore } from '../../stores/settingsStore';
import { useResizable } from '../../hooks/useResizable';
import { X } from 'lucide-react';
import { Icon } from '../common/Icon';

interface RightPanelProps {
  children: React.ReactNode;
}

export function RightPanel({ children }: RightPanelProps) {
  const { rightPanelVisible, rightPanelWidth, toggleRightPanel, setRightPanelWidth } =
    useSettingsStore();

  const { onMouseDown } = useResizable({
    direction: 'horizontal',
    initialSize: rightPanelWidth,
    min: 250,
    max: 700,
    reverse: true,
    onResize: setRightPanelWidth,
  });

  if (!rightPanelVisible) return null;

  return (
    <div className="flex h-full shrink-0" style={{ width: rightPanelWidth }}>
      {/* Drag handle */}
      <div
        className="w-1 cursor-col-resize hover:bg-accent shrink-0 transition-colors"
        onMouseDown={onMouseDown}
      />
      <div className="flex-1 flex flex-col overflow-hidden border-l border-panel-border bg-panel-bg">
        {/* Title bar */}
        <div className="flex items-center h-8 px-3 border-b border-panel-border shrink-0">
          <span className="text-xs font-semibold text-sidebar-fg/80 flex-1">AI Assistant</span>
          <button
            className="text-sidebar-fg/60 hover:text-sidebar-fg"
            onClick={toggleRightPanel}
            title="Close AI Panel (Ctrl+L)"
          >
            <Icon icon={X} size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-hidden">{children}</div>
      </div>
    </div>
  );
}
