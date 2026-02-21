import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';
export type SidebarPanel = 'explorer' | 'search' | 'git';
export type BottomPanelTab = 'problems' | 'output' | 'transpiler' | 'ai';

interface SettingsState {
  theme: Theme;
  fontSize: number;
  sidebarVisible: boolean;
  sidebarPanel: SidebarPanel;
  bottomPanelVisible: boolean;
  bottomPanelTab: BottomPanelTab;

  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  toggleSidebar: () => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      theme: 'dark',
      fontSize: 14,
      sidebarVisible: true,
      sidebarPanel: 'explorer',
      bottomPanelVisible: true,
      bottomPanelTab: 'problems',

      setTheme: (theme) => set({ theme }),
      setFontSize: (size) => set({ fontSize: size }),
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      setSidebarPanel: (panel) => set({ sidebarPanel: panel, sidebarVisible: true }),
      toggleBottomPanel: () => set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible })),
      setBottomPanelTab: (tab) => set({ bottomPanelTab: tab, bottomPanelVisible: true }),
    }),
    {
      name: 'abaper-settings',
    },
  ),
);
