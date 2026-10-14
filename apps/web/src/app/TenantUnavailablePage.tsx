import { Building2, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';

export function TenantUnavailablePage({
  host,
  reason = 'unknown',
}: {
  host?: string | null;
  reason?: 'unknown' | 'inactive' | 'apex';
}) {
  const title =
    reason === 'apex'
      ? 'Choose your company workspace'
      : reason === 'inactive'
        ? 'This workspace is unavailable'
        : 'Workspace not found';

  const description =
    reason === 'apex'
      ? 'Company apps live on their own subdomain. Open the URL your administrator shared with you.'
      : reason === 'inactive'
        ? 'This company has been suspended or is still being provisioned. Contact your administrator.'
        : host
          ? `No active company is registered for ${host}.`
          : 'No active company is registered for this address.';

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-10">
      <div className="erp-panel w-full max-w-md space-y-5 p-8 text-center">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
          <Building2 size={22} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm text-[var(--erp-muted)]">{description}</p>
        </div>
        {reason === 'apex' && (
          <p className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-3 py-2 font-mono text-xs text-[var(--erp-muted)]">
            http://&lt;company&gt;.localhost:8001
          </p>
        )}
        <Link
          to="/platform/login"
          className="erp-btn erp-btn-ghost inline-flex w-full !py-2.5"
        >
          <ShieldCheck size={15} />
          Platform Super Admin
        </Link>
      </div>
    </div>
  );
}
