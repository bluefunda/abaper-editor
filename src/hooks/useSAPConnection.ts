import { useEffect } from 'react';
import { useConnectionStore } from '../stores/connectionStore';
import { checkConnection } from '../services/connection';
import { setBaseUrl } from '../services/api';

export function useSAPConnection() {
  const backendUrl = useConnectionStore((s) => s.backendUrl);
  const setStatus = useConnectionStore((s) => s.setStatus);

  useEffect(() => {
    setBaseUrl(backendUrl);

    const poll = async () => {
      const status = await checkConnection();
      setStatus(status);
    };

    poll();
    const interval = setInterval(poll, 10_000);
    return () => clearInterval(interval);
  }, [backendUrl, setStatus]);
}
