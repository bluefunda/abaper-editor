import type { ADTSourceCode, ADTObject, SyntaxCheckResult, ActivationResult } from '../types/adt';

let BASE_URL = import.meta.env.VITE_API_BASE_URL as string || '';

export function setBaseUrl(url: string) {
  BASE_URL = url.replace(/\/+$/, '');
}

export function getBaseUrl(): string {
  return BASE_URL;
}

async function fetchJSON<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
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

export function getObject(
  type: string,
  name: string,
  functionGroup?: string,
): Promise<ADTSourceCode> {
  const params = new URLSearchParams({ type, name });
  if (functionGroup) params.set('functionGroup', functionGroup);
  return fetchJSON(`/api/v1/objects/get?${params}`);
}

export function searchObjects(
  pattern: string,
  types?: string,
): Promise<ADTObject[]> {
  const params = new URLSearchParams({ pattern });
  if (types) params.set('types', types);
  return fetchJSON(`/api/v1/objects/search?${params}`);
}

export function listPackages(pattern: string): Promise<ADTObject[]> {
  const params = new URLSearchParams({ type: 'packages', pattern });
  return fetchJSON(`/api/v1/objects/list?${params}`);
}

export function saveObject(
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

export function activateObject(
  objectName: string,
  objectType: string,
): Promise<ActivationResult> {
  return fetchJSON('/api/v1/activate', {
    method: 'POST',
    body: JSON.stringify({
      object_name: objectName,
      object_type: objectType,
    }),
  });
}

export function syntaxCheck(
  objectName: string,
  objectType: string,
  source: string,
): Promise<SyntaxCheckResult> {
  return fetchJSON('/api/v1/syntax-check', {
    method: 'POST',
    body: JSON.stringify({
      object_name: objectName,
      object_type: objectType,
      source,
    }),
  });
}
