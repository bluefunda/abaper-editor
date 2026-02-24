import { getToken, getRealm, keycloak } from './auth';

// --- Types ---

export interface ChatRequest {
  chat_id: string;
  prompt: string;
  model: string;
  agent_name: string;
  mcp_server_name: string;
  is_new_chat: boolean;
}

export interface ChatEvent {
  type: 'stream_start' | 'stream_chunk' | 'stream_end' | 'stream_heartbeat' | 'stream_progress' | 'stream_stopped' | 'error' | 'stream_error' | 'stream_tool_execution' | 'stream_artifact';
  content?: string;
  full_content?: string;
  error?: string;
  message?: string;
  session_id?: string;
  tools?: string[];
  iteration?: number;
  // stream_tool_execution fields
  tool_name?: string;
  status?: string;
  duration_ms?: number;
  result_summary?: string;
  // stream_artifact fields
  artifact_name?: string;
  artifact_type?: string;
  action?: string;
  success?: boolean;
}

// --- SSE Streaming ---

/**
 * Stream a chat request to the CAI-GW and invoke `onEvent` for each parsed SSE event.
 * The caller should wire an AbortController signal for cancellation.
 */
export async function streamChat(
  req: ChatRequest,
  signal: AbortSignal,
  onEvent: (ev: ChatEvent) => void,
): Promise<void> {
  const token = getToken();
  const realm = getRealm();

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (realm) headers['X-Realm'] = realm;
  if (keycloak?.subject) headers['x-user'] = keycloak.subject;

  const response = await fetch(`/ai/chats/${req.chat_id}`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      prompt: req.prompt,
      model: req.model,
      agentName: req.agent_name,
      mcpServerName: req.mcp_server_name,
      isNewChat: req.is_new_chat,
    }),
    signal,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`CAI request failed (${response.status}): ${text || response.statusText}`);
  }

  if (!response.body) {
    throw new Error('No response body — SSE streaming unavailable');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Split on newlines — keep the last partial line in the buffer
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        // Strip SSE "data: " prefix
        let jsonStr = line;
        if (line.startsWith('data: ')) {
          jsonStr = line.substring(6);
        } else if (line.startsWith('data:')) {
          jsonStr = line.substring(5);
        }

        if (!jsonStr.trim()) continue;

        // Skip SSE comments (lines starting with :)
        if (jsonStr.startsWith(':')) continue;

        try {
          const parsed: ChatEvent = JSON.parse(jsonStr);
          onEvent(parsed);
        } catch {
          // Non-JSON line — skip silently
          console.debug('[cai] non-JSON SSE line:', line);
        }
      }
    }

    // Process any remaining buffer
    if (buffer.trim()) {
      let jsonStr = buffer;
      if (buffer.startsWith('data: ')) jsonStr = buffer.substring(6);
      else if (buffer.startsWith('data:')) jsonStr = buffer.substring(5);
      if (jsonStr.trim() && !jsonStr.startsWith(':')) {
        try {
          const parsed: ChatEvent = JSON.parse(jsonStr);
          onEvent(parsed);
        } catch {
          // ignore
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
