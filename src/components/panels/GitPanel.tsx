import { useState, useCallback } from 'react';
import {
  Search,
  GitBranch as GitBranchIcon,
  GitCommit as GitCommitIcon,
  GitPullRequest,
  ExternalLink,
  Plus,
} from 'lucide-react';
import { useGitStore } from '../../stores/gitStore';
import { useGit } from '../../hooks/useGit';
import { Spinner } from '../common/Spinner';
import { Icon } from '../common/Icon';

export function GitPanel() {
  const repositories = useGitStore((s) => s.repositories);
  const currentRepo = useGitStore((s) => s.currentRepo);
  const branches = useGitStore((s) => s.branches);
  const recentCommits = useGitStore((s) => s.recentCommits);
  const prList = useGitStore((s) => s.prList);
  const loading = useGitStore((s) => s.loading);
  const setCurrentRepo = useGitStore((s) => s.setCurrentRepo);
  const setCurrentBranch = useGitStore((s) => s.setCurrentBranch);

  const { searchRepos, listBranches, listCommits, listPRs, createPR } = useGit();

  const [repoQuery, setRepoQuery] = useState('');
  const [showCreatePR, setShowCreatePR] = useState(false);
  const [prTitle, setPrTitle] = useState('');
  const [prBody, setPrBody] = useState('');
  const [prHead, setPrHead] = useState('');
  const [prBase, setPrBase] = useState('main');

  const handleRepoSearch = useCallback(async () => {
    if (!repoQuery.trim()) return;
    await searchRepos(repoQuery);
  }, [repoQuery, searchRepos]);

  const splitRepo = (fullName: string): [string, string] => {
    const parts = fullName.split('/');
    return [parts[0] ?? '', parts[1] ?? ''];
  };

  const handleSelectRepo = useCallback(
    async (fullName: string) => {
      setCurrentRepo(fullName);
      const [owner, repo] = splitRepo(fullName);
      await Promise.all([
        listBranches(owner, repo),
        listCommits(owner, repo),
        listPRs(owner, repo),
      ]);
    },
    [setCurrentRepo, listBranches, listCommits, listPRs],
  );

  const handleBranchClick = useCallback(
    (branchName: string) => {
      setCurrentBranch(branchName);
    },
    [setCurrentBranch],
  );

  const handleCreatePR = useCallback(async () => {
    if (!currentRepo || !prTitle || !prHead) return;
    const [owner, repo] = splitRepo(currentRepo);
    try {
      await createPR(owner, repo, prTitle, prBody, prHead, prBase);
      setShowCreatePR(false);
      setPrTitle('');
      setPrBody('');
      setPrHead('');
      // Refresh PRs
      await listPRs(owner, repo);
    } catch (err) {
      console.error('Create PR failed:', err);
    }
  }, [currentRepo, prTitle, prBody, prHead, prBase, createPR, listPRs]);

  const inputClasses =
    'w-full bg-editor-bg text-xs px-2 py-1.5 outline-none text-editor-fg placeholder:text-sidebar-fg/30 rounded border border-panel-border';

  return (
    <div className="flex flex-col h-full text-xs">
      {/* Repo search */}
      <div className="px-2 pb-2">
        <div className="flex items-center gap-1 bg-editor-bg rounded border border-panel-border">
          <input
            type="text"
            className="flex-1 bg-transparent text-xs px-2 py-1.5 outline-none text-editor-fg placeholder:text-sidebar-fg/30"
            placeholder="Search repositories..."
            value={repoQuery}
            onChange={(e) => setRepoQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleRepoSearch()}
          />
          <button
            className="px-1.5 text-sidebar-fg/60 hover:text-sidebar-fg"
            onClick={handleRepoSearch}
          >
            <Icon icon={Search} size={14} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex justify-center py-2">
          <Spinner />
        </div>
      )}

      <div className="flex-1 overflow-auto">
        {/* Repo list (when no repo selected) */}
        {!currentRepo && repositories.length > 0 && (
          <div>
            <div className="px-3 py-1 text-sidebar-fg/40 uppercase text-[10px] font-semibold">
              Repositories
            </div>
            {repositories.map((repo) => (
              <button
                key={repo.id}
                className="w-full text-left px-3 py-1.5 hover:bg-white/5 flex items-center gap-2"
                onClick={() => handleSelectRepo(repo.full_name)}
              >
                <div className="flex-1 min-w-0">
                  <div className="truncate text-editor-fg">{repo.full_name}</div>
                  {repo.description && (
                    <div className="truncate text-sidebar-fg/40">{repo.description}</div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Selected repo details */}
        {currentRepo && (
          <>
            {/* Current repo header */}
            <div className="px-3 py-1.5 flex items-center gap-2 border-b border-panel-border">
              <span className="text-accent font-medium truncate flex-1">{currentRepo}</span>
              <button
                className="text-sidebar-fg/40 hover:text-sidebar-fg text-[10px]"
                onClick={() => setCurrentRepo(null)}
              >
                Change
              </button>
            </div>

            {/* Branches */}
            <div className="px-3 py-1 text-sidebar-fg/40 uppercase text-[10px] font-semibold mt-1">
              Branches ({branches.length})
            </div>
            {branches.slice(0, 10).map((branch) => (
              <button
                key={branch.name}
                className="w-full text-left px-3 py-1 hover:bg-white/5 flex items-center gap-2"
                onClick={() => handleBranchClick(branch.name)}
              >
                <Icon icon={GitBranchIcon} size={12} className="text-sidebar-fg/40 shrink-0" />
                <span className="truncate">{branch.name}</span>
                {branch.protected && (
                  <span className="text-yellow-400 text-[10px] ml-auto shrink-0">protected</span>
                )}
              </button>
            ))}

            {/* Commits */}
            <div className="px-3 py-1 text-sidebar-fg/40 uppercase text-[10px] font-semibold mt-2">
              Recent Commits ({recentCommits.length})
            </div>
            {recentCommits.slice(0, 10).map((commit) => (
              <div
                key={commit.sha}
                className="px-3 py-1 hover:bg-white/5 flex items-start gap-2"
              >
                <Icon
                  icon={GitCommitIcon}
                  size={12}
                  className="text-sidebar-fg/40 shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-editor-fg">{commit.message}</div>
                  <div className="text-sidebar-fg/40">
                    <span className="font-mono">{commit.sha.slice(0, 7)}</span>
                    {commit.author && <span className="ml-1">by {commit.author}</span>}
                  </div>
                </div>
              </div>
            ))}

            {/* Pull Requests */}
            <div className="px-3 py-1 text-sidebar-fg/40 uppercase text-[10px] font-semibold mt-2 flex items-center">
              <span className="flex-1">Pull Requests ({prList.length})</span>
              <button
                className="text-accent hover:text-white"
                onClick={() => setShowCreatePR(!showCreatePR)}
                title="Create Pull Request"
              >
                <Icon icon={Plus} size={12} />
              </button>
            </div>

            {/* Create PR form */}
            {showCreatePR && (
              <div className="px-3 py-2 space-y-1.5 border-b border-panel-border">
                <input
                  className={inputClasses}
                  placeholder="Title"
                  value={prTitle}
                  onChange={(e) => setPrTitle(e.target.value)}
                />
                <input
                  className={inputClasses}
                  placeholder="Head branch"
                  value={prHead}
                  onChange={(e) => setPrHead(e.target.value)}
                />
                <input
                  className={inputClasses}
                  placeholder="Base branch (default: main)"
                  value={prBase}
                  onChange={(e) => setPrBase(e.target.value)}
                />
                <textarea
                  className={`${inputClasses} resize-none h-12`}
                  placeholder="Description..."
                  value={prBody}
                  onChange={(e) => setPrBody(e.target.value)}
                />
                <button
                  className="w-full bg-accent text-white rounded py-1 hover:bg-accent/80 disabled:opacity-40"
                  disabled={!prTitle || !prHead}
                  onClick={handleCreatePR}
                >
                  Create PR
                </button>
              </div>
            )}

            {prList.map((pr) => (
              <div
                key={pr.number}
                className="px-3 py-1 hover:bg-white/5 flex items-start gap-2"
              >
                <Icon
                  icon={GitPullRequest}
                  size={12}
                  className={`shrink-0 mt-0.5 ${
                    pr.state === 'open'
                      ? 'text-green-400'
                      : pr.state === 'merged'
                        ? 'text-purple-400'
                        : 'text-red-400'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="truncate text-editor-fg">
                    #{pr.number} {pr.title}
                  </div>
                  <div className="text-sidebar-fg/40">
                    {pr.author} &middot; {pr.head_branch} &rarr; {pr.base_branch}
                  </div>
                </div>
                {pr.html_url && (
                  <a
                    href={pr.html_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sidebar-fg/30 hover:text-sidebar-fg shrink-0"
                  >
                    <Icon icon={ExternalLink} size={11} />
                  </a>
                )}
              </div>
            ))}
          </>
        )}

        {/* Empty state */}
        {!currentRepo && repositories.length === 0 && !loading && (
          <div className="px-3 py-4 text-center text-sidebar-fg/30">
            Search for a repository to get started.
          </div>
        )}
      </div>
    </div>
  );
}
