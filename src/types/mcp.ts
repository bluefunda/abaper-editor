// MCP JSON-RPC protocol types

export interface MCPRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: number | string;
  result?: MCPToolCallResult;
  error?: { code: number; message: string; data?: unknown };
}

export interface MCPToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
}

export interface MCPToolCallResult {
  content: { type: string; text: string }[];
  isError?: boolean;
}

// MCP tool info returned by tools/list
export interface MCPToolInfo {
  name: string;
  description: string;
}

// abaper-mcp tool names
export type ABAPToolName =
  | 'get-object'
  | 'search-objects'
  | 'list-packages'
  | 'test-connection'
  | 'create-program'
  | 'create-class'
  | 'update-program'
  | 'update-class'
  | 'activate-object'
  | 'run-unit-tests'
  | 'analyze-s4-remediation'
  | 'syntax-check'
  | 'format-code'
  | 'transport-info'
  | 'create-transport';

// Key github-mcp tool names
export type GitHubToolName =
  | 'search_repositories'
  | 'list_branches'
  | 'list_commits'
  | 'get_file_contents'
  | 'create_or_update_file'
  | 'create_pull_request'
  | 'list_pull_requests'
  | 'get_pull_request'
  | 'create_issue'
  | 'list_issues'
  | 'create_branch';

// AI chat message
export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  toolCalls?: { name: string; args: Record<string, unknown>; result?: string }[];
  isStreaming?: boolean;
}

// S/4HANA remediation types
export interface S4RemediationIssue {
  severity: 'high' | 'medium' | 'low';
  pattern: string;
  title: string;
  line: number;
  description: string;
  before: string;
  after: string;
}

export interface S4RemediationResult {
  objectName: string;
  objectType: string;
  totalIssues: number;
  issues: S4RemediationIssue[];
}

// Code review finding
export interface ReviewFinding {
  severity: 'error' | 'warning' | 'info';
  message: string;
  line: number;
  suggestion?: string;
}
