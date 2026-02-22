import { useEffect } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useSystemStore } from '../stores/systemStore';
import { checkConnection } from '../services/connection';
import { setBaseUrl, fetchJSONForSystem } from '../services/api';

export function useSAPConnection() {
  const backendUrl = useConnectionStore((s) => s.backendUrl);
  const setStatus = useConnectionStore((s) => s.setStatus);
  const systems = useSystemStore((s) => s.systems);
  const setSystemStatus = useSystemStore((s) => s.setSystemStatus);

  useEffect(() => {
    // In dev mode, use relative URLs so Vite proxy handles API calls
    setBaseUrl(import.meta.env.DEV ? '' : backendUrl);

    const poll = async () => {
      const status = await checkConnection();
      setStatus(status);

      // Poll each configured system
      for (const sys of systems) {
        try {
          setSystemStatus(sys.id, 'checking');
          const result = await fetchJSONForSystem<{ success: boolean }>(
            sys,
            '/api/v1/system/connect',
            { method: 'POST' },
          );
          setSystemStatus(sys.id, result.success ? 'connected' : 'disconnected');
        } catch {
          setSystemStatus(sys.id, 'disconnected');
        }
      }
    };

    poll();
    const interval = setInterval(poll, 15_000);
    return () => clearInterval(interval);
  }, [backendUrl, setStatus, systems.length, setSystemStatus]);
}
