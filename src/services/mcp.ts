import type { MCPRequest, MCPResponse, MCPToolCallResult, MCPToolInfo } from '../types/mcp';
import { getToken, getRealm, refreshToken } from './auth';
import { useAIStore } from '../stores/aiStore';

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
  private initialized = false;
  private pendingRequests = new Map<
    number | string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  async connect(baseUrl: string): Promise<void> {
    this.baseUrl = baseUrl.replace(/\/+$/, '');

    // Step 1: Connect SSE and get the session endpoint
    await new Promise<void>((resolve, reject) => {
      const token = getToken();
      const realm = getRealm();
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (realm) params.set('realm', realm);

      const sseUrl = `${this.baseUrl}/sse${params.toString() ? '?' + params : ''}`;
      this.eventSource = new EventSource(sseUrl);

      this.eventSource.addEventListener('endpoint', (e: MessageEvent) => {
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

    // Step 2: Send initialize request
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'abaper-editor', version: '0.1.0' },
    });
    console.log('MCP initialized:', initResult);

    // Step 3: Send initialized notification (no id = notification)
    await fetch(this.sessionUrl!, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    this.initialized = true;
  }

  private sendRequest(method: string, params: Record<string, unknown>, timeoutMs = 300_000): Promise<unknown> {
    if (!this.sessionUrl) {
      return Promise.reject(new Error('SSE client not connected'));
    }

    const id = nextId++;
    const request: MCPRequest = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timed out after ${timeoutMs / 1000}s`));
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: (v) => { clearTimeout(timer); resolve(v); },
        reject: (e) => { clearTimeout(timer); reject(e); },
      });

      fetch(this.sessionUrl!, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(request),
      }).catch((err) => {
        clearTimeout(timer);
        this.pendingRequests.delete(id);
        reject(err);
      });
    });
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.initialized) {
      throw new Error('SSE client not initialized. Call connect() first.');
    }
    await refreshToken();

    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result as MCPToolCallResult;
  }

  async listTools(): Promise<MCPToolInfo[]> {
    if (!this.initialized) {
      throw new Error('SSE client not initialized. Call connect() first.');
    }
    const result = await this.sendRequest('tools/list', {}) as { tools?: { name: string; description?: string }[] };
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
    }));
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
    return this.initialized;
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
    useAIStore.getState().setMcpConnected(true);

    // Fetch available tools
    try {
      const tools = await abaperMCP.listTools();
      useAIStore.getState().setMcpTools(tools);
      console.log(`MCP: ${tools.length} tools available`);
    } catch (err) {
      console.warn('Failed to list MCP tools:', err);
    }
  } catch (err) {
    console.warn('Failed to connect to abaper-mcp:', err);
    useAIStore.getState().setMcpConnected(false);
  }
}

/** Extract text from MCP tool call result.
 *  If the text content is JSON with structured data, build a concise summary. */
export function extractText(result: MCPToolCallResult): string {
  const raw = result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');

  try {
    const parsed = JSON.parse(raw);

    // S/4 remediation report — build concise output
    if (parsed.json?.artifact) {
      const { artifact, issues, run_metadata } = parsed.json;
      const name = artifact.artifact_name || 'Unknown';
      const type = artifact.artifact_type || '';
      const lines: string[] = [`**${type} ${name}**`];

      if (!issues || issues.length === 0) {
        lines.push('No S/4HANA compatibility issues detected.');
      } else {
        lines.push(`${issues.length} issue(s) found:\n`);
        for (const issue of issues) {
          const sev = issue.severity === 'high' ? 'Error' : issue.severity === 'medium' ? 'Warning' : 'Info';
          lines.push(`- **${sev}** (line ${issue.line || '?'}): ${issue.title || issue.pattern}`);
          if (issue.description) lines.push(`  ${issue.description}`);
          if (issue.after) lines.push(`  Fix: \`${issue.after}\``);
        }
      }

      if (run_metadata?.timestamp_utc) {
        lines.push(`\n_Analyzed ${run_metadata.timestamp_utc}_`);
      }
      return lines.join('\n');
    }

    // Generic JSON with markdown — return markdown
    if (parsed.markdown && typeof parsed.markdown === 'string') {
      return parsed.markdown;
    }
  } catch {
    // Not JSON — return raw text
  }
  return raw;
}

/** Extract raw JSON from MCP tool call result */
export function extractJSON<T = unknown>(result: MCPToolCallResult): T | null {
  const raw = result.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
  try {
    const parsed = JSON.parse(raw);
    return (parsed.json ?? parsed) as T;
  } catch {
    return null;
  }
}
