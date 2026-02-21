const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID as string || '';
const STORAGE_KEY = 'abaper-github-token';
const USERNAME_KEY = 'abaper-github-user';

export function getGitHubToken(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function getGitHubUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

export function setGitHubAuth(token: string, username: string): void {
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(USERNAME_KEY, username);
}

export function clearGitHubAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USERNAME_KEY);
}

export function isGitHubConnected(): boolean {
  return !!getGitHubToken();
}

/**
 * Start GitHub OAuth flow by redirecting to GitHub's authorization page.
 * After the user authorizes, GitHub redirects back to our app with a `code` param.
 */
export function startGitHubOAuth(): void {
  if (!GITHUB_CLIENT_ID) {
    console.error('VITE_GITHUB_CLIENT_ID not configured');
    return;
  }

  // Store current URL to restore after OAuth callback
  sessionStorage.setItem('github-oauth-return', window.location.href);

  const params = new URLSearchParams({
    client_id: GITHUB_CLIENT_ID,
    scope: 'repo read:user',
    redirect_uri: window.location.origin + window.location.pathname,
  });

  window.location.href = `https://github.com/login/oauth/authorize?${params}`;
}

/**
 * Check if the current URL has an OAuth callback code and exchange it for a token.
 * Returns true if a callback was handled.
 */
export async function handleOAuthCallback(exchangeCode: (code: string) => Promise<{ access_token: string; username: string }>): Promise<boolean> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');

  if (!code) return false;

  // Clean up the URL
  const url = new URL(window.location.href);
  url.searchParams.delete('code');
  window.history.replaceState({}, '', url.toString());

  try {
    const result = await exchangeCode(code);
    setGitHubAuth(result.access_token, result.username);
    return true;
  } catch (err) {
    console.error('GitHub OAuth exchange failed:', err);
    return false;
  }
}
