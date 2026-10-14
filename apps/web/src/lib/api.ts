import { getSessionStore, type AuthSession } from './sessionStore';
import { resolveTenantHost } from './tenantHost';

export type { AuthSession } from './sessionStore';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '/api/v1';

/**
 * Host sent as X-Tenant-Host for the local Vite → API proxy.
 * Prefer the live subdomain; fall back to stored host only for tenant sessions.
 * Platform sessions on apex must not invent a company host.
 */
export function getTenantHost() {
  return resolveTenantHost() || getSessionStore().getTenantHost() || '';
}

export function setTenantHost(host: string) {
  getSessionStore().setTenantHost(host);
}

export function clearTenantHost() {
  getSessionStore().clearTenantHost();
}

export function loadSession(): AuthSession | null {
  return getSessionStore().load();
}

export function saveSession(session: AuthSession | null) {
  getSessionStore().save(session);
}

export type ApiErrorBody = {
  statusCode?: number;
  code?: string;
  message?: string | string[];
  requestId?: string;
};

async function parseError(response: Response) {
  try {
    const body = (await response.json()) as ApiErrorBody;
    if (Array.isArray(body.message)) return body.message.join(', ');
    if (body.message) {
      return body.code ? `${body.message} (${body.code})` : body.message;
    }
    return response.statusText;
  } catch {
    return response.statusText;
  }
}

function shouldOmitTenantHost(path: string, session: AuthSession | null) {
  if (path.startsWith('/auth/platform/')) return true;
  if (session?.audience === 'platform' && path.startsWith('/platform/')) {
    // Host-bound current/* still need a tenant host when intentionally set.
    if (path.includes('/current/') || path.endsWith('/entitlements/current')) {
      return false;
    }
    return true;
  }
  return false;
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

  const session = loadSession();
  let host: string | null | undefined = tenantHost;
  if (host === undefined) {
    host = shouldOmitTenantHost(path, session) ? '' : getTenantHost();
  }
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

/** Download a binary response (export files). */
export async function apiDownload(
  path: string,
  token?: string | null,
  filenameFallback = 'download',
) {
  const headers = new Headers();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const host = getTenantHost();
  if (host) headers.set('X-Tenant-Host', host);

  const response = await fetch(`${API_BASE}${path}`, { headers });
  if (!response.ok) {
    throw new Error(await parseError(response));
  }
  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const match = /filename="?([^"]+)"?/i.exec(disposition);
  const filename = match?.[1] ?? filenameFallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
