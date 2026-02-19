import { useConnectionStore } from '../../stores/connectionStore';
import { useEditorStore } from '../../stores/editorStore';
import { ConnectionStatus } from '../../types/lsp';
import { getUsername, getRealm, logout } from '../../services/auth';

interface StatusBarProps {
  cursorLine: number;
  cursorColumn: number;
}

export function StatusBar({ cursorLine, cursorColumn }: StatusBarProps) {
  const status = useConnectionStore((s) => s.status);
  const sapSystem = useConnectionStore((s) => s.sapSystem);
  const activeTabId = useEditorStore((s) => s.activeTabId);
  const tabs = useEditorStore((s) => s.tabs);
  const diagnosticsMap = useEditorStore((s) => s.diagnosticsMap);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const diagnostics = activeTabId ? diagnosticsMap[activeTabId] ?? [] : [];
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;

  const statusColors: Record<ConnectionStatus, string> = {
    [ConnectionStatus.Connected]: 'bg-success',
    [ConnectionStatus.Offline]: 'bg-warning',
    [ConnectionStatus.Error]: 'bg-error',
    [ConnectionStatus.Connecting]: 'bg-info',
  };

  const statusLabels: Record<ConnectionStatus, string> = {
    [ConnectionStatus.Connected]: 'Connected',
    [ConnectionStatus.Offline]: 'Offline',
    [ConnectionStatus.Error]: 'Error',
    [ConnectionStatus.Connecting]: 'Connecting...',
  };

  return (
    <div className="flex items-center h-6 bg-statusbar-bg text-statusbar-fg text-[11px] px-3 gap-4 shrink-0 select-none">
      {/* Connection status */}
      <div className="flex items-center gap-1.5">
        <div className={`w-2 h-2 rounded-full ${statusColors[status]}`} />
        <span>{statusLabels[status]}</span>
        {sapSystem && <span>({sapSystem})</span>}
      </div>

      {/* Active object */}
      {activeTab && (
        <div className="flex items-center gap-1">
          <span className="uppercase text-white/60">{activeTab.objectType}</span>
          <span>{activeTab.objectName}</span>
        </div>
      )}

      <div className="flex-1" />

      {/* Diagnostics count */}
      {(errorCount > 0 || warningCount > 0) && (
        <div className="flex items-center gap-2">
          {errorCount > 0 && <span>Errors: {errorCount}</span>}
          {warningCount > 0 && <span>Warnings: {warningCount}</span>}
        </div>
      )}

      {/* Cursor position */}
      {activeTab && (
        <span>
          Ln {cursorLine}, Col {cursorColumn}
        </span>
      )}

      <span>UTF-8</span>
      <span>ABAP</span>

      {/* Realm */}
      {getRealm() && (
        <span className="uppercase bg-white/10 px-1.5 rounded">{getRealm()}</span>
      )}

      {/* User info */}
      {getUsername() && (
        <button
          onClick={logout}
          className="flex items-center gap-1 hover:text-white/90 cursor-pointer"
          title="Click to logout"
        >
          <span>{getUsername()}</span>
        </button>
      )}
    </div>
  );
}
