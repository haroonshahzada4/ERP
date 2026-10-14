import { Lock, ShieldOff } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { hasFeature, useEntitlements } from '../lib/features';

/**
 * Gates tenant routes: optional Master-DB feature entitlement AND/OR RBAC permission.
 */
export function FeatureRoute({
  feature,
  permission,
}: {
  feature?: string;
  permission?: string;
}) {
  const entitlements = useEntitlements();
  const { hasPermission } = useAuth();

  if (feature) {
    if (entitlements.isLoading) {
      return (
        <div className="py-16 text-center text-sm text-[var(--erp-muted)]">
          Checking subscription…
        </div>
      );
    }

    if (!hasFeature(entitlements.data, feature)) {
      return (
        <div className="erp-panel mx-auto max-w-lg space-y-3 p-8 text-center">
          <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
            <Lock size={20} />
          </span>
          <h1 className="text-xl font-semibold">Feature not in your plan</h1>
          <p className="text-sm text-[var(--erp-muted)]">
            <code className="text-[var(--erp-accent)]">{feature}</code> is not enabled
            for this company. Ask your platform administrator to enable it or upgrade
            your subscription.
          </p>
          <p className="text-xs text-[var(--erp-muted)]">
            Plan: {entitlements.data?.planSlug ?? '—'} · Status:{' '}
            {entitlements.data?.subscriptionStatus ?? '—'}
          </p>
          <Link to="/" className="erp-btn erp-btn-ghost erp-btn-sm inline-flex">
            Back to dashboard
          </Link>
        </div>
      );
    }
  }

  if (permission && !hasPermission(permission)) {
    return (
      <div className="erp-panel mx-auto max-w-lg space-y-3 p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
          <ShieldOff size={20} />
        </span>
        <h1 className="text-xl font-semibold">Permission required</h1>
        <p className="text-sm text-[var(--erp-muted)]">
          You need <code className="text-[var(--erp-accent)]">{permission}</code> to
          open this area. Ask your Company Admin to assign the right role.
        </p>
        <Link to="/" className="erp-btn erp-btn-ghost erp-btn-sm inline-flex">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <Outlet />;
}
