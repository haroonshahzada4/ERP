/**
 * Session persistence abstraction.
 * Local: localStorage (disposable accounts).
 * Pre-prod: swap implementation to httpOnly cookie + CSRF without rewriting callers.
 */

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string };
  audience?: 'platform' | 'tenant';
  tenant: { id: string; slug: string; host?: string; name?: string } | null;
  membershipId: string | null;
  roles: string[];
  permissions: string[];
  isPlatformAdmin?: boolean;
};

const STORAGE_KEY = 'erp.auth';
const TENANT_HOST_KEY = 'erp.tenantHost';

export interface SessionStore {
  load(): AuthSession | null;
  save(session: AuthSession | null): void;
  getTenantHost(): string;
  setTenantHost(host: string): void;
  clearTenantHost(): void;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Default local implementation — replaceable before production cookie cutover. */
export const localSessionStore: SessionStore = {
  load() {
    return readJson<AuthSession>(STORAGE_KEY);
  },
  save(session) {
    if (!session) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    // Only bind tenant host for tenant sessions — never force platform onto a company host.
    if (session.audience !== 'platform' && session.tenant?.host) {
      localStorage.setItem(TENANT_HOST_KEY, session.tenant.host);
    }
  },
  getTenantHost() {
    return localStorage.getItem(TENANT_HOST_KEY) || '';
  },
  setTenantHost(host: string) {
    localStorage.setItem(TENANT_HOST_KEY, host);
  },
  clearTenantHost() {
    localStorage.removeItem(TENANT_HOST_KEY);
  },
};

let activeStore: SessionStore = localSessionStore;

export function getSessionStore() {
  return activeStore;
}

/** Swap for cookie-backed store before production. */
export function setSessionStore(store: SessionStore) {
  activeStore = store;
}
