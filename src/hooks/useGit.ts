import { useCallback } from 'react';
import { githubMCP, extractText } from '../services/mcp';
import { useGitStore } from '../stores/gitStore';
import type { GitRepository, GitBranch, GitCommit, PullRequest } from '../types/git';

function parseJSON<T>(text: string, fallback: T): T {
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export function useGit() {
  const setRepositories = useGitStore((s) => s.setRepositories);
  const setBranches = useGitStore((s) => s.setBranches);
  const setRecentCommits = useGitStore((s) => s.setRecentCommits);
  const setPRList = useGitStore((s) => s.setPRList);
  const setLoading = useGitStore((s) => s.setLoading);

  const searchRepos = useCallback(
    async (query: string) => {
      setLoading(true);
      try {
        const result = await githubMCP.callTool('search_repositories', { query });
        const text = extractText(result);
        const data = parseJSON<Record<string, unknown>[]>(text, []);
        const repos: GitRepository[] = data.map((r) => ({
          id: Number(r.id) || 0,
          name: String(r.name || ''),
          full_name: String(r.full_name || ''),
          description: String(r.description || ''),
          html_url: String(r.html_url || ''),
          default_branch: String(r.default_branch || 'main'),
          private: Boolean(r.private),
          owner: String(
            typeof r.owner === 'object' && r.owner
              ? (r.owner as Record<string, unknown>).login
              : r.owner || '',
          ),
        }));
        setRepositories(repos);
      } catch (err) {
        console.error('searchRepos failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [setRepositories, setLoading],
  );

  const listBranches = useCallback(
    async (owner: string, repo: string) => {
      setLoading(true);
      try {
        const result = await githubMCP.callTool('list_branches', { owner, repo });
        const text = extractText(result);
        const data = parseJSON<Record<string, unknown>[]>(text, []);
        const branches: GitBranch[] = data.map((b) => ({
          name: String(b.name || ''),
          sha: String(
            typeof b.commit === 'object' && b.commit
              ? (b.commit as Record<string, unknown>).sha
              : b.sha || '',
          ),
          protected: Boolean(b.protected),
        }));
        setBranches(branches);
      } catch (err) {
        console.error('listBranches failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [setBranches, setLoading],
  );

  const listCommits = useCallback(
    async (owner: string, repo: string) => {
      setLoading(true);
      try {
        const result = await githubMCP.callTool('list_commits', { owner, repo });
        const text = extractText(result);
        const data = parseJSON<Record<string, unknown>[]>(text, []);
        const commits: GitCommit[] = data.map((c) => ({
          sha: String(c.sha || ''),
          message: String(
            typeof c.commit === 'object' && c.commit
              ? (c.commit as Record<string, unknown>).message
              : c.message || '',
          ),
          author: String(
            typeof c.author === 'object' && c.author
              ? (c.author as Record<string, unknown>).login
              : c.author || '',
          ),
          date: String(
            typeof c.commit === 'object' && c.commit
              ? String(
                  typeof (c.commit as Record<string, unknown>).author === 'object'
                    ? ((c.commit as Record<string, unknown>).author as Record<string, unknown>).date
                    : '',
                )
              : c.date || '',
          ),
          url: String(c.html_url || ''),
        }));
        setRecentCommits(commits);
      } catch (err) {
        console.error('listCommits failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [setRecentCommits, setLoading],
  );

  const getFileContents = useCallback(
    async (owner: string, repo: string, path: string): Promise<string> => {
      const result = await githubMCP.callTool('get_file_contents', { owner, repo, path });
      return extractText(result);
    },
    [],
  );

  const createPR = useCallback(
    async (
      owner: string,
      repo: string,
      title: string,
      body: string,
      head: string,
      base: string,
    ): Promise<string> => {
      const result = await githubMCP.callTool('create_pull_request', {
        owner,
        repo,
        title,
        body,
        head,
        base,
      });
      return extractText(result);
    },
    [],
  );

  const listPRs = useCallback(
    async (owner: string, repo: string) => {
      setLoading(true);
      try {
        const result = await githubMCP.callTool('list_pull_requests', { owner, repo });
        const text = extractText(result);
        const data = parseJSON<Record<string, unknown>[]>(text, []);
        const prs: PullRequest[] = data.map((p) => ({
          number: Number(p.number) || 0,
          title: String(p.title || ''),
          state: (String(p.state || 'open') as PullRequest['state']),
          author: String(
            typeof p.user === 'object' && p.user
              ? (p.user as Record<string, unknown>).login
              : p.author || '',
          ),
          created_at: String(p.created_at || ''),
          updated_at: String(p.updated_at || ''),
          head_branch: String(
            typeof p.head === 'object' && p.head
              ? (p.head as Record<string, unknown>).ref
              : p.head_branch || '',
          ),
          base_branch: String(
            typeof p.base === 'object' && p.base
              ? (p.base as Record<string, unknown>).ref
              : p.base_branch || '',
          ),
          html_url: String(p.html_url || ''),
          body: String(p.body || ''),
        }));
        setPRList(prs);
      } catch (err) {
        console.error('listPRs failed:', err);
      } finally {
        setLoading(false);
      }
    },
    [setPRList, setLoading],
  );

  return { searchRepos, listBranches, listCommits, getFileContents, createPR, listPRs };
}
