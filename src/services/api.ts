import type { ADTSourceCode, ADTObject, SyntaxCheckResult, ActivationResult } from '../types/adt';
import { getToken, getRealm, refreshToken } from './auth';

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

export async function getObject(
  type: string,
  name: string,
  functionGroup?: string,
): Promise<ADTSourceCode> {
  // Strip ADT subtype (e.g. "CLAS/OC" → "CLAS")
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
): Promise<ActivationResult> {
  const res = await fetchJSON<APIResponse<ActivationResult>>('/api/v1/activate', {
    method: 'POST',
    body: JSON.stringify({
      object_name: objectName,
      object_type: objectType,
    }),
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

// --- GitHub API ---

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

export async function githubListBranches(
  owner: string,
  repo: string,
): Promise<GitHubBranch[]> {
  const res = await fetchJSON<APIResponse<GitHubBranch[]>>('/api/v1/github/branches', {
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
  const res = await fetchJSON<APIResponse<GitHubContent[]>>('/api/v1/github/tree', {
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
  const res = await fetchJSON<APIResponse<GitHubFileContent>>('/api/v1/github/file', {
    method: 'POST',
    body: JSON.stringify({ owner, repo, path, branch }),
  });
  return res.data;
}
