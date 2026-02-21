import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { GitRepository, GitBranch, GitCommit, PullRequest } from '../types/git';

interface GitState {
  repositories: GitRepository[];
  currentRepo: string | null;
  branches: GitBranch[];
  currentBranch: string | null;
  recentCommits: GitCommit[];
  prList: PullRequest[];
  loading: boolean;

  setRepositories: (repos: GitRepository[]) => void;
  setCurrentRepo: (repo: string | null) => void;
  setBranches: (branches: GitBranch[]) => void;
  setCurrentBranch: (branch: string | null) => void;
  setRecentCommits: (commits: GitCommit[]) => void;
  setPRList: (prs: PullRequest[]) => void;
  setLoading: (loading: boolean) => void;
}

export const useGitStore = create<GitState>()(
  persist(
    (set) => ({
      repositories: [],
      currentRepo: null,
      branches: [],
      currentBranch: null,
      recentCommits: [],
      prList: [],
      loading: false,

      setRepositories: (repositories) => set({ repositories }),
      setCurrentRepo: (currentRepo) =>
        set({ currentRepo, branches: [], currentBranch: null, recentCommits: [], prList: [] }),
      setBranches: (branches) => set({ branches }),
      setCurrentBranch: (currentBranch) => set({ currentBranch }),
      setRecentCommits: (recentCommits) => set({ recentCommits }),
      setPRList: (prList) => set({ prList }),
      setLoading: (loading) => set({ loading }),
    }),
    {
      name: 'abaper-git',
      partialize: (state) => ({
        currentRepo: state.currentRepo,
        currentBranch: state.currentBranch,
      }),
    },
  ),
);
