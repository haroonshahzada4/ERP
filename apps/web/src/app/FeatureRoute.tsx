import { Lock } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';
import { hasFeature, useEntitlements } from '../lib/features';

/** Blocks tenant routes when the Master-DB feature is not entitled. */
export function FeatureRoute({ feature }: { feature: string }) {
  const entitlements = useEntitlements();

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

  return <Outlet />;
}
