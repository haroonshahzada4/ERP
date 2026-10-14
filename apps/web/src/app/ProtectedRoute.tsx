import { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { hostMatchesTenant, resolveTenantHost } from '../lib/tenantHost';

export function ProtectedRoute() {
  const { session, loading, logout } = useAuth();
  const location = useLocation();
  const host = resolveTenantHost();
  const onPlatform = location.pathname.startsWith('/platform');

  const hostMismatch =
    !!session &&
    session.audience !== 'platform' &&
    !!host &&
    !!session.tenant &&
    !hostMatchesTenant(host, session.tenant);
  const apexNonAdmin = !!session && !host && !session.isPlatformAdmin;
  const platformOnTenantHost =
    !!session && session.audience === 'platform' && !!host;

  useEffect(() => {
    if (hostMismatch || apexNonAdmin || platformOnTenantHost) {
      void logout();
    }
  }, [hostMismatch, apexNonAdmin, platformOnTenantHost, logout]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[var(--erp-bg)] text-[var(--erp-muted)]">
        Loading session…
      </div>
    );
  }

  if (!session || hostMismatch || apexNonAdmin || platformOnTenantHost) {
    if (onPlatform) return <Navigate to="/platform/login" replace />;
    return <Navigate to="/login" replace />;
  }

  // Apex (localhost) is only for Platform Super Admin console.
  if (!host && !onPlatform) {
    return <Navigate to="/platform" replace />;
  }

  // Platform console is Super Admin only.
  if (onPlatform && !session.isPlatformAdmin) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
