import { useCallback } from 'react';
import { githubListBranches, githubListTree, githubGetFile } from '../services/api';
import { useGitHubExplorerStore, type TreeNode } from '../stores/githubExplorerStore';
import { useEditorStore } from '../stores/editorStore';

export function useGitHubExplorer() {
  const store = useGitHubExplorerStore();

  const fetchBranches = useCallback(async (owner: string, repo: string) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const branches = await githubListBranches(owner, repo);
      const names = branches.map((b) => b.name);
      store.setBranches(names);
      if (names.length > 0 && !store.currentBranch) {
        const defaultBranch = names.find((n) => n === 'main') ?? names.find((n) => n === 'master') ?? names[0] ?? '';
        store.setCurrentBranch(defaultBranch);
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to fetch branches');
    } finally {
      store.setLoading(false);
    }
  }, [store]);

  const fetchDirectory = useCallback(async (owner: string, repo: string, path: string, branch?: string) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const contents = await githubListTree(owner, repo, path, branch);
      const nodes: TreeNode[] = contents
        .map((item) => ({
          name: item.name,
          path: item.path,
          type: item.type,
          children: item.type === 'dir' ? undefined : undefined,
        }))
        .sort((a, b) => {
          if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
          return a.name.localeCompare(b.name);
        });

      if (path === '' || path === '.') {
        store.setTree(nodes);
      } else {
        store.setChildren(path, nodes);
      }
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to fetch directory');
    } finally {
      store.setLoading(false);
    }
  }, [store]);

  const fetchFileContent = useCallback(async (owner: string, repo: string, path: string, branch?: string) => {
    store.setLoading(true);
    store.setError(null);
    try {
      const file = await githubGetFile(owner, repo, path, branch);
      useEditorStore.getState().openReadOnlyTab(path, file.content);
    } catch (err) {
      store.setError(err instanceof Error ? err.message : 'Failed to fetch file');
    } finally {
      store.setLoading(false);
    }
  }, [store]);

  return { fetchBranches, fetchDirectory, fetchFileContent };
}
