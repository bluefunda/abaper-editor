import type { ADTSourceCode, ADTObject, SyntaxCheckResult, ActivationResult, PackageContentsResult, CompletionProposal, TransportInfo } from '../types/adt';
import { getToken, getRealm, refreshToken } from './auth';
import { useSystemStore, type SAPSystem } from '../stores/systemStore';

let BASE_URL = import.meta.env.VITE_API_BASE_URL as string || '';

export function setBaseUrl(url: string) {
  BASE_URL = url.replace(/\/+$/, '');
}

export function getBaseUrl(): string {
  return BASE_URL;
}

interface APIResponse<T> {
  success: boolean;
  data: T;
  error?: string;
}

function getSAPHeaders(system?: SAPSystem): Record<string, string> {
  const headers: Record<string, string> = {};
  if (system) {
    headers['X-SAP-Host'] = system.host;
    headers['X-SAP-Client'] = system.client;
    headers['X-SAP-User'] = system.username;
    headers['X-SAP-Password'] = system.password;
  }
  return headers;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  await refreshToken();
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const realm = getRealm();
  if (realm) {
    headers['X-Realm'] = realm;
  }

  // Inject active system SAP headers
  const activeSystem = useSystemStore.getState().getActiveSystem();
  Object.assign(headers, getSAPHeaders(activeSystem));

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  const json = await res.json();
  if (json && typeof json === 'object' && 'success' in json && !json.success) {
    throw new Error(json.error || 'API request failed');
  }
  return json as T;
}

