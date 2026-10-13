import { resolveTenantHost } from './tenantHost';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

export type AuthSession = {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; fullName: string };
  tenant: { id: string; slug: string; host?: string; name?: string };
  membershipId: string;
  roles: string[];
  permissions: string[];
  isPlatformAdmin?: boolean;
};

const STORAGE_KEY = 'erp.auth';
const TENANT_HOST_KEY = 'erp.tenantHost';

/**
 * Host sent as X-Tenant-Host for the local Vite → API proxy.
 * Prefer the live subdomain; fall back to the session-bound host
 * (Platform Super Admin on localhost).
 */
export function getTenantHost() {
  return resolveTenantHost() || localStorage.getItem(TENANT_HOST_KEY) || '';
}

export function setTenantHost(host: string) {
  localStorage.setItem(TENANT_HOST_KEY, host);
}

export function clearTenantHost() {
  localStorage.removeItem(TENANT_HOST_KEY);
}

export function loadSession(): AuthSession | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession | null) {
  if (!session) {
    localStorage.removeItem(STORAGE_KEY);
    return;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  if (session.tenant.host) setTenantHost(session.tenant.host);
}

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(body.message)) return body.message.join(', ');
    return body.message ?? response.statusText;
  } catch {
    return response.statusText;
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
  tenantHost?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const host = tenantHost !== undefined ? tenantHost : getTenantHost();
  if (host) headers.set('X-Tenant-Host', host);

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function apiGet<T>(
  path: string,
  token?: string | null,
  tenantHost?: string | null,
) {
  return apiRequest<T>(path, { method: 'GET' }, token, tenantHost);
}

export async function apiPost<T>(
  path: string,
  body?: unknown,
  token?: string | null,
  tenantHost?: string | null,
) {
  return apiRequest<T>(
    path,
    { method: 'POST', body: body ? JSON.stringify(body) : undefined },
    token,
    tenantHost,
  );
}

export async function apiPatch<T>(
  path: string,
  body?: unknown,
  token?: string | null,
  tenantHost?: string | null,
) {
  return apiRequest<T>(
    path,
    { method: 'PATCH', body: body ? JSON.stringify(body) : undefined },
    token,
    tenantHost,
  );
}

export async function apiPut<T>(
  path: string,
  body?: unknown,
  token?: string | null,
  tenantHost?: string | null,
) {
  return apiRequest<T>(
    path,
    { method: 'PUT', body: body ? JSON.stringify(body) : undefined },
    token,
    tenantHost,
  );
}

export async function apiDelete<T>(
  path: string,
  token?: string | null,
  tenantHost?: string | null,
) {
  return apiRequest<T>(path, { method: 'DELETE' }, token, tenantHost);
}
