import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Check,
  CreditCard,
  Package,
  Plus,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Badge, EmptyState, PageHeader, StatCard } from '../../components/ui';
import { apiDelete, apiGet, apiPatch, apiPost } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useToast } from '../../lib/toast';
import { useTenantList } from '../PlatformOverviewPage';

type Plan = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  priceMonthlyCents: number;
  currency: string;
  isActive?: boolean;
  sortOrder?: number;
  featureKeys: string[];
  message?: string;
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
  isActive?: boolean;
  sortOrder?: number;
  featureCount?: number;
  features: {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    dependsOnFeatureKey: string | null;
    isActive?: boolean;
  }[];
};

type TenantEntitlements = {
  tenantId: string;
  planSlug: string | null;
  tenantStatus?: string;
  subscriptionStatus?: string | null;
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
  message?: string;
  enabled?: string[];
  disabled?: string[];
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
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [form, setForm] = useState({
    slug: '',
    name: '',
    description: '',
    priceMonthlyCents: 9900,
    currency: 'USD',
    featureKeys: [] as string[],
    isActive: true,
  });

  const plans = useQuery({
    queryKey: ['platform-plans', showInactive],
    queryFn: () =>
      apiGet<Plan[]>(
        `/platform/plans${showInactive ? '?includeInactive=1' : ''}`,
        token,
      ),
    enabled: !!token,
  });
  const catalog = useQuery({
    queryKey: ['platform-catalog'],
    queryFn: () => apiGet<CatalogModule[]>('/platform/catalog', token),
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

  const allFeatures = useMemo(
    () => (catalog.data ?? []).flatMap((m) => m.features),
    [catalog.data],
  );

  function openCreate() {
    setEditing(null);
    setForm({
      slug: '',
      name: '',
      description: '',
      priceMonthlyCents: 9900,
      currency: 'USD',
      featureKeys: [],
      isActive: true,
    });
    setEditorOpen(true);
  }

  function openEdit(p: Plan) {
    setEditing(p);
    setForm({
      slug: p.slug,
      name: p.name,
      description: p.description ?? '',
      priceMonthlyCents: p.priceMonthlyCents,
      currency: p.currency,
      featureKeys: [...p.featureKeys],
      isActive: p.isActive !== false,
    });
    setEditorOpen(true);
  }

  const savePlan = useMutation({
    mutationFn: () =>
      editing
        ? apiPatch<Plan>(
            `/platform/plans/${editing.id}`,
            {
              name: form.name,
              description: form.description || null,
              priceMonthlyCents: Number(form.priceMonthlyCents),
              currency: form.currency,
              featureKeys: form.featureKeys,
              isActive: form.isActive,
            },
            token,
          )
        : apiPost<Plan>(
            '/platform/plans',
            {
              slug: form.slug,
              name: form.name,
              description: form.description || null,
              priceMonthlyCents: Number(form.priceMonthlyCents),
              currency: form.currency,
              featureKeys: form.featureKeys,
              isActive: form.isActive,
            },
            token,
          ),
    onSuccess: (res) => {
      toast.success(
        editing ? 'Plan updated' : 'Plan created',
        res.message ?? res.name,
      );
      setEditorOpen(false);
      queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
    },
    onError: (err) => toast.error('Plan save failed', (err as Error).message),
  });

  const removePlan = useMutation({
    mutationFn: (id: string) =>
      apiDelete<{ status: string; message: string }>(`/platform/plans/${id}`, token),
    onSuccess: (res) => {
      toast.success(
        res.status === 'deleted' ? 'Plan deleted' : 'Plan deactivated',
        res.message,
      );
      queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
    },
    onError: (err) => toast.error('Could not delete plan', (err as Error).message),
  });

  const assign = useMutation({
    mutationFn: () =>
      apiPost(`/platform/tenants/${tenantId}/subscription`, { planSlug }, token),
    onSuccess: () => {
      const company =
        (tenants.data ?? []).find((t) => String(t.id) === tenantId)?.name ??
        'tenant';
      toast.success('Plan assigned', `${company} is now on plan “${planSlug}”.`);
      queryClient.invalidateQueries({ queryKey: ['platform-subscriptions'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-entitlements'] });
      queryClient.invalidateQueries({ queryKey: ['entitlements-current'] });
    },
    onError: (err) =>
      toast.error('Could not assign plan', (err as Error).message),
  });

  function toggleFeature(key: string) {
    setForm((f) => ({
      ...f,
      featureKeys: f.featureKeys.includes(key)
        ? f.featureKeys.filter((k) => k !== key)
        : [...f.featureKeys, key],
    }));
  }

  const activePlans = (plans.data ?? []).filter((p) => p.isActive !== false);

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Billing"
        title="Plans & subscriptions"
        description="Create and edit SaaS plans, pick included features, then assign a plan to a company."
        actions={
          <button type="button" className="erp-btn erp-btn-primary" onClick={openCreate}>
            <Plus size={16} />
            New plan
          </button>
        }
      />

      <label className="inline-flex items-center gap-2 text-sm text-[var(--erp-muted)]">
        <input
          type="checkbox"
          className="erp-check"
          checked={showInactive}
          onChange={(e) => setShowInactive(e.target.checked)}
        />
        Show inactive plans
      </label>

      {editorOpen && (
        <form
          className="erp-panel space-y-4 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            savePlan.mutate();
          }}
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-semibold">
              {editing ? `Edit plan · ${editing.slug}` : 'Create plan'}
            </h2>
            <button
              type="button"
              className="erp-btn erp-btn-ghost text-sm"
              onClick={() => setEditorOpen(false)}
            >
              Cancel
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {!editing && (
              <label className="text-sm">
                <span className="text-[var(--erp-muted)]">Slug</span>
                <input
                  className="erp-input mt-1 w-full"
                  value={form.slug}
                  onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
                  placeholder="growth-plus"
                  required
                />
              </label>
            )}
            <label className="text-sm">
              <span className="text-[var(--erp-muted)]">Name</span>
              <input
                className="erp-input mt-1 w-full"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                required
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--erp-muted)]">Price (cents / mo)</span>
              <input
                type="number"
                min={0}
                className="erp-input mt-1 w-full"
                value={form.priceMonthlyCents}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    priceMonthlyCents: Number(e.target.value),
                  }))
                }
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--erp-muted)]">Currency</span>
              <input
                className="erp-input mt-1 w-full"
                value={form.currency}
                onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}
              />
            </label>
            <label className="text-sm md:col-span-2 lg:col-span-4">
              <span className="text-[var(--erp-muted)]">Description</span>
              <input
                className="erp-input mt-1 w-full"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </label>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium">Included features</p>
            <div className="grid max-h-64 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
              {(catalog.data ?? []).map((m) => (
                <div key={m.key} className="rounded-xl border border-[var(--erp-line)] p-3">
                  <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-accent)]">
                    {m.name}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {m.features.map((f) => (
                      <label
                        key={f.key}
                        className="flex cursor-pointer items-center gap-2 text-xs"
                      >
                        <input
                          type="checkbox"
                          className="erp-check"
                          checked={form.featureKeys.includes(f.key)}
                          onChange={() => toggleFeature(f.key)}
                        />
                        <span>
                          {f.name}
                          <span className="ml-1 text-[var(--erp-muted)]">{f.key}</span>
                        </span>
                      </label>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-[var(--erp-muted)]">
              {form.featureKeys.length} selected
              {allFeatures.length
                ? ` of ${allFeatures.length} catalog features`
                : ''}
            </p>
          </div>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="erp-check"
              checked={form.isActive}
              onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
            />
            Active (assignable to tenants)
          </label>

          <button
            type="submit"
            className="erp-btn erp-btn-primary"
            disabled={savePlan.isPending}
          >
            {savePlan.isPending ? 'Saving…' : editing ? 'Update plan' : 'Create plan'}
          </button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {(plans.data ?? []).map((p) => (
          <article key={p.id} className="erp-panel flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-accent)]">
                  {p.slug}
                </p>
                <h2 className="mt-1 text-xl font-semibold">{p.name}</h2>
              </div>
              <Badge tone={p.isActive === false ? 'warning' : 'success'}>
                {p.isActive === false ? 'Inactive' : 'Active'}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              {p.description || 'No description'}
            </p>
            <p className="mt-4 text-3xl font-semibold">
              {money(p.priceMonthlyCents)}
              <span className="text-sm font-normal text-[var(--erp-muted)]">/mo</span>
            </p>
            <ul className="mt-4 max-h-40 flex-1 space-y-1 overflow-y-auto text-xs text-[var(--erp-muted)]">
              {p.featureKeys.length === 0 && <li>No features included</li>}
              {p.featureKeys.map((k) => (
                <li key={k} className="flex items-center gap-1.5">
                  <Check size={12} className="shrink-0 text-[var(--erp-success)]" />
                  {k}
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[var(--erp-line)] pt-4">
              <button
                type="button"
                className="erp-btn erp-btn-ghost text-sm"
                onClick={() => openEdit(p)}
              >
                Edit
              </button>
              <button
                type="button"
                className="erp-btn erp-btn-danger text-sm"
                disabled={removePlan.isPending}
                onClick={() => {
                  if (
                    confirm(
                      `Delete plan “${p.name}”? If it has subscriptions it will be deactivated instead.`,
                    )
                  ) {
                    removePlan.mutate(p.id);
                  }
                }}
              >
                Delete
              </button>
            </div>
          </article>
        ))}
      </div>

      {!plans.isLoading && !(plans.data ?? []).length && (
        <EmptyState
          title="No plans yet"
          description="Create a plan and attach catalog features."
          action={
            <button type="button" className="erp-btn erp-btn-primary" onClick={openCreate}>
              New plan
            </button>
          }
        />
      )}

      <div className="erp-panel space-y-3 p-5">
        <h2 className="font-semibold">Assign plan</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <select
            className="erp-input"
            value={tenantId}
            onChange={(e) => setTenantId(e.target.value)}
          >
            <option value="">Select tenant…</option>
            {(tenants.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <select
            className="erp-input"
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
          >
            {activePlans.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            disabled={!tenantId || !planSlug || assign.isPending}
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
                <td className="px-5 py-2.5">
                  <Badge tone="success">{s.status}</Badge>
                </td>
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
  const token = session?.accessToken;
  const toast = useToast();
  const queryClient = useQueryClient();
  const [showInactive, setShowInactive] = useState(false);
  const [moduleForm, setModuleForm] = useState({
    key: '',
    name: '',
    description: '',
  });
  const [featureForm, setFeatureForm] = useState({
    moduleId: '',
    key: '',
    name: '',
    description: '',
    dependsOnFeatureKey: '',
  });

  const catalog = useQuery({
    queryKey: ['platform-catalog', showInactive],
    queryFn: () =>
      apiGet<CatalogModule[]>(
        `/platform/catalog${showInactive ? '?includeInactive=1' : ''}`,
        token,
      ),
    enabled: !!token,
  });

  const modules = catalog.data ?? [];
  const featureOptions = modules.flatMap((m) => m.features);

  const createModule = useMutation({
    mutationFn: () =>
      apiPost<{ message?: string }>('/platform/catalog/modules', moduleForm, token),
    onSuccess: (res) => {
      toast.success('Module created', res.message);
      setModuleForm({ key: '', name: '', description: '' });
      queryClient.invalidateQueries({ queryKey: ['platform-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['platform-plans'] });
    },
    onError: (err) => toast.error('Could not create module', (err as Error).message),
  });

  const createFeature = useMutation({
    mutationFn: () =>
      apiPost<{ message?: string }>(
        '/platform/catalog/features',
        {
          moduleId: Number(featureForm.moduleId),
          key: featureForm.key,
          name: featureForm.name,
          description: featureForm.description || null,
          dependsOnFeatureKey: featureForm.dependsOnFeatureKey || null,
        },
        token,
      ),
    onSuccess: (res) => {
      toast.success('Feature created', res.message);
      setFeatureForm({
        moduleId: featureForm.moduleId,
        key: '',
        name: '',
        description: '',
        dependsOnFeatureKey: '',
      });
      queryClient.invalidateQueries({ queryKey: ['platform-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['platform-analytics'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-entitlements'] });
    },
    onError: (err) =>
      toast.error('Could not create feature', (err as Error).message),
  });

  const toggleModule = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ message?: string }>(
        `/platform/catalog/modules/${id}`,
        { isActive },
        token,
      ),
    onSuccess: (res) => {
      toast.success('Module updated', res.message);
      queryClient.invalidateQueries({ queryKey: ['platform-catalog'] });
    },
    onError: (err) => toast.error('Update failed', (err as Error).message),
  });

  const toggleFeature = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      apiPatch<{ message?: string }>(
        `/platform/catalog/features/${id}`,
        { isActive },
        token,
      ),
    onSuccess: (res) => {
      toast.success('Feature updated', res.message);
      queryClient.invalidateQueries({ queryKey: ['platform-catalog'] });
      queryClient.invalidateQueries({ queryKey: ['tenant-entitlements'] });
    },
    onError: (err) => toast.error('Update failed', (err as Error).message),
  });

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Modules & features"
        description="Live catalog from the database. Newly added modules and features appear here and become available for plans and tenant entitlements."
      />

      <div className="flex flex-wrap items-center gap-4 text-sm text-[var(--erp-muted)]">
        <span>
          {modules.length} module{modules.length === 1 ? '' : 's'} ·{' '}
          {featureOptions.length} feature{featureOptions.length === 1 ? '' : 's'}
        </span>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            className="erp-check"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
          />
          Show inactive
        </label>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          className="erp-panel space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            createModule.mutate();
          }}
        >
          <h2 className="font-semibold">Add module</h2>
          <input
            className="erp-input"
            placeholder="key e.g. inventory"
            value={moduleForm.key}
            onChange={(e) => setModuleForm((f) => ({ ...f, key: e.target.value }))}
            required
          />
          <input
            className="erp-input"
            placeholder="Display name"
            value={moduleForm.name}
            onChange={(e) => setModuleForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="erp-input"
            placeholder="Description (optional)"
            value={moduleForm.description}
            onChange={(e) =>
              setModuleForm((f) => ({ ...f, description: e.target.value }))
            }
          />
          <button
            type="submit"
            className="erp-btn erp-btn-primary"
            disabled={createModule.isPending}
          >
            Create module
          </button>
        </form>

        <form
          className="erp-panel space-y-3 p-5"
          onSubmit={(e) => {
            e.preventDefault();
            createFeature.mutate();
          }}
        >
          <h2 className="font-semibold">Add feature</h2>
          <select
            className="erp-input"
            value={featureForm.moduleId}
            onChange={(e) =>
              setFeatureForm((f) => ({ ...f, moduleId: e.target.value }))
            }
            required
          >
            <option value="">Select module…</option>
            {modules.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.key})
              </option>
            ))}
          </select>
          <input
            className="erp-input"
            placeholder="key e.g. inventory.stock"
            value={featureForm.key}
            onChange={(e) => setFeatureForm((f) => ({ ...f, key: e.target.value }))}
            required
          />
          <input
            className="erp-input"
            placeholder="Display name"
            value={featureForm.name}
            onChange={(e) => setFeatureForm((f) => ({ ...f, name: e.target.value }))}
            required
          />
          <input
            className="erp-input"
            placeholder="Description (optional)"
            value={featureForm.description}
            onChange={(e) =>
              setFeatureForm((f) => ({ ...f, description: e.target.value }))
            }
          />
          <select
            className="erp-input"
            value={featureForm.dependsOnFeatureKey}
            onChange={(e) =>
              setFeatureForm((f) => ({
                ...f,
                dependsOnFeatureKey: e.target.value,
              }))
            }
          >
            <option value="">No dependency</option>
            {featureOptions.map((f) => (
              <option key={f.key} value={f.key}>
                {f.name} ({f.key})
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="erp-btn erp-btn-primary"
            disabled={createFeature.isPending || !featureForm.moduleId}
          >
            Create feature
          </button>
        </form>
      </div>

      {catalog.isLoading && (
        <p className="text-sm text-[var(--erp-muted)]">Loading catalog…</p>
      )}

      {catalog.isError && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--erp-danger)]">
          {(catalog.error as Error).message}
        </div>
      )}

      {!catalog.isLoading && modules.length === 0 && (
        <EmptyState
          title="Catalog is empty"
          description="Add a module, then attach features. They will show up for plans and tenant entitlements immediately."
        />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {modules.map((m) => (
          <article key={m.id} className="erp-panel flex flex-col p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h2 className="text-lg font-semibold">{m.name}</h2>
                <p className="font-mono text-xs text-[var(--erp-muted)]">{m.key}</p>
              </div>
              <Badge tone={m.isActive === false ? 'warning' : 'success'}>
                {m.isActive === false ? 'Off' : 'On'}
              </Badge>
            </div>
            {m.description && (
              <p className="mt-2 text-sm text-[var(--erp-muted)]">{m.description}</p>
            )}
            <p className="mt-3 text-xs text-[var(--erp-muted)]">
              {m.features.length} feature{m.features.length === 1 ? '' : 's'}
            </p>
            <ul className="mt-3 max-h-72 flex-1 space-y-2 overflow-y-auto">
              {m.features.length === 0 && (
                <li className="text-sm text-[var(--erp-muted)]">No features yet</li>
              )}
              {m.features.map((f) => (
                <li
                  key={f.id}
                  className="rounded-lg border border-[var(--erp-line)] px-3 py-2 text-sm"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium">{f.name}</p>
                      <p className="font-mono text-[11px] text-[var(--erp-accent)]">
                        {f.key}
                      </p>
                      {f.description && (
                        <p className="mt-1 text-[11px] text-[var(--erp-muted)]">
                          {f.description}
                        </p>
                      )}
                      {f.dependsOnFeatureKey && (
                        <p className="mt-1 text-[11px] text-[var(--erp-muted)]">
                          requires {f.dependsOnFeatureKey}
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="shrink-0 text-[11px] text-[var(--erp-accent)] hover:underline"
                      onClick={() =>
                        toggleFeature.mutate({
                          id: f.id,
                          isActive: f.isActive === false,
                        })
                      }
                    >
                      {f.isActive === false ? 'Enable' : 'Disable'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="erp-btn erp-btn-ghost mt-4 text-sm"
              onClick={() =>
                toggleModule.mutate({
                  id: m.id,
                  isActive: m.isActive === false,
                })
              }
            >
              {m.isActive === false ? 'Activate module' : 'Deactivate module'}
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

export function PlatformFeaturesPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const toast = useToast();
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
    if (loaded) setSelected([...loaded.enabledFeatures]);
  }, [loaded]);

  const companyName =
    (tenants.data ?? []).find((t) => String(t.id) === tenantId)?.name ??
    'company';

  const dirty = useMemo(() => {
    if (!loaded) return false;
    const a = [...loaded.enabledFeatures].sort().join('|');
    const b = [...selected].sort().join('|');
    return a !== b;
  }, [loaded, selected]);

  const allFeatures = useMemo(
    () => loaded?.modules.flatMap((m) => m.features) ?? [],
    [loaded],
  );

  const save = useMutation({
    mutationFn: () =>
      apiPatch<TenantEntitlements>(
        `/platform/entitlements/${tenantId}`,
        { featureKeys: selected },
        token,
      ),
    onSuccess: (result) => {
      toast.success(
        'Features saved',
        result.message ??
          `Entitlements updated for ${companyName} (${result.enabledFeatures.length} enabled).`,
      );
      queryClient.setQueryData(['tenant-entitlements', tenantId], result);
      queryClient.invalidateQueries({ queryKey: ['tenant-entitlements', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['entitlements-current'] });
    },
    onError: (err) =>
      toast.error('Could not save features', (err as Error).message),
  });

  function toggle(key: string, dependsOn?: string | null) {
    setSelected((prev) => {
      if (prev.includes(key)) {
        const dependents = allFeatures
          .filter((f) => f.dependsOnFeatureKey === key)
          .map((f) => f.key);
        return prev.filter((k) => k !== key && !dependents.includes(k));
      }
      const next = new Set(prev);
      next.add(key);
      if (dependsOn) next.add(dependsOn);
      // Walk dependency chain upward
      let parent = dependsOn;
      while (parent) {
        next.add(parent);
        parent =
          allFeatures.find((f) => f.key === parent)?.dependsOnFeatureKey ?? null;
      }
      return [...next];
    });
  }

  function selectPlanDefaults() {
    if (!loaded) return;
    // Keep currently effective from server as baseline if user wants reset
    setSelected([...loaded.enabledFeatures]);
    toast.info('Reset to last saved', 'Unsaved checkbox changes were discarded.');
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Entitlements"
        title="Tenant feature configuration"
        description="Enable or disable features for a company. Disabling a parent also turns off dependents. Changes apply after you save."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="erp-btn erp-btn-ghost"
              disabled={!tenantId || !dirty || save.isPending}
              onClick={selectPlanDefaults}
            >
              Reset
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-primary"
              disabled={!tenantId || !dirty || save.isPending || entitlements.isLoading}
              onClick={() => {
                if (!tenantId) {
                  toast.error('Select a tenant', 'Choose a company before saving.');
                  return;
                }
                save.mutate();
              }}
            >
              {save.isPending ? 'Saving…' : 'Save features'}
            </button>
          </div>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <label className="block min-w-[16rem] flex-1 text-sm">
          <span className="text-[var(--erp-muted)]">Company</span>
          <select
            className="erp-input mt-1 w-full max-w-md"
            value={tenantId}
            onChange={(e) => {
              setTenantId(e.target.value);
              setSelected([]);
            }}
          >
            <option value="">Select tenant…</option>
            {(tenants.data ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.slug})
              </option>
            ))}
          </select>
        </label>
        {dirty && (
          <Badge tone="warning">Unsaved changes</Badge>
        )}
      </div>

      {!tenantId && (
        <EmptyState
          title="Select a company"
          description="Pick a tenant to view and toggle its feature entitlements."
        />
      )}

      {tenantId && entitlements.isLoading && (
        <p className="text-sm text-[var(--erp-muted)]">Loading entitlements…</p>
      )}

      {tenantId && entitlements.isError && (
        <div className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-4 py-3 text-sm text-[var(--erp-danger)]">
          {(entitlements.error as Error).message || 'Failed to load entitlements.'}
        </div>
      )}

      {loaded && (
        <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--erp-muted)]">
          <span>
            Plan:{' '}
            <span className="font-medium text-[var(--erp-accent)]">
              {loaded.planSlug ?? '—'}
            </span>
          </span>
          {loaded.tenantStatus && (
            <Badge tone={loaded.tenantStatus === 'active' ? 'success' : 'warning'}>
              {loaded.tenantStatus}
            </Badge>
          )}
          <span>
            Enabled:{' '}
            <span className="text-[var(--erp-text)]">{selected.length}</span>
          </span>
        </div>
      )}

      <div className="space-y-4">
        {(loaded?.modules ?? []).map((m) => (
          <div key={m.key} className="erp-panel p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">{m.name}</h2>
              <span className="text-xs text-[var(--erp-muted)]">
                {m.features.filter((f) => selected.includes(f.key)).length}/
                {m.features.length} on
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {m.features.map((f) => {
                const on = selected.includes(f.key);
                const depMissing =
                  !!f.dependsOnFeatureKey &&
                  !selected.includes(f.dependsOnFeatureKey);
                return (
                  <label
                    key={f.key}
                    className={[
                      'erp-hover flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5',
                      on
                        ? 'border-[color-mix(in_srgb,var(--erp-accent)_40%,var(--erp-line))] bg-[var(--erp-accent-softer)]'
                        : 'border-[var(--erp-line)]',
                    ].join(' ')}
                  >
                    <input
                      type="checkbox"
                      className="erp-check mt-1"
                      checked={on}
                      onChange={() => toggle(f.key, f.dependsOnFeatureKey)}
                    />
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{f.name}</span>
                        <Badge tone={on ? 'success' : 'neutral'}>
                          {on ? 'Enabled' : 'Disabled'}
                        </Badge>
                      </span>
                      <span className="mt-0.5 block font-mono text-[11px] text-[var(--erp-muted)]">
                        {f.key}
                      </span>
                      {f.dependsOnFeatureKey && (
                        <span className="mt-1 block text-[11px] text-[var(--erp-muted)]">
                          Requires {f.dependsOnFeatureKey}
                          {depMissing && !on
                            ? ' (will auto-enable parent when turned on)'
                            : ''}
                        </span>
                      )}
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
