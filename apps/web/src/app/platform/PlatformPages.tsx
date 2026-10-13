import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Check,
  CreditCard,
  Package,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge, EmptyState, PageHeader, StatCard } from '../../components/ui';
import { apiGet, apiPatch, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useTenantList } from '../PlatformOverviewPage';

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  currency: string;
  featureKeys: string[];
};

type Subscription = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantName: string;
  planSlug: string;
  planName: string;
  status: string;
  mrrCents: number;
};

type CatalogModule = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  features: {
    id: string;
    key: string;
    name: string;
    dependsOnFeatureKey: string | null;
  }[];
};

type TenantEntitlements = {
  tenantId: string;
  planSlug: string | null;
  enabledFeatures: string[];
  modules: {
    key: string;
    name: string;
    features: {
      key: string;
      name: string;
      enabled: boolean;
      effective: boolean;
      dependsOnFeatureKey: string | null;
    }[];
  }[];
};

type SupportRow = {
  id: string;
  tenantId: string;
  tenantName?: string;
  tenantSlug?: string;
  status: string;
  reason: string;
  featureKeys: string[];
  emergency: boolean;
  expiresAt: string;
  createdAt: string;
};

type AuditRow = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  actorEmail: string | null;
  tenantId: string | null;
  createdAt: string;
  metadata: Record<string, unknown> | null;
};

type Analytics = {
  tenantsTotal: number;
  tenantsActive: number;
  tenantsSuspended: number;
  subscriptionsActive: number;
  mrrCents: number;
  catalogModules: number;
  catalogFeatures: number;
};

