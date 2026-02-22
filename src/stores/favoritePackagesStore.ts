import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface PackageTreeNode {
  name: string;
  type: string;
  description: string;
  expandable: boolean;
  children: PackageTreeNode[] | undefined;
}

interface FavoritePackagesState {
  favoritesBySystem: Record<string, string[]>;
  trees: Record<string, PackageTreeNode[]>;
  expandedPaths: string[];
  loadingPaths: string[];

  addFavorite: (systemId: string, packageName: string) => void;
  removeFavorite: (systemId: string, packageName: string) => void;
  getFavorites: (systemId: string) => string[];
  setPackageChildren: (path: string, children: PackageTreeNode[]) => void;
  toggleExpanded: (path: string) => void;
  setLoading: (path: string, loading: boolean) => void;
  clearTrees: () => void;
}

export const useFavoritePackagesStore = create<FavoritePackagesState>()(
  persist(
    (set, get) => ({
      favoritesBySystem: {},
      trees: {},
      expandedPaths: [],
      loadingPaths: [],

      addFavorite: (systemId, packageName) => {
        set((s) => {
          const current = s.favoritesBySystem[systemId] ?? [];
          if (current.includes(packageName)) return s;
          return {
            favoritesBySystem: {
              ...s.favoritesBySystem,
              [systemId]: [...current, packageName],
            },
          };
        });
      },

      removeFavorite: (systemId, packageName) => {
        set((s) => {
          const current = s.favoritesBySystem[systemId] ?? [];
          return {
            favoritesBySystem: {
              ...s.favoritesBySystem,
              [systemId]: current.filter((p) => p !== packageName),
            },
            trees: { ...s.trees, [packageName]: undefined as unknown as PackageTreeNode[] },
          };
        });
      },

      getFavorites: (systemId) => {
        return get().favoritesBySystem[systemId] ?? [];
      },

      setPackageChildren: (path, children) => {
        set((s) => ({
          trees: { ...s.trees, [path]: children },
          loadingPaths: s.loadingPaths.filter((p) => p !== path),
        }));
      },

      toggleExpanded: (path) => {
        set((s) => ({
          expandedPaths: s.expandedPaths.includes(path)
            ? s.expandedPaths.filter((p) => p !== path)
            : [...s.expandedPaths, path],
        }));
      },

      setLoading: (path, loading) => {
        set((s) => ({
          loadingPaths: loading
            ? [...s.loadingPaths, path]
            : s.loadingPaths.filter((p) => p !== path),
        }));
      },

      clearTrees: () => {
        set({ trees: {}, expandedPaths: [], loadingPaths: [] });
      },
    }),
    {
      name: 'abaper-favorite-packages',
      partialize: (state) => ({
        favoritesBySystem: state.favoritesBySystem,
      }),
    },
  ),
);
