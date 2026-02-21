import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'dir';
  children: TreeNode[] | undefined; // undefined = not loaded, [] = empty
}

interface GitHubExplorerState {
  selectedRepo: string;
  currentBranch: string;
  branches: string[];
  tree: TreeNode[];
  expandedPaths: string[];
  loading: boolean;
  error: string | null;

  setSelectedRepo: (repo: string) => void;
  setCurrentBranch: (branch: string) => void;
  setBranches: (branches: string[]) => void;
  setTree: (tree: TreeNode[]) => void;
  setChildren: (path: string, children: TreeNode[]) => void;
  toggleExpanded: (path: string) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
}

function updateChildren(nodes: TreeNode[], targetPath: string, children: TreeNode[]): TreeNode[] {
  return nodes.map((node) => {
    if (node.path === targetPath) {
      return { ...node, children };
    }
    if (node.children && targetPath.startsWith(node.path + '/')) {
      return { ...node, children: updateChildren(node.children, targetPath, children) };
    }
    return node;
  });
}

export const useGitHubExplorerStore = create<GitHubExplorerState>()(
  persist(
    (set) => ({
      selectedRepo: '',
      currentBranch: '',
      branches: [],
      tree: [],
      expandedPaths: [],
      loading: false,
      error: null,

      setSelectedRepo: (selectedRepo) =>
        set({ selectedRepo, currentBranch: '', branches: [], tree: [], expandedPaths: [] }),
      setCurrentBranch: (currentBranch) =>
        set({ currentBranch, tree: [], expandedPaths: [] }),
      setBranches: (branches) => set({ branches }),
      setTree: (tree) => set({ tree }),
      setChildren: (path, children) =>
        set((s) => ({ tree: updateChildren(s.tree, path, children) })),
      toggleExpanded: (path) =>
        set((s) => ({
          expandedPaths: s.expandedPaths.includes(path)
            ? s.expandedPaths.filter((p) => p !== path)
            : [...s.expandedPaths, path],
        })),
      setLoading: (loading) => set({ loading }),
      setError: (error) => set({ error }),
      reset: () =>
        set({ selectedRepo: '', currentBranch: '', branches: [], tree: [], expandedPaths: [], error: null }),
    }),
    {
      name: 'abaper-github-explorer',
      partialize: (state) => ({
        selectedRepo: state.selectedRepo,
        currentBranch: state.currentBranch,
      }),
    },
  ),
);
