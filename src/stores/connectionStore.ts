import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ConnectionStatus } from '../types/lsp';

interface ConnectionState {
  backendUrl: string;
  offlineLinting: boolean;
  activateOnSave: boolean;
  lspEnabled: boolean;
  status: ConnectionStatus;
  sapSystem: string;

  setBackendUrl: (url: string) => void;
  setOfflineLinting: (enabled: boolean) => void;
  setActivateOnSave: (enabled: boolean) => void;
  setLspEnabled: (enabled: boolean) => void;
  setStatus: (status: ConnectionStatus) => void;
  setSapSystem: (system: string) => void;
}

export const useConnectionStore = create<ConnectionState>()(
  persist(
    (set) => ({
      backendUrl: import.meta.env.VITE_API_BASE_URL as string || '',
      offlineLinting: true,
      activateOnSave: false,
      lspEnabled: false,
      status: ConnectionStatus.Offline,
      sapSystem: '',

      setBackendUrl: (url) => set({ backendUrl: url }),
      setOfflineLinting: (enabled) => set({ offlineLinting: enabled }),
      setActivateOnSave: (enabled) => set({ activateOnSave: enabled }),
      setLspEnabled: (enabled) => set({ lspEnabled: enabled }),
      setStatus: (status) => set({ status }),
      setSapSystem: (system) => set({ sapSystem: system }),
    }),
    {
      name: 'abaper-connection',
      partialize: (state) => ({
        backendUrl: state.backendUrl,
        offlineLinting: state.offlineLinting,
        activateOnSave: state.activateOnSave,
        lspEnabled: state.lspEnabled,
      }),
    },
  ),
);
