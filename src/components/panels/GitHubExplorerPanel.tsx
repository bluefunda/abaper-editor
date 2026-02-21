import { useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, FolderOpen, GitBranch } from 'lucide-react';
import { useGitHubExplorerStore, type TreeNode } from '../../stores/githubExplorerStore';
import { useGitHubExplorer } from '../../hooks/useGitHubExplorer';
import { Icon } from '../common/Icon';
import { Spinner } from '../common/Spinner';

function TreeNodeItem({
  node,
  owner,
  repo,
  branch,
  expandedPaths,
  onToggle,
  onFileOpen,
  depth,
}: {
  node: TreeNode;
  owner: string;
  repo: string;
  branch: string;
  expandedPaths: string[];
  onToggle: (path: string) => void;
  onFileOpen: (path: string) => void;
  depth: number;
}) {
  const isExpanded = expandedPaths.includes(node.path);
  const isDir = node.type === 'dir';

  return (
    <div>
      <button
        className="w-full flex items-center gap-1.5 py-1 text-xs hover:bg-white/5 text-left"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
        onClick={() => isDir && onToggle(node.path)}
        onDoubleClick={() => !isDir && onFileOpen(node.path)}
      >
        {isDir ? (
          <Icon
            icon={isExpanded ? ChevronDown : ChevronRight}
            size={12}
            className="text-sidebar-fg/40 shrink-0"
          />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon
          icon={isDir ? (isExpanded ? FolderOpen : Folder) : File}
          size={14}
          className={isDir ? 'text-yellow-400/70 shrink-0' : 'text-sidebar-fg/60 shrink-0'}
        />
        <span className="truncate">{node.name}</span>
      </button>

      {isDir && isExpanded && (
        <div>
          {node.children === undefined ? (
            <div className="flex justify-center py-1">
              <Spinner />
            </div>
          ) : node.children.length === 0 ? (
            <div
              className="text-sidebar-fg/30 text-xs py-0.5"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
            >
              Empty
            </div>
          ) : (
            node.children.map((child) => (
              <TreeNodeItem
                key={child.path}
                node={child}
                owner={owner}
                repo={repo}
                branch={branch}
                expandedPaths={expandedPaths}
                onToggle={onToggle}
                onFileOpen={onFileOpen}
                depth={depth + 1}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function GitHubExplorerPanel() {
  const selectedRepo = useGitHubExplorerStore((s) => s.selectedRepo);
  const currentBranch = useGitHubExplorerStore((s) => s.currentBranch);
  const branches = useGitHubExplorerStore((s) => s.branches);
  const tree = useGitHubExplorerStore((s) => s.tree);
  const expandedPaths = useGitHubExplorerStore((s) => s.expandedPaths);
  const loading = useGitHubExplorerStore((s) => s.loading);
  const error = useGitHubExplorerStore((s) => s.error);
  const setSelectedRepo = useGitHubExplorerStore((s) => s.setSelectedRepo);
  const setCurrentBranch = useGitHubExplorerStore((s) => s.setCurrentBranch);
  const toggleExpanded = useGitHubExplorerStore((s) => s.toggleExpanded);

  const { fetchBranches, fetchDirectory, fetchFileContent } = useGitHubExplorer();

  const [repoInput, setRepoInput] = useState(selectedRepo);

  const splitRepo = (fullName: string): [string, string] => {
    const parts = fullName.split('/');
    return [parts[0] ?? '', parts[1] ?? ''];
  };

  const handleRepoSubmit = useCallback(async () => {
    const value = repoInput.trim();
    if (!value || !value.includes('/')) return;
    setSelectedRepo(value);
    const [owner, repo] = splitRepo(value);
    await fetchBranches(owner, repo);
  }, [repoInput, setSelectedRepo, fetchBranches]);

  const handleBranchChange = useCallback(
    async (branch: string) => {
      setCurrentBranch(branch);
      const [owner, repo] = splitRepo(selectedRepo);
      await fetchDirectory(owner, repo, '', branch);
    },
    [selectedRepo, setCurrentBranch, fetchDirectory],
  );

  const handleToggle = useCallback(
    async (path: string) => {
      toggleExpanded(path);

      // If expanding and children not loaded yet, fetch
      const expanded = expandedPaths.includes(path);
      if (!expanded) {
        // We're about to expand — check if children are loaded
        const findNode = (nodes: TreeNode[], target: string): TreeNode | undefined => {
          for (const n of nodes) {
            if (n.path === target) return n;
            if (n.children) {
              const found = findNode(n.children, target);
              if (found) return found;
            }
          }
          return undefined;
        };
        const node = findNode(tree, path);
        if (node && node.children === undefined) {
          const [owner, repo] = splitRepo(selectedRepo);
          await fetchDirectory(owner, repo, path, currentBranch || undefined);
        }
      }
    },
    [toggleExpanded, expandedPaths, tree, selectedRepo, currentBranch, fetchDirectory],
  );

  const handleFileOpen = useCallback(
    async (path: string) => {
      const [owner, repo] = splitRepo(selectedRepo);
      await fetchFileContent(owner, repo, path, currentBranch || undefined);
    },
    [selectedRepo, currentBranch, fetchFileContent],
  );

  // Load root tree when branch is set and tree is empty
  const handleLoadRoot = useCallback(async () => {
    if (!selectedRepo || !currentBranch) return;
    const [owner, repo] = splitRepo(selectedRepo);
    await fetchDirectory(owner, repo, '', currentBranch);
  }, [selectedRepo, currentBranch, fetchDirectory]);

  // Split for rendering
  const [owner, repo] = splitRepo(selectedRepo);

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Repo input */}
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1 bg-editor-bg rounded border border-panel-border">
          <input
            type="text"
            className="flex-1 bg-transparent text-xs px-2 py-1.5 outline-none text-editor-fg placeholder:text-sidebar-fg/30"
            placeholder="owner/repo"
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRepoSubmit()}
          />
        </div>
      </div>

      {/* Branch selector */}
      {branches.length > 0 && (
        <div className="px-2 pb-2">
          <div className="flex items-center gap-1.5">
            <Icon icon={GitBranch} size={13} className="text-sidebar-fg/40 shrink-0" />
            <select
              className="flex-1 bg-editor-bg text-xs px-1.5 py-1 text-editor-fg rounded border border-panel-border outline-none"
              value={currentBranch}
              onChange={(e) => handleBranchChange(e.target.value)}
            >
              {branches.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Load root button (shown when branch selected but no tree) */}
      {selectedRepo && currentBranch && tree.length === 0 && !loading && (
        <div className="px-3 py-2">
          <button
            className="w-full bg-accent/20 text-accent rounded py-1.5 hover:bg-accent/30 text-xs"
            onClick={handleLoadRoot}
          >
            Load file tree
          </button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      )}

      {error && <div className="px-3 py-2 text-error text-xs">{error}</div>}

      {/* File tree */}
      <div className="flex-1 overflow-auto">
        {tree.map((node) => (
          <TreeNodeItem
            key={node.path}
            node={node}
            owner={owner}
            repo={repo}
            branch={currentBranch}
            expandedPaths={expandedPaths}
            onToggle={handleToggle}
            onFileOpen={handleFileOpen}
            depth={0}
          />
        ))}
      </div>

      {/* Empty state */}
      {!selectedRepo && !loading && (
        <div className="px-3 py-4 text-center text-sidebar-fg/30">
          Enter a repository (e.g. owner/repo) to browse files.
        </div>
      )}
    </div>
  );
}
