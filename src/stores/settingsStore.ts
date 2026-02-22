import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Theme = 'dark' | 'light';
export type SidebarPanel = 'explorer' | 'search' | 'git' | 'github';
export type BottomPanelTab = 'problems' | 'output' | 'transpiler';

interface SettingsState {
  theme: Theme;
  fontSize: number;
  sidebarVisible: boolean;
  sidebarPanel: SidebarPanel;
  bottomPanelVisible: boolean;
  bottomPanelTab: BottomPanelTab;
  bottomPanelHeight: number;
  rightPanelVisible: boolean;
  rightPanelWidth: number;
  sidebarWidth: number;

  setTheme: (theme: Theme) => void;
  setFontSize: (size: number) => void;
  toggleSidebar: () => void;
  setSidebarPanel: (panel: SidebarPanel) => void;
  toggleBottomPanel: () => void;
  setBottomPanelTab: (tab: BottomPanelTab) => void;
  setBottomPanelHeight: (height: number) => void;
  toggleRightPanel: () => void;
  setRightPanelWidth: (width: number) => void;
  setSidebarWidth: (width: number) => void;
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
      bottomPanelHeight: 200,
      rightPanelVisible: false,
      rightPanelWidth: 350,
      sidebarWidth: 240,

      setTheme: (theme) => set({ theme }),
      setFontSize: (size) => set({ fontSize: size }),
      toggleSidebar: () => set((s) => ({ sidebarVisible: !s.sidebarVisible })),
      setSidebarPanel: (panel) => set({ sidebarPanel: panel, sidebarVisible: true }),
      toggleBottomPanel: () => set((s) => ({ bottomPanelVisible: !s.bottomPanelVisible })),
      setBottomPanelTab: (tab) => set({ bottomPanelTab: tab, bottomPanelVisible: true }),
      setBottomPanelHeight: (height) => set({ bottomPanelHeight: height }),
      toggleRightPanel: () => set((s) => ({ rightPanelVisible: !s.rightPanelVisible })),
      setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
      setSidebarWidth: (width) => set({ sidebarWidth: width }),
    }),
    {
      name: 'abaper-settings',
      version: 1,
      migrate: (persisted: unknown, version: number) => {
        const state = persisted as Record<string, unknown>;
        if (version === 0) {
          // Migrate: 'ai' tab no longer exists in bottom panel
          if (state.bottomPanelTab === 'ai') {
            state.bottomPanelTab = 'problems';
          }
          // Add new defaults
          if (state.bottomPanelHeight === undefined) state.bottomPanelHeight = 200;
          if (state.rightPanelVisible === undefined) state.rightPanelVisible = false;
          if (state.rightPanelWidth === undefined) state.rightPanelWidth = 350;
        }
        return state as unknown as SettingsState;
      },
    },
  ),
);
