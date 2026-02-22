export interface ADTSourceCode {
  object_name: string;
  object_type: string;
  source: string;
  version: string;
  etag: string;
}

export interface ADTObject {
  name: string;
  type: string;
  description: string;
  package: string;
  responsible: string;
  created_by: string;
  changed_by: string;
}

export interface SyntaxCheckResult {
  object_name: string;
  object_type: string;
  messages: SyntaxCheckMessage[];
}

export interface SyntaxCheckMessage {
  severity: 'error' | 'warning' | 'info' | 'hint';
  text: string;
  line: number;
  column: number;
  end_line: number;
  end_col: number;
  code?: string;
}

export interface ActivationResult {
  object_name: string;
  object_type: string;
  success: boolean;
  messages?: { severity: string; text: string; line?: number }[];
}

export interface PackageNode {
  name: string;
  type: string;
  description: string;
  expandable: boolean;
  uri: string;
}

export interface PackageContentsResult {
  nodes: PackageNode[];
  objectTypes: { type: string; label: string }[];
}

export interface CompletionProposal {
  identifier: string;
  kind: number;
  insert_text: string;
}

export interface TransportEntry {
  transport: string;
  description: string;
  owner: string;
  status: string;
}

export interface TransportInfo {
  local: boolean;
  package_name: string;
  transports: TransportEntry[];
}
