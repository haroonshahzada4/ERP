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
    tenant: { id: string; slug: string; name: string };
    membershipId: string;
    roles: string[];
    permissions: string[];
    isPlatformAdmin?: boolean;
  },
): AuthSession {
  return {
    ...existing,
    user: me.user,
    tenant: { ...existing.tenant, ...me.tenant },
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
    // Drop sessions that don't belong to the current company subdomain.
    if (
      host &&
      existing.tenant &&
      !hostMatchesTenant(host, existing.tenant)
    ) {
      saveSession(null);
      clearTenantHost();
      setLoading(false);
      return;
    }

    setSession(existing);
    apiGet<{
      user: AuthSession['user'];
      tenant: { id: string; slug: string; name: string };
      membershipId: string;
      roles: string[];
      permissions: string[];
      isPlatformAdmin?: boolean;
    }>('/auth/me', existing.accessToken)
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
        saveSession(result);
        setSession(result);
      },
      async platformLogin(email, password) {
        const result = await apiPost<AuthSession>(
          '/auth/platform/login',
          { email, password },
          null,
          '',
        );
        if (result.tenant.host) setTenantHost(result.tenant.host);
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
        setSession(null);
      },
      hasPermission(key) {
        if (!session) return false;
        const isPlatformKey =
          key === '*' || key === 'platform:*' || key.startsWith('platform.');
        // Super Admin / platform:* never auto-grants tenant data permissions.
        if (isPlatformKey) {
          return (
            !!session.isPlatformAdmin ||
            session.permissions.includes('platform:*') ||
            session.permissions.includes('*') ||
            session.permissions.includes(key)
          );
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
          tenant: { id: string; slug: string; name: string };
          membershipId: string;
          roles: string[];
          permissions: string[];
          isPlatformAdmin?: boolean;
        }>('/auth/me', session.accessToken);
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
