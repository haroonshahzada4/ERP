import { useQuery } from '@tanstack/react-query';
import { apiGet } from './api';
import { useAuth } from './auth';

export type CurrentEntitlements = {
  enabledFeatures: string[];
  planSlug: string | null;
  subscriptionStatus?: string | null;
  tenantStatus?: string | null;
};

/** Route / nav item → required feature entitlement (Master DB). */
export const ROUTE_FEATURES: Record<string, string> = {
  '/organization': 'hrm.employees',
  '/employees': 'hrm.employees',
  '/attendance': 'hrm.attendance',
  '/leaves': 'hrm.leave',
  '/payroll': 'hrm.payroll',
  '/recruitment': 'hrm.recruitment',
};

export function useEntitlements() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['entitlements-current', session?.tenant?.slug],
    queryFn: () =>
      apiGet<CurrentEntitlements>(
        '/platform/entitlements/current',
        session?.accessToken,
      ),
    enabled: !!session && session.audience !== 'platform',
    staleTime: 60_000,
  });
}

export function hasFeature(
  entitlements: CurrentEntitlements | undefined,
  featureKey?: string,
) {
  if (!featureKey) return true;
  return !!entitlements?.enabledFeatures?.includes(featureKey);
}
