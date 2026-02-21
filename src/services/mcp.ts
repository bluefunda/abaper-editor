import type { MCPRequest, MCPResponse, MCPToolCallResult } from '../types/mcp';
import { getToken, getRealm, refreshToken } from './auth';

let nextId = 1;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const realm = getRealm();
  if (realm) headers['X-Realm'] = realm;
  return headers;
}

// --- SSE Transport (abaper-mcp: legacy SSE) ---

export class SSEMCPClient {
  private eventSource: EventSource | null = null;
  private sessionUrl: string | null = null;
  private baseUrl: string = '';
  private pendingRequests = new Map<
    number | string,
    { resolve: (v: MCPToolCallResult) => void; reject: (e: Error) => void }
  >();

  async connect(baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl.replace(/\/+$/, '');

    return new Promise((resolve, reject) => {
      const token = getToken();
      const realm = getRealm();
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (realm) params.set('realm', realm);

      const sseUrl = `${this.baseUrl}/sse${params.toString() ? '?' + params : ''}`;
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.addEventListener('endpoint', (e: MessageEvent) => {
        // The server sends the POST endpoint for messages
        const endpoint = e.data as string;
        this.sessionUrl = endpoint.startsWith('http')
          ? endpoint
          : `${this.baseUrl}${endpoint}`;
        resolve();
      });

      this.eventSource.addEventListener('message', (e: MessageEvent) => {
        try {
          const response: MCPResponse = JSON.parse(e.data);
          const pending = this.pendingRequests.get(response.id);
          if (pending) {
            this.pendingRequests.delete(response.id);
            if (response.error) {
              pending.reject(new Error(response.error.message));
            } else if (response.result) {
              pending.resolve(response.result);
            }
          }
        } catch {
          // ignore non-JSON messages
        }
      });

      this.eventSource.onerror = () => {
        if (!this.sessionUrl) {
          reject(new Error('Failed to connect to MCP server'));
        }
      };
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.sessionUrl) {
      throw new Error('SSE client not connected. Call connect() first.');
    }
    await refreshToken();

    const id = nextId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });

      fetch(this.sessionUrl!, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(request),
      }).catch((err) => {
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  disconnect(): void {
    this.eventSource?.close();
    this.eventSource = null;
    this.sessionUrl = null;
    for (const [, pending] of this.pendingRequests) {
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
  }

  get connected(): boolean {
    return this.sessionUrl !== null;
  }
}

// --- Streamable HTTP Transport (github-mcp via supergateway) ---

export class StreamableHTTPClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    await refreshToken();

    const id = nextId++;
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args },
    };

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`MCP HTTP error ${res.status}: ${text}`);
    }

    const response: MCPResponse = await res.json();
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result!;
  }
}

// --- Singleton instances ---

const MCP_BASE = import.meta.env.VITE_API_BASE_URL as string || '';

export const abaperMCP = new SSEMCPClient();
export const githubMCP = new StreamableHTTPClient(`${MCP_BASE}/mcp/github`);

export async function initMCP(): Promise<void> {
  try {
    await abaperMCP.connect(`${MCP_BASE}/mcp/abaper`);
  } catch (err) {
    console.warn('Failed to connect to abaper-mcp:', err);
  }
}

/** Extract text from MCP tool call result */
export function extractText(result: MCPToolCallResult): string {
  return result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}
