import { useEffect } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { useSystemStore } from '../stores/systemStore';
import { checkConnection } from '../services/connection';
import { setBaseUrl, fetchJSONForSystem } from '../services/api';

export function useSAPConnection() {
  const backendUrl = useConnectionStore((s) => s.backendUrl);
  const setStatus = useConnectionStore((s) => s.setStatus);

  useEffect(() => {
    // In dev mode, use relative URLs so Vite proxy handles API calls
    setBaseUrl(import.meta.env.DEV ? '' : backendUrl);

    const poll = async () => {
      const status = await checkConnection();
      setStatus(status);

      // Read systems from store snapshot (not from React state) to avoid re-render loops
      const { systems, setSystemStatus } = useSystemStore.getState();
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
  }, [backendUrl, setStatus]);
}
