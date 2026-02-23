import type { MCPRequest, MCPResponse, MCPToolCallResult, MCPToolInfo } from '../types/mcp';
import { getToken, getRealm, refreshToken } from './auth';
import { useAIStore } from '../stores/aiStore';

let nextId = 1;

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json, text/event-stream',
  };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const realm = getRealm();
  if (realm) headers['X-Realm'] = realm;
  return headers;
}

// --- Streamable HTTP Transport ---

export class StreamableHTTPClient {
  private baseUrl: string;
  private sessionId: string | null = null;
  private initialized = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
  }

  async connect(): Promise<void> {
    // Step 1: Send initialize request
    const initResult = await this.sendRequest('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'abaper-editor', version: '0.1.0' },
    });
    console.log('MCP initialized:', initResult);

    // Step 2: Send initialized notification (no id = notification)
    await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        ...(this.sessionId ? { 'Mcp-Session-Id': this.sessionId } : {}),
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    });

    this.initialized = true;
  }

  private async sendRequest(method: string, params: Record<string, unknown>): Promise<unknown> {
    await refreshToken();

    const id = nextId++;
    const request: MCPRequest = { jsonrpc: '2.0', id, method, params };

    const headers: Record<string, string> = authHeaders();
    if (this.sessionId) {
      headers['Mcp-Session-Id'] = this.sessionId;
    }

    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(request),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      throw new Error(`MCP HTTP error ${res.status}: ${text}`);
    }

    // Capture session ID from response header
    const sid = res.headers.get('Mcp-Session-Id');
    if (sid) {
      this.sessionId = sid;
    }

    const response = await this.parseResponse(res);
    if (response.error) {
      throw new Error(response.error.message);
    }
    return response.result;
  }

  /** Parse response body — handles both application/json and text/event-stream (SSE). */
  private async parseResponse(res: Response): Promise<MCPResponse> {
    const ct = res.headers.get('Content-Type') ?? '';
    if (ct.includes('text/event-stream')) {
      const text = await res.text();
      // SSE format: "event: message\ndata: {json}\n\n"
      for (const line of text.split('\n')) {
        if (line.startsWith('data: ')) {
          return JSON.parse(line.slice(6));
        }
      }
      throw new Error('No data in SSE response');
    }
    return res.json();
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized. Call connect() first.');
    }
    const result = await this.sendRequest('tools/call', { name, arguments: args });
    return result as MCPToolCallResult;
  }

  async listTools(): Promise<MCPToolInfo[]> {
    if (!this.initialized) {
      throw new Error('MCP client not initialized. Call connect() first.');
    }
    const result = await this.sendRequest('tools/list', {}) as { tools?: { name: string; description?: string }[] };
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? '',
    }));
  }

  disconnect(): void {
    this.sessionId = null;
    this.initialized = false;
  }

  get connected(): boolean {
    return this.initialized;
  }
}

// --- Singleton instances ---

const MCP_BASE = import.meta.env.VITE_API_BASE_URL as string || '';

export const abaperAgent = new StreamableHTTPClient(`${MCP_BASE}/ai/agent`);
export const githubAgent = new StreamableHTTPClient(`${MCP_BASE}/ai/agent/github`);

export async function initAgent(): Promise<void> {
  try {
    await abaperAgent.connect();
    useAIStore.getState().setMcpConnected(true);

    // Fetch available tools
    try {
      const tools = await abaperAgent.listTools();
      useAIStore.getState().setMcpTools(tools);
      console.log(`Agent: ${tools.length} tools available`);
    } catch (err) {
      console.warn('Failed to list agent tools:', err);
    }
  } catch (err) {
    console.warn('Failed to connect to agent:', err);
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
