import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SAPSystem {
  id: string;
  name: string;
  host: string;
  client: string;
  username: string;
  password: string;
  status: 'connected' | 'disconnected' | 'checking';
}

interface SystemState {
  systems: SAPSystem[];
  activeSystemId: string | null;
  addSystem: (system: Omit<SAPSystem, 'id' | 'status'>) => string;
  removeSystem: (id: string) => void;
  updateSystem: (id: string, updates: Partial<Omit<SAPSystem, 'id'>>) => void;
  setActiveSystem: (id: string | null) => void;
  setSystemStatus: (id: string, status: SAPSystem['status']) => void;
  getActiveSystem: () => SAPSystem | undefined;
}

let nextId = 1;

export const useSystemStore = create<SystemState>()(
  persist(
    (set, get) => ({
      systems: [],
      activeSystemId: null,

      addSystem: (system) => {
        const id = `sys-${Date.now()}-${nextId++}`;
        const newSystem: SAPSystem = { ...system, id, status: 'disconnected' };
        set((s) => {
          const systems = [...s.systems, newSystem];
          return {
            systems,
            activeSystemId: s.activeSystemId || id,
          };
        });
        return id;
      },

      removeSystem: (id) => {
        set((s) => {
          const systems = s.systems.filter((sys) => sys.id !== id);
          const activeSystemId = s.activeSystemId === id
            ? (systems[0]?.id ?? null)
            : s.activeSystemId;
          return { systems, activeSystemId };
        });
      },

      updateSystem: (id, updates) => {
        set((s) => ({
          systems: s.systems.map((sys) =>
            sys.id === id ? { ...sys, ...updates } : sys,
          ),
        }));
      },

      setActiveSystem: (id) => {
        set({ activeSystemId: id });
      },

      setSystemStatus: (id, status) => {
        set((s) => ({
          systems: s.systems.map((sys) =>
            sys.id === id ? { ...sys, status } : sys,
          ),
        }));
      },

      getActiveSystem: () => {
        const { systems, activeSystemId } = get();
        return systems.find((s) => s.id === activeSystemId);
      },
    }),
    {
      name: 'abaper-systems',
      partialize: (state) => ({
        systems: state.systems.map((s) => ({ ...s, status: 'disconnected' as const })),
        activeSystemId: state.activeSystemId,
      }),
    },
  ),
);
