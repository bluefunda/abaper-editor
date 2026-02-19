import { FolderOpen, Search } from 'lucide-react';
import { useSettingsStore, type SidebarPanel } from '../../stores/settingsStore';
import { Icon } from '../common/Icon';

interface SidebarProps {
  children: React.ReactNode;
}

const sidebarItems: { id: SidebarPanel; icon: typeof FolderOpen; title: string }[] = [
  { id: 'explorer', icon: FolderOpen, title: 'Explorer' },
  { id: 'search', icon: Search, title: 'Search' },
];

export function Sidebar({ children }: SidebarProps) {
  const { sidebarVisible, sidebarPanel, setSidebarPanel, toggleSidebar } = useSettingsStore();

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
      </div>
      {/* Panel area */}
      <div className="w-60 bg-sidebar-bg border-r border-panel-border flex flex-col overflow-hidden">
        <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-sidebar-fg/60">
          {sidebarPanel === 'explorer' ? 'Explorer' : 'Search'}
        </div>
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </div>
  );
}
