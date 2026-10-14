import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  apiGet,
  apiPost,
  clearTenantHost,
  loadSession,
  saveSession,
  setTenantHost,
  type AuthSession,
} from './api';
import { hostMatchesTenant, resolveTenantHost } from './tenantHost';

type AuthContextValue = {
  session: AuthSession | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  platformLogin: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (key: string) => boolean;
  refreshMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function applySession(
  existing: AuthSession,
  me: {
    user: AuthSession['user'];
    audience?: 'platform' | 'tenant';
    tenant: { id: string; slug: string; name: string } | null;
    membershipId: string | null;
    roles: string[];
    permissions: string[];
    isPlatformAdmin?: boolean;
  },
): AuthSession {
  return {
    ...existing,
    user: me.user,
    audience: me.audience ?? existing.audience,
    tenant: me.tenant
      ? { ...(existing.tenant ?? { id: '', slug: '' }), ...me.tenant }
      : null,
    membershipId: me.membershipId,
    roles: me.roles,
    permissions: me.permissions,
    isPlatformAdmin: me.isPlatformAdmin,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const existing = loadSession();
    if (!existing) {
      setLoading(false);
      return;
    }

    const host = resolveTenantHost();
    // Drop tenant sessions that don't belong to the current company subdomain.
    if (
      existing.audience !== 'platform' &&
      host &&
      existing.tenant &&
      !hostMatchesTenant(host, existing.tenant)
    ) {
      saveSession(null);
      clearTenantHost();
      setLoading(false);
      return;
    }

    // Platform session on a company subdomain is not valid for tenant UX.
    if (existing.audience === 'platform' && host) {
      saveSession(null);
      clearTenantHost();
      setLoading(false);
      return;
    }

    setSession(existing);
    apiGet<{
      user: AuthSession['user'];
      audience?: 'platform' | 'tenant';
      tenant: { id: string; slug: string; name: string } | null;
      membershipId: string | null;
      roles: string[];
      permissions: string[];
      isPlatformAdmin?: boolean;
    }>('/auth/me', existing.accessToken, existing.audience === 'platform' ? '' : undefined)
      .then((me) => {
        const next = applySession(existing, me);
        saveSession(next);
        setSession(next);
      })
      .catch(() => {
        saveSession(null);
        setSession(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      loading,
      async login(email, password) {
        const host = resolveTenantHost();
        if (!host) {
          throw new Error('Open your company workspace URL to sign in');
        }
        setTenantHost(host);
        const result = await apiPost<AuthSession>(
          '/auth/login',
          { email, password },
          null,
          host,
        );
        result.audience = result.audience ?? 'tenant';
        saveSession(result);
        setSession(result);
      },
      async platformLogin(email, password) {
        clearTenantHost();
        const result = await apiPost<AuthSession>(
          '/auth/platform/login',
          { email, password },
          null,
          '',
        );
        result.audience = 'platform';
        result.tenant = null;
        result.membershipId = null;
        saveSession(result);
        setSession(result);
      },
      async logout() {
        if (session?.refreshToken) {
          await apiPost('/auth/logout', {
            refreshToken: session.refreshToken,
          }).catch(() => undefined);
        }
        saveSession(null);
        clearTenantHost();
        setSession(null);
      },
      hasPermission(key) {
        if (!session) return false;
        const isPlatformKey =
          key === '*' || key === 'platform:*' || key.startsWith('platform.');
        if (isPlatformKey) {
          return (
            !!session.isPlatformAdmin ||
            session.permissions.includes('platform:*') ||
            session.permissions.includes('*') ||
            session.permissions.includes(key)
          );
        }
        if (session.audience === 'platform') {
          return session.permissions.includes(key);
        }
        if (session.permissions.includes('tenant:*')) return true;
        if (
          session.roles.includes('company_admin') ||
          session.roles.includes('tenant_admin')
        ) {
          return true;
        }
        return session.permissions.includes(key);
      },
      async refreshMe() {
        if (!session) return;
        const me = await apiGet<{
          user: AuthSession['user'];
          audience?: 'platform' | 'tenant';
          tenant: { id: string; slug: string; name: string } | null;
          membershipId: string | null;
          roles: string[];
          permissions: string[];
          isPlatformAdmin?: boolean;
        }>(
          '/auth/me',
          session.accessToken,
          session.audience === 'platform' ? '' : undefined,
        );
        const next = applySession(session, me);
        saveSession(next);
        setSession(next);
      },
    }),
    [session, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
