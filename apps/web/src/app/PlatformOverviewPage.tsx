import { useQuery } from '@tanstack/react-query';
import { Building2, PauseCircle, Plus, Users, Zap } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, CompanyAvatar, PageHeader, StatCard } from '../components/ui';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';

export type TenantRow = {
  id: string;
  slug: string;
  name: string;
  status: 'active' | 'suspended' | 'provisioning' | string;
  domains: string[];
  databaseName: string | null;
  brandPrimary: string;
  brandSecondary: string;
  themeMode: 'dark' | 'light';
  logoUrl: string | null;
  activeMembers?: number;
  createdAt?: string;
};

export function useTenantList() {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['tenants'],
    queryFn: () => apiGet<TenantRow[]>('/platform/tenants', session?.accessToken),
    enabled: !!session?.accessToken && !!session?.isPlatformAdmin,
  });
}

export function statusTone(status: string) {
  if (status === 'active') return 'success' as const;
  if (status === 'suspended') return 'danger' as const;
  return 'warning' as const;
}

export function PlatformOverviewPage() {
  const { session } = useAuth();
  const tenants = useTenantList();

  if (!session?.isPlatformAdmin) {
    return (
      <div className="erp-panel p-6 text-[var(--erp-muted)]">
        Super Admin access required.
      </div>
    );
  }

  const rows = tenants.data ?? [];
  const active = rows.filter((t) => t.status === 'active').length;
  const suspended = rows.filter((t) => t.status === 'suspended').length;
  const members = rows.reduce((sum, t) => sum + (t.activeMembers ?? 0), 0);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Platform overview"
        description="Health and growth of every company running on the platform."
        actions={
          <Link to="/platform/tenants?new=1" className="erp-btn erp-btn-primary">
            <Plus size={16} />
            New tenant
          </Link>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Tenants"
          value={rows.length}
          icon={<Building2 size={16} />}
          loading={tenants.isLoading}
        />
        <StatCard
          label="Active"
          value={active}
          icon={<Zap size={16} />}
          hint="Serving traffic"
          loading={tenants.isLoading}
        />
        <StatCard
          label="Suspended"
          value={suspended}
          icon={<PauseCircle size={16} />}
          hint="Access blocked"
          loading={tenants.isLoading}
        />
        <StatCard
          label="Active members"
          value={members}
          icon={<Users size={16} />}
          hint="Across all tenants"
          loading={tenants.isLoading}
        />
      </div>

      <div className="erp-panel overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="font-semibold">Companies</h2>
          <Link to="/platform/tenants" className="text-sm text-[var(--erp-accent)] hover:underline">
            Manage all →
          </Link>
        </div>
        <ul className="divide-y divide-[var(--erp-line)]">
          {rows.map((t) => (
            <li
              key={t.id}
              className="erp-hover flex items-center gap-4 px-5 py-3"
            >
              <span
                className="h-8 w-1 rounded-full"
                style={{ background: `linear-gradient(${t.brandPrimary}, ${t.brandSecondary})` }}
              />
              <CompanyAvatar name={t.name} logoUrl={t.logoUrl} size={36} radius={10} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{t.name}</p>
                <p className="truncate text-xs text-[var(--erp-muted)]">
                  {t.domains[0] ?? `${t.slug}.localhost`}
                </p>
              </div>
              <span className="hidden text-xs text-[var(--erp-muted)] sm:block">
                {t.activeMembers ?? 0} members
              </span>
              <Badge tone={statusTone(t.status)}>{t.status}</Badge>
            </li>
          ))}
          {!rows.length && !tenants.isLoading && (
            <li className="px-5 py-8 text-center text-sm text-[var(--erp-muted)]">
              No tenants yet.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
