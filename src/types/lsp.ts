export enum ConnectionStatus {
  Connected = 'connected',
  Offline = 'offline',
  Error = 'error',
  Connecting = 'connecting',
}

export interface LSPConfig {
  lspEnabled: boolean;
  lspUrl: string;
  lspMode: 'websocket' | 'disabled';
}
