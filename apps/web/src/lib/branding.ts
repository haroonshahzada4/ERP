import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiGet } from './api';
import { useAuth } from './auth';
import { useTheme, type Branding } from './theme';

export type TenantBranding = Required<Omit<Branding, 'logoUrl'>> & {
  slug: string;
  logoUrl: string | null;
};

/**
 * Loads the signed-in tenant's branding (available to EVERY user, not only
 * admins) and feeds it to the theme engine.
 */
export function useTenantBranding() {
  const { session } = useAuth();
  const { setBranding } = useTheme();

  const query = useQuery({
    queryKey: ['tenant-branding', session?.tenant?.slug],
    queryFn: () =>
      apiGet<TenantBranding>('/platform/tenants/current/branding', session?.accessToken),
    enabled: !!session && session.audience !== 'platform' && !!session.tenant,
    staleTime: 5 * 60_000,
  });

  useEffect(() => {
    if (query.data) setBranding(query.data);
  }, [query.data, setBranding]);

  return query;
}
