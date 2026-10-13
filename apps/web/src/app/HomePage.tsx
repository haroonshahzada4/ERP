import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Building, KeyRound, Network, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { StatCard } from '../components/ui';
import { apiGet } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useTheme } from '../lib/theme';

type Setup = {
  branches: unknown[];
  departments: unknown[];
};

function permissionLabel(key: string) {
  if (key === '*') return 'Platform full access';
  if (key === 'tenant:*') return 'Company full access';
  if (key === 'platform.tenants') return 'Manage all tenants';
  return key;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

export function HomePage() {
  const { session, hasPermission } = useAuth();
  const { branding } = useTheme();
  const token = session?.accessToken;
  const canRead = hasPermission('employee.read');

  const employees = useQuery({
    queryKey: ['home-employees'],
    queryFn: () => apiGet<unknown[]>('/hrm/employees', token),
    enabled: !!token && canRead,
  });
  const setup = useQuery({
    queryKey: ['org-setup'],
    queryFn: () => apiGet<Setup>('/hrm/organization/setup', token),
    enabled: !!token && canRead,
  });

  const permissions = session?.permissions ?? [];
  const visiblePermissions = permissions.filter((p) => p !== '*' && p !== 'tenant:*');
  const scopeBadge = session?.isPlatformAdmin
    ? 'Platform full access'
    : permissions.includes('tenant:*')
      ? 'Company full access'
      : null;

  const company = branding.name ?? session?.tenant.name ?? 'your company';
  const firstName = session?.user.fullName.split(' ')[0] ?? 'there';

  const actions = [
    { to: '/employees', label: 'Manage employees', perm: 'employee.read', icon: Users },
    { to: '/organization', label: 'Organization setup', perm: 'employee.read', icon: Network },
    { to: '/roles', label: 'Roles & access', perm: 'roles.manage', icon: KeyRound },
    { to: '/settings', label: 'Company branding', perm: 'tenant.settings', icon: Building },
  ].filter((a) => hasPermission(a.perm));

  return (
    <section className="space-y-6">
      <div
        className="overflow-hidden rounded-3xl border border-[var(--erp-line)] p-6 md:p-8"
        style={{
          background:
            'radial-gradient(ellipse 80% 120% at 100% 0%, var(--erp-accent-glow), transparent 60%), var(--erp-grad-panel)',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--erp-accent)]">
          {company}
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
          {greeting()}, {firstName}.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-[var(--erp-muted)]">
          Here’s what’s happening in your workspace today.
        </p>
        {scopeBadge && (
          <span className="erp-badge erp-badge-accent mt-4">{scopeBadge}</span>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canRead && (
          <>
            <StatCard
              label="Employees"
              value={employees.data?.length ?? 0}
              icon={<Users size={16} />}
              loading={employees.isLoading}
            />
            <StatCard
              label="Departments"
              value={setup.data?.departments.length ?? 0}
              icon={<Network size={16} />}
              loading={setup.isLoading}
            />
            <StatCard
              label="Branches"
              value={setup.data?.branches.length ?? 0}
              icon={<Building size={16} />}
              loading={setup.isLoading}
            />
          </>
        )}
        <StatCard
          label="Your permissions"
          value={scopeBadge ? 'All' : visiblePermissions.length}
          icon={<KeyRound size={16} />}
          hint={session?.roles.join(', ').replace(/_/g, ' ') || 'No role assigned'}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="erp-panel p-5">
          <h2 className="font-semibold">Quick actions</h2>
          <div className="mt-3 space-y-1">
            {actions.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.to}
                  to={a.to}
                  className="erp-hover group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm"
                >
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
                    <Icon size={15} />
                  </span>
                  <span className="flex-1">{a.label}</span>
                  <ArrowRight
                    size={14}
                    className="text-[var(--erp-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--erp-accent)]"
                  />
                </Link>
              );
            })}
            {!actions.length && (
              <p className="px-3 py-4 text-sm text-[var(--erp-muted)]">
                Nothing assigned yet. Ask your company admin for access.
              </p>
            )}
          </div>
        </div>

        <div className="erp-panel p-5">
          <h2 className="font-semibold">Your access</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {visiblePermissions.map((permission) => (
              <span key={permission} className="erp-badge erp-badge-accent">
                {permissionLabel(permission)}
              </span>
            ))}
            {!visiblePermissions.length && !scopeBadge && (
              <span className="text-sm text-[var(--erp-muted)]">
                No permissions assigned yet.
              </span>
            )}
            {scopeBadge && (
              <span className="text-sm text-[var(--erp-muted)]">
                Full access applies to every module in this scope.
              </span>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
