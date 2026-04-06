import { getToken, getRealm } from './auth';

const TELEMETRY_URL = import.meta.env.VITE_API_BASE_URL as string || 'https://api.bluefunda.com';

interface TelemetryEvent {
  event: string;
  properties?: Record<string, string | number | boolean>;
}

export function track(event: string, properties?: Record<string, string | number | boolean>): void {
  try {
    const token = getToken();
    const realm = getRealm();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (realm) headers['X-Realm'] = realm;

    const body: TelemetryEvent = {
      event,
      properties: {
        ...properties,
        client: 'editor',
        platform: navigator.platform,
        locale: navigator.language,
      },
    };

    fetch(`${TELEMETRY_URL}/abaper/telemetry`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch {
    // Telemetry should never break the app
  }
}
