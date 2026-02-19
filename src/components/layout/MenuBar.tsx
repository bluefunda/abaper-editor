import { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settingsStore';

interface MenuBarProps {
  onOpenObject: () => void;
  onSave: () => void;
  onActivate: () => void;
  onSyntaxCheck: () => void;
  onConnectionDialog: () => void;
  onNewObject: () => void;
}

interface MenuItem {
  label: string;
  action?: () => void;
  separator?: boolean;
  shortcut?: string;
}

interface MenuDef {
  label: string;
  items: MenuItem[];
}

export function MenuBar({
  onOpenObject,
  onSave,
  onActivate,
  onSyntaxCheck,
  onConnectionDialog,
  onNewObject,
}: MenuBarProps) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBarRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme, toggleSidebar, toggleBottomPanel } = useSettingsStore();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menus: MenuDef[] = [
    {
      label: 'File',
      items: [
        { label: 'New Object...', action: onNewObject, shortcut: 'Ctrl+N' },
        { label: 'Open Object...', action: onOpenObject, shortcut: 'Ctrl+P' },
        { separator: true, label: '' },
        { label: 'Save to SAP', action: onSave, shortcut: 'Ctrl+S' },
      ],
    },
    {
      label: 'SAP',
      items: [
        { label: 'Activate', action: onActivate, shortcut: 'Ctrl+Shift+A' },
        { label: 'Syntax Check', action: onSyntaxCheck, shortcut: 'Ctrl+Shift+B' },
        { separator: true, label: '' },
        { label: 'Connection Settings...', action: onConnectionDialog },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Toggle Sidebar', action: toggleSidebar, shortcut: 'Ctrl+B' },
        { label: 'Toggle Panel', action: toggleBottomPanel, shortcut: 'Ctrl+J' },
        { separator: true, label: '' },
        {
          label: theme === 'dark' ? 'Switch to Light Theme' : 'Switch to Dark Theme',
          action: () => setTheme(theme === 'dark' ? 'light' : 'dark'),
        },
      ],
    },
  ];

  return (
    <div
      ref={menuBarRef}
      className="flex items-center h-8 bg-menubar-bg text-menubar-fg text-xs select-none shrink-0"
    >
      <div className="px-3 font-semibold text-accent">ABAPer</div>
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            className={`px-3 h-8 hover:bg-white/10 ${openMenu === menu.label ? 'bg-white/10' : ''}`}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
            onMouseEnter={() => openMenu && setOpenMenu(menu.label)}
          >
            {menu.label}
          </button>
          {openMenu === menu.label && (
            <div className="absolute top-8 left-0 bg-sidebar-bg border border-panel-border rounded shadow-lg z-50 min-w-[200px] py-1">
              {menu.items.map((item, i) =>
                item.separator ? (
                  <div key={i} className="border-t border-panel-border my-1" />
                ) : (
                  <button
                    key={item.label}
                    className="w-full text-left px-4 py-1.5 hover:bg-accent hover:text-white flex justify-between items-center"
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="text-white/40 ml-6 text-[11px]">{item.shortcut}</span>
                    )}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