function money(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export function PlatformDashboardPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const stats = useQuery({
    queryKey: ['platform-analytics'],
    queryFn: () => apiGet<Analytics>('/platform/analytics/overview', token),
    enabled: !!token && !!session?.isPlatformAdmin,
  });
  const tenants = useTenantList();
  const d = stats.data;

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Platform overview"
        description="Tenants, subscriptions and system health across the SaaS."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tenants" value={d?.tenantsTotal ?? '—'} loading={stats.isLoading} icon={<Package size={16} />} />
        <StatCard label="Active" value={d?.tenantsActive ?? '—'} hint="Serving traffic" loading={stats.isLoading} />
        <StatCard label="Suspended" value={d?.tenantsSuspended ?? '—'} loading={stats.isLoading} />
        <StatCard
          label="MRR"
          value={d ? money(d.mrrCents) : '—'}
          hint={`${d?.subscriptionsActive ?? 0} active subscriptions`}
          loading={stats.isLoading}
          icon={<CreditCard size={16} />}
        />
      </div>
      <div className="erp-panel p-5">
        <h2 className="font-semibold">Recent companies</h2>
        <ul className="mt-3 divide-y divide-[var(--erp-line)]">
          {(tenants.data ?? []).slice(0, 8).map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2.5 text-sm">
              <span className="font-medium">{t.name}</span>
              <Badge tone={t.status === 'active' ? 'success' : 'danger'}>{t.status}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function PlatformPlansPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const plans = useQuery({
    queryKey: ['platform-plans'],
    queryFn: () => apiGet<Plan[]>('/platform/plans', token),
    enabled: !!token,
  });
  const subs = useQuery({
    queryKey: ['platform-subscriptions'],
    queryFn: () => apiGet<Subscription[]>('/platform/subscriptions', token),
    enabled: !!token,
  });
  const tenants = useTenantList();
  const [tenantId, setTenantId] = useState('');
  const [planSlug, setPlanSlug] = useState('growth');

  const assign = useMutation({
    mutationFn: () =>
      apiPost(`/platform/tenants/${tenantId}/subscription`, { planSlug }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
    },
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Plans & subscriptions"
        description="Assign a plan to a company. Entitlements sync from the plan unless overridden."
      />
      <div className="grid gap-4 md:grid-cols-3">
        {(plans.data ?? []).map((p) => (
          <article key={p.id} className="erp-panel p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-accent)]">
              {p.slug}
            </p>
            <h2 className="mt-1 text-xl font-semibold">{p.name}</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">{p.description}</p>
            <p className="mt-4 text-3xl font-semibold">
              {money(p.priceMonthlyCents)}
              <span className="text-sm font-normal text-[var(--erp-muted)]">/mo</span>
            </p>
            <ul className="mt-4 space-y-1 text-xs text-[var(--erp-muted)]">
              {p.featureKeys.map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Check size={12} className="text-[var(--erp-success)]" />
                  {k}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="erp-panel space-y-3 p-5">
        <h2 className="font-semibold">Assign plan</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select className="erp-input" value={tenantId} onChange={(e) => setTenantId(e.target.value)}>
            <option value="">Select tenant…</option>
            {(tenants.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select className="erp-input" value={planSlug} onChange={(e) => setPlanSlug(e.target.value)}>
            {(plans.data ?? []).map((p) => (
              <option key={p.slug} value={p.slug}>{p.name}</option>
            ))}
          </select>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            disabled={!tenantId || assign.isPending}
            onClick={() => assign.mutate()}
          >
            Assign
          </button>
        </div>
      </div>

      <div className="erp-panel overflow-hidden">
        <div className="border-b border-[var(--erp-line)] px-5 py-3 font-semibold">
          Active subscriptions
        </div>
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--erp-muted)]">
            <tr>
              <th className="px-5 py-2">Company</th>
              <th className="px-5 py-2">Plan</th>
              <th className="px-5 py-2">Status</th>
              <th className="px-5 py-2">MRR</th>
            </tr>
          </thead>
          <tbody>
            {(subs.data ?? []).map((s) => (
              <tr key={s.id} className="border-t border-[var(--erp-line)]">
                <td className="px-5 py-2.5">{s.tenantName}</td>
                <td className="px-5 py-2.5">{s.planName}</td>
                <td className="px-5 py-2.5"><Badge tone="success">{s.status}</Badge></td>
                <td className="px-5 py-2.5">{money(s.mrrCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PlatformCatalogPage() {
  const { session } = useAuth();
  const catalog = useQuery({
    queryKey: ['platform-catalog'],
    queryFn: () => apiGet<CatalogModule[]>('/platform/catalog', session?.accessToken),
    enabled: !!session?.accessToken,
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Modules & features"
        description="Central SaaS catalog. Super Admin enables these per tenant."
      />
      <div className="grid gap-4 lg:grid-cols-3">
        {(catalog.data ?? []).map((m) => (
          <article key={m.id} className="erp-panel p-5">
            <h2 className="text-lg font-semibold">{m.name}</h2>
            <p className="text-xs text-[var(--erp-muted)]">{m.key}</p>
            <ul className="mt-4 space-y-2">
              {m.features.map((f) => (
                <li key={f.key} className="rounded-lg border border-[var(--erp-line)] px-3 py-2 text-sm">
                  <p className="font-medium">{f.name}</p>
                  <p className="font-mono text-[11px] text-[var(--erp-accent)]">{f.key}</p>
                  {f.dependsOnFeatureKey && (
                    <p className="text-[11px] text-[var(--erp-muted)]">
                      requires {f.dependsOnFeatureKey}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlatformFeaturesPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const tenants = useTenantList();
  const [tenantId, setTenantId] = useState('');
  const entitlements = useQuery({
    queryKey: ['tenant-entitlements', tenantId],
    queryFn: () =>
      apiGet<TenantEntitlements>(`/platform/entitlements/${tenantId}`, token),
    enabled: !!token && !!tenantId,
  });

  const [selected, setSelected] = useState<string[]>([]);
  const loaded = entitlements.data;
  useEffect(() => {
    if (loaded) setSelected(loaded.enabledFeatures);
  }, [loaded]);

  const save = useMutation({
    mutationFn: () =>
      apiPatch(`/platform/entitlements/${tenantId}`, { featureKeys: selected }, token),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-entitlements', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['entitlements-current'] });
    },
  });

  function toggle(key: string, dependsOn?: string | null) {
    setSelected((prev) => {
      if (prev.includes(key)) {
        // Also disable dependents
        return prev.filter(
          (k) =>
            k !== key &&
            !loaded?.modules
              .flatMap((m) => m.features)
              .some((f) => f.key === k && f.dependsOnFeatureKey === key),
        );
      }
      const next = [...prev, key];
      if (dependsOn && !next.includes(dependsOn)) next.push(dependsOn);
      return next;
    });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Entitlements"
        title="Tenant feature configuration"
        description="Enable or disable individual features for a company. Disabling a parent removes dependents."
        actions={
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            disabled={!tenantId || save.isPending}
            onClick={() => save.mutate()}
          >
            Save entitlements
          </button>
        }
      />
      <select
        className="erp-input max-w-md"
        value={tenantId}
        onChange={(e) => setTenantId(e.target.value)}
      >
        <option value="">Select tenant…</option>
        {(tenants.data ?? []).map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} ({t.slug})
          </option>
        ))}
      </select>

      {loaded && (
        <p className="text-sm text-[var(--erp-muted)]">
          Plan: <span className="text-[var(--erp-accent)]">{loaded.planSlug}</span>
        </p>
      )}

      <div className="space-y-4">
        {(loaded?.modules ?? []).map((m) => (
          <div key={m.key} className="erp-panel p-5">
            <h2 className="font-semibold">{m.name}</h2>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {m.features.map((f) => {
                const on = selected.includes(f.key);
                return (
                  <label
                    key={f.key}
                    className="erp-hover flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--erp-line)] px-3 py-2.5"
                  >
                    <input
                      type="checkbox"
                      className="erp-check"
                      checked={on}
                      onChange={() => toggle(f.key, f.dependsOnFeatureKey)}
                    />
                    <span>
                      <span className="block text-sm font-medium">{f.name}</span>
                      <span className="font-mono text-[11px] text-[var(--erp-muted)]">
                        {f.key}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export function PlatformSupportPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const tenants = useTenantList();
  const list = useQuery({
    queryKey: ['support-access'],
    queryFn: () => apiGet<SupportRow[]>('/platform/support-access', token),
    enabled: !!token,
  });
  const catalog = useQuery({
    queryKey: ['platform-catalog'],
    queryFn: () => apiGet<CatalogModule[]>('/platform/catalog', token),
    enabled: !!token,
  });

  const [form, setForm] = useState({
    tenantId: '',
    reason: '',
    featureKeys: ['hrm.employees'] as string[],
    hours: 4,
    emergency: false,
  });

  const create = useMutation({
    mutationFn: () =>
      apiPost(
        '/platform/support-access',
        {
          tenantId: form.tenantId,
          reason: form.reason,
          featureKeys: form.featureKeys,
          emergency: form.emergency,
          expiresAt: new Date(Date.now() + form.hours * 3600_000).toISOString(),
        },
        token,
      ),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support-access'] }),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiPost(`/platform/support-access/${id}/decide`, { approve }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support-access'] }),
  });

  const revoke = useMutation({
    mutationFn: (id: string) =>
      apiPost(`/platform/support-access/${id}/revoke`, {}, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support-access'] }),
  });

  const allFeatures = (catalog.data ?? []).flatMap((m) => m.features);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Support"
        title="Controlled support access"
        description="Request time-boxed, feature-scoped access to a company workspace. Company Admin approval required unless emergency."
      />

      <form
        className="erp-panel grid gap-3 p-5 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <h2 className="md:col-span-2 font-semibold">New request</h2>
        <select
          className="erp-input"
          required
          value={form.tenantId}
          onChange={(e) => setForm({ ...form, tenantId: e.target.value })}
        >
          <option value="">Tenant…</option>
          {(tenants.data ?? []).map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <input
          className="erp-input"
          type="number"
          min={1}
          max={form.emergency ? 8 : 72}
          value={form.hours}
          onChange={(e) => setForm({ ...form, hours: Number(e.target.value) })}
        />
        <textarea
          className="erp-input md:col-span-2 min-h-[80px]"
          required
          placeholder="Reason for access"
          value={form.reason}
          onChange={(e) => setForm({ ...form, reason: e.target.value })}
        />
        <div className="md:col-span-2 flex flex-wrap gap-2">
          {allFeatures.map((f) => {
            const on = form.featureKeys.includes(f.key);
            return (
              <button
                key={f.key}
                type="button"
                className={`erp-chip ${on ? 'erp-chip-active' : ''}`}
                onClick={() =>
                  setForm({
                    ...form,
                    featureKeys: on
                      ? form.featureKeys.filter((k) => k !== f.key)
                      : [...form.featureKeys, f.key],
                  })
                }
              >
                {f.key}
              </button>
            );
          })}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="erp-check"
            checked={form.emergency}
            onChange={(e) => setForm({ ...form, emergency: e.target.checked })}
          />
          Emergency (auto-approve, max 8h, fully audited)
        </label>
        <button type="submit" className="erp-btn erp-btn-primary md:justify-self-start">
          <Plus size={15} />
          Submit request
        </button>
      </form>

      <div className="space-y-3">
        {(list.data ?? []).map((r) => (
          <article key={r.id} className="erp-panel p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold">{r.tenantName ?? r.tenantSlug}</p>
                <p className="text-sm text-[var(--erp-muted)]">{r.reason}</p>
                <p className="mt-1 font-mono text-[11px] text-[var(--erp-accent)]">
                  {r.featureKeys.join(', ')}
                </p>
                <p className="mt-1 text-xs text-[var(--erp-muted)]">
                  Expires {new Date(r.expiresAt).toLocaleString()}
                  {r.emergency ? ' · emergency' : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge
                  tone={
                    r.status === 'approved'
                      ? 'success'
                      : r.status === 'pending'
                        ? 'warning'
                        : 'neutral'
                  }
                >
                  {r.status}
                </Badge>
                {r.status === 'pending' && (
                  <>
                    <button type="button" className="erp-btn erp-btn-ghost erp-btn-sm" onClick={() => decide.mutate({ id: r.id, approve: true })}>
                      <Check size={12} /> Approve
                    </button>
                    <button type="button" className="erp-btn erp-btn-danger erp-btn-sm" onClick={() => decide.mutate({ id: r.id, approve: false })}>
                      <X size={12} /> Deny
                    </button>
                  </>
                )}
                {r.status === 'approved' && (
                  <button type="button" className="erp-btn erp-btn-danger erp-btn-sm" onClick={() => revoke.mutate(r.id)}>
                    Revoke
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
        {!list.data?.length && (
          <EmptyState title="No support requests" description="Request access when troubleshooting a customer workspace." />
        )}
      </div>
    </section>
  );
}

export function PlatformAuditPage() {
  const { session } = useAuth();
  const logs = useQuery({
    queryKey: ['platform-audit'],
    queryFn: () => apiGet<AuditRow[]>('/platform/audit-logs?limit=100', session?.accessToken),
    enabled: !!session?.accessToken,
  });

  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Security" title="Platform audit logs" description="Mutations by Super Admins across tenants, plans and support access." />
      <div className="erp-panel overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--erp-muted)]">
            <tr>
              <th className="px-4 py-2">When</th>
              <th className="px-4 py-2">Actor</th>
              <th className="px-4 py-2">Action</th>
              <th className="px-4 py-2">Resource</th>
            </tr>
          </thead>
          <tbody>
            {(logs.data ?? []).map((l) => (
              <tr key={l.id} className="border-t border-[var(--erp-line)]">
                <td className="px-4 py-2 text-xs text-[var(--erp-muted)]">
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-2">{l.actorEmail ?? '—'}</td>
                <td className="px-4 py-2 font-mono text-xs text-[var(--erp-accent)]">{l.action}</td>
                <td className="px-4 py-2 text-xs">
                  {l.resourceType}
                  {l.resourceId ? ` · ${l.resourceId.slice(0, 8)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function PlatformHealthPage() {
  const { session } = useAuth();
  const health = useQuery({
    queryKey: ['platform-health'],
    queryFn: () => apiGet<Analytics>('/platform/health/summary', session?.accessToken),
    enabled: !!session?.accessToken,
  });
  const d = health.data;
  return (
    <section className="space-y-6">
      <PageHeader eyebrow="Ops" title="System health" description="High-level platform status derived from Master DB." icon={<Activity size={13} />} />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard label="Catalog modules" value={d?.catalogModules ?? '—'} />
        <StatCard label="Catalog features" value={d?.catalogFeatures ?? '—'} />
        <StatCard label="Active subscriptions" value={d?.subscriptionsActive ?? '—'} />
      </div>
    </section>
  );
}

export function PlatformSettingsPage() {
  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        title="Platform settings"
        description="Global SaaS configuration. Tenant branding stays on each company subdomain."
      />
      <div className="erp-panel space-y-2 p-5 text-sm text-[var(--erp-muted)]">
        <p>Platform Super Admin uses <code className="text-[var(--erp-accent)]">platform:*</code>.</p>
        <p>Company Admin uses <code className="text-[var(--erp-accent)]">tenant:*</code> limited by entitlements.</p>
        <p>Private tenant data is never granted by platform privileges alone.</p>
      </div>
    </section>
  );
}

export function SupportInboxPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const inbox = useQuery({
    queryKey: ['support-inbox'],
    queryFn: () => apiGet<SupportRow[]>('/platform/support-access/inbox', token),
    enabled: !!token,
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiPost(`/platform/support-access/${id}/company-decide`, { approve }, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['support-inbox'] }),
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Company"
        title="Support access requests"
        description="Approve or deny temporary Super Admin troubleshooting access to your workspace."
      />
      {(inbox.data ?? []).map((r) => (
        <article key={r.id} className="erp-panel flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <Badge tone={r.status === 'pending' ? 'warning' : 'neutral'}>{r.status}</Badge>
            <p className="mt-2 text-sm">{r.reason}</p>
            <p className="font-mono text-[11px] text-[var(--erp-muted)]">{r.featureKeys.join(', ')}</p>
          </div>
          {r.status === 'pending' && (
            <div className="flex gap-2">
              <button type="button" className="erp-btn erp-btn-primary erp-btn-sm" onClick={() => decide.mutate({ id: r.id, approve: true })}>Approve</button>
              <button type="button" className="erp-btn erp-btn-danger erp-btn-sm" onClick={() => decide.mutate({ id: r.id, approve: false })}>Deny</button>
            </div>
          )}
        </article>
      ))}
      {!inbox.data?.length && (
        <EmptyState title="No support requests" description="Platform operators have not requested access." />
      )}
    </section>
  );
}
