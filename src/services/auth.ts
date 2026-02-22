import Keycloak from 'keycloak-js';

const KEYCLOAK_URL = import.meta.env.VITE_KEYCLOAK_URL as string || 'https://auth.bluefunda.com';
const CLIENT_ID = import.meta.env.VITE_KEYCLOAK_CLIENT_ID as string || 'abaper-editor';

/**
 * Extract realm from URL path. Pattern: /<realm>/...
 * e.g. /trm → "trm", /individual → "individual", /simplistek → "simplistek"
 * Falls back to redirecting to /trm if no realm in path.
 */
export function getRealmFromPath(): string | null {
  const segments = window.location.pathname.split('/').filter(Boolean);
  return segments[0] ?? null;
}

let keycloak: Keycloak | null = null;
let initialized = false;

const SKIP_AUTH = import.meta.env.VITE_SKIP_AUTH === 'true';

export async function initAuth(): Promise<boolean> {
  if (SKIP_AUTH) {
    console.log('[auth] Skipping Keycloak (VITE_SKIP_AUTH=true)');
    initialized = true;
    return true;
  }

  const realm = getRealmFromPath();

  if (!realm) {
    // No realm in path — redirect to /trm as default
    window.location.replace('/trm');
    return false;
  }

  keycloak = new Keycloak({
    url: KEYCLOAK_URL,
    realm,
    clientId: CLIENT_ID,
  });

  if (initialized) return keycloak.authenticated ?? false;

  const authenticated = await keycloak.init({
    onLoad: 'login-required',
    checkLoginIframe: false,
    pkceMethod: 'S256',
  });

  initialized = true;

  keycloak.onTokenExpired = () => {
    keycloak!.updateToken(30).catch(() => {
      // Token refresh failed — next API call will get a 401
      // Don't force a redirect here; let the user continue working
      console.warn('Token refresh failed; session may have expired');
    });
  };

  return authenticated;
}

export function getToken(): string | undefined {
  return keycloak?.token;
}

export function getUsername(): string | undefined {
  return keycloak?.tokenParsed?.preferred_username as string | undefined;
}

export function getRealm(): string | null {
  return getRealmFromPath();
}

export function getRoles(): string[] {
  return keycloak?.tokenParsed?.realm_access?.roles ?? [];
}

export function logout(): void {
  const realm = getRealmFromPath();
  keycloak?.logout({ redirectUri: `${window.location.origin}/${realm ?? ''}` });
}

export async function refreshToken(): Promise<boolean> {
  if (!keycloak) return false;
  try {
    return await keycloak.updateToken(30);
  } catch {
    // Don't redirect mid-API-call — let the caller handle the 401
    return false;
  }
}

export { keycloak };