export async function fetchJSONForSystem<T>(system: SAPSystem, path: string, options?: RequestInit): Promise<T> {
  await refreshToken();
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...getSAPHeaders(system),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const realm = getRealm();
  if (realm) {
    headers['X-Realm'] = realm;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export function healthCheck(): Promise<{ status: string }> {
  return fetchJSON('/health');
}

export async function testSystemConnection(): Promise<{ success: boolean; data: { status: string; authenticated: boolean } }> {
  return fetchJSON('/api/v1/system/connect', { method: 'POST' });
}

export async function testSystemConnectionFor(system: SAPSystem): Promise<{ success: boolean; data: { status: string; authenticated: boolean } }> {
  return fetchJSONForSystem(system, '/api/v1/system/connect', { method: 'POST' });
}

export async function getObject(
  type: string,
  name: string,
  functionGroup?: string,
): Promise<ADTSourceCode> {
  // Strip ADT subtype (e.g. "CLAS/OC" -> "CLAS")
  const baseType = type.split('/')[0] ?? type;
  const body: Record<string, string> = { object_type: baseType, object_name: name };
  if (functionGroup) body.function_group = functionGroup;
  const res = await fetchJSON<APIResponse<ADTSourceCode>>('/api/v1/objects/get', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function searchObjects(
  pattern: string,
  types?: string,
): Promise<ADTObject[]> {
  const body: Record<string, string> = { object_name: pattern };
  if (types) body.object_type = types;
  const res = await fetchJSON<APIResponse<{ Objects: ADTObject[] }>>('/api/v1/objects/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data?.Objects ?? [];
}

export async function listPackages(pattern: string): Promise<ADTObject[]> {
  const res = await fetchJSON<APIResponse<ADTObject[]>>('/api/v1/objects/list', {
    method: 'POST',
    body: JSON.stringify({ object_name: pattern, object_type: 'packages' }),
  });
  return res.data ?? [];
}

export async function getPackageContents(packageName: string): Promise<PackageContentsResult> {
  const res = await fetchJSON<APIResponse<PackageContentsResult>>('/api/v1/packages/contents', {
    method: 'POST',
    body: JSON.stringify({ package_name: packageName }),
  });
  return res.data;
}

export async function saveObject(
  objectName: string,
  objectType: string,
  source: string,
  etag?: string,
): Promise<{ success: boolean }> {
  return fetchJSON('/api/v1/objects/create', {
    method: 'POST',
    body: JSON.stringify({
      object_name: objectName,
      object_type: objectType,
      source,
      etag,
    }),
  });
}

export async function activateObject(
  objectName: string,
  objectType: string,
  source?: string,
): Promise<ActivationResult> {
  const body: Record<string, string> = {
    object_name: objectName,
    object_type: objectType,
  };
  if (source !== undefined) body.source = source;
  const res = await fetchJSON<APIResponse<ActivationResult>>('/api/v1/activate', {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.data;
}

export async function syntaxCheck(
  objectName: string,
  objectType: string,
  source: string,
): Promise<SyntaxCheckResult> {
  const res = await fetchJSON<APIResponse<SyntaxCheckResult>>('/api/v1/syntax-check', {
    method: 'POST',
    body: JSON.stringify({
      object_name: objectName,
      object_type: objectType,
      source,
    }),
  });
  return res.data;
}

export async function formatCode(source: string): Promise<string> {
  const res = await fetchJSON<APIResponse<{ source: string }>>('/api/v1/format', {
    method: 'POST',
    body: JSON.stringify({ source }),
  });
  return res.data.source;
}

export async function getCompletionProposals(
  objectType: string,
  objectName: string,
  source: string,
  line: number,
  column: number,
): Promise<CompletionProposal[]> {
  const res = await fetchJSON<APIResponse<CompletionProposal[]>>('/api/v1/completion', {
    method: 'POST',
    body: JSON.stringify({
      object_type: objectType,
      object_name: objectName,
      source,
      line,
      column,
    }),
  });
  return res.data ?? [];
}

export async function getTransportInfo(): Promise<TransportInfo> {
  const res = await fetchJSON<APIResponse<TransportInfo>>('/api/v1/transports/info', {
    method: 'POST',
  });
  return res.data;
}

export async function createTransport(
  description: string,
  targetPackage?: string,
): Promise<{ transport: string }> {
  const res = await fetchJSON<APIResponse<{ transport: string }>>('/api/v1/transports/create', {
    method: 'POST',
    body: JSON.stringify({ description, package: targetPackage }),
  });
  return res.data;
}

// --- GitHub API ---

import { getGitHubToken } from './github-auth';

async function fetchGitHubJSON<T>(path: string, options?: RequestInit): Promise<T> {
  await refreshToken();
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const realm = getRealm();
  if (realm) {
    headers['X-Realm'] = realm;
  }
  const ghToken = getGitHubToken();
  if (ghToken) {
    headers['X-GitHub-Token'] = ghToken;
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    headers,
    ...options,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface GitHubBranch {
  name: string;
  protected: boolean;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  size?: number;
}

export interface GitHubFileContent {
  name: string;
  path: string;
  content: string;
  encoding: string;
  size: number;
}

export async function githubExchangeCode(
  code: string,
): Promise<{ access_token: string; username: string }> {
  const res = await fetchJSON<APIResponse<{ access_token: string; username: string }>>('/api/v1/github/oauth/callback', {
    method: 'POST',
    body: JSON.stringify({ code }),
  });
  return res.data;
}

export async function githubGetUser(): Promise<{ login: string; name: string; avatar_url: string }> {
  const res = await fetchGitHubJSON<APIResponse<{ login: string; name: string; avatar_url: string }>>('/api/v1/github/user', {
    method: 'POST',
  });
  return res.data;
}

export async function githubListBranches(
  owner: string,
  repo: string,
): Promise<GitHubBranch[]> {
  const res = await fetchGitHubJSON<APIResponse<GitHubBranch[]>>('/api/v1/github/branches', {
    method: 'POST',
    body: JSON.stringify({ owner, repo }),
  });
  return res.data ?? [];
}

export async function githubListTree(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<GitHubContent[]> {
  const res = await fetchGitHubJSON<APIResponse<GitHubContent[]>>('/api/v1/github/tree', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, path, branch }),
  });
  return res.data ?? [];
}

export async function githubGetFile(
  owner: string,
  repo: string,
  path: string,
  branch?: string,
): Promise<GitHubFileContent> {
  const res = await fetchGitHubJSON<APIResponse<GitHubFileContent>>('/api/v1/github/file', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, path, branch }),
  });
  return res.data;
}
