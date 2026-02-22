import { useState, useRef, useEffect, useCallback } from 'react';
import { FolderOpen, Search, GitBranch, Github, LogOut, Bot } from 'lucide-react';
import { useSettingsStore, type SidebarPanel } from '../../stores/settingsStore';
import { useResizable } from '../../hooks/useResizable';
import { getUsername, getRealm, logout } from '../../services/auth';
import { Icon } from '../common/Icon';

interface SidebarProps {
  children: React.ReactNode;
}

const sidebarItems: { id: SidebarPanel; icon: typeof FolderOpen; title: string }[] = [
  { id: 'explorer', icon: FolderOpen, title: 'Explorer' },
  { id: 'search', icon: Search, title: 'Search' },
  { id: 'git', icon: GitBranch, title: 'Git' },
  { id: 'github', icon: Github, title: 'GitHub' },
];

const panelTitles: Record<SidebarPanel, string> = {
  explorer: 'Explorer',
  search: 'Search',
  git: 'Git',
  github: 'GitHub',
};

function UserMenu() {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const username = getUsername();
  const realm = getRealm();

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!username) return null;

  const initials = username.slice(0, 2).toUpperCase();

  return (
    <div className="relative" ref={menuRef}>
      <button
        className="w-8 h-8 rounded-full bg-accent/30 text-accent text-xs font-bold flex items-center justify-center hover:bg-accent/50 transition-colors"
        onClick={() => setOpen(!open)}
        title={username}
      >
        {initials}
      </button>

      {open && (
        <div className="absolute bottom-10 left-0 w-48 bg-editor-bg border border-panel-border rounded-md shadow-lg z-50 py-1">
          <div className="px-3 py-2 border-b border-panel-border">
            <div className="text-xs font-medium text-editor-fg truncate">{username}</div>
            {realm && (
              <div className="text-[10px] text-sidebar-fg/50 uppercase mt-0.5">{realm}</div>
            )}
          </div>
          <button
            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-sidebar-fg/80 hover:bg-white/5 hover:text-error"
            onClick={logout}
          >
            <Icon icon={LogOut} size={14} />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export function Sidebar({ children }: SidebarProps) {
  const { sidebarVisible, sidebarPanel, setSidebarPanel, toggleSidebar, rightPanelVisible, toggleRightPanel, sidebarWidth, setSidebarWidth } = useSettingsStore();

  const onResize = useCallback((size: number) => setSidebarWidth(size), [setSidebarWidth]);
  const { onMouseDown } = useResizable({
    direction: 'horizontal',
    initialSize: sidebarWidth,
    min: 160,
    max: 480,
    onResize,
  });

  if (!sidebarVisible) return null;

  return (
    <div className="flex h-full shrink-0">
      {/* Icon rail */}
      <div className="w-12 bg-sidebar-bg flex flex-col items-center pt-2 gap-1 border-r border-panel-border">
        {sidebarItems.map((item) => (
          <button
            key={item.id}
            className={`w-10 h-10 flex items-center justify-center rounded hover:bg-white/10 ${
              sidebarPanel === item.id ? 'text-white border-l-2 border-accent' : 'text-sidebar-fg/60'
            }`}
            onClick={() => {
              if (sidebarPanel === item.id) {
                toggleSidebar();
              } else {
                setSidebarPanel(item.id);
              }
            }}
            title={item.title}
          >
            <Icon icon={item.icon} size={20} />
          </button>
        ))}

        {/* AI Assistant toggle */}
        <button
          className={`w-10 h-10 flex items-center justify-center rounded hover:bg-white/10 ${
            rightPanelVisible ? 'text-accent' : 'text-sidebar-fg/60'
          }`}
          onClick={toggleRightPanel}
          title="AI Assistant (Ctrl+L)"
        >
          <Icon icon={Bot} size={20} />
        </button>

        {/* Spacer pushes user menu to bottom */}
        <div className="flex-1" />

        {/* User menu at bottom */}
        <div className="pb-2">
          <UserMenu />
        </div>
      </div>
      {/* Panel area */}
      <div
        className="bg-sidebar-bg border-r border-panel-border flex flex-col overflow-hidden relative"
        style={{ width: sidebarWidth }}
      >
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg/60">
          {panelTitles[sidebarPanel]}
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
        {/* Resize handle */}
        <div
          className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-accent/50 active:bg-accent/70 transition-colors z-10"
          onMouseDown={onMouseDown}
        />
      </div>
    </div>
  );
}
