import { healthCheck } from './api';
import { ConnectionStatus } from '../types/lsp';

export async function checkConnection(): Promise<ConnectionStatus> {
  try {
    await healthCheck();
    return ConnectionStatus.Connected;
  } catch {
    return ConnectionStatus.Offline;
  }
}
