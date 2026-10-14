import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Pencil,
  PauseCircle,
  PlayCircle,
  Plus,
  Search,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Badge,
  BrandPreview,
  ColorField,
  CompanyAvatar,
  Drawer,
  EmptyState,
  LogoUploader,
  PageHeader,
  ThemePresetPicker,
} from '../components/ui';
import { apiPatch, apiPost, apiDelete } from '../lib/api';
import { useAuth } from '../lib/auth';
import { statusTone, useTenantList, type TenantRow } from './PlatformOverviewPage';

type TenantForm = {
  slug: string;
  name: string;
  host: string;
  adminEmail: string;
  brandPrimary: string;
  brandSecondary: string;
  themeMode: 'dark' | 'light';
  logoUrl: string;
};

const emptyForm: TenantForm = {
  slug: '',
  name: '',
  host: '',
  adminEmail: '',
  brandPrimary: '#8b5cf6',
  brandSecondary: '#6d28d9',
  themeMode: 'dark',
  logoUrl: '',
};

const FILTERS = ['all', 'active', 'suspended'] as const;

export function TenantsPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const tenants = useTenantList();
  const [params, setParams] = useSearchParams();

  const [form, setForm] = useState<TenantForm>(emptyForm);
  const [editing, setEditing] = useState<TenantRow | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('all');

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tenants'] });

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError(null);
    setOpen(true);
  }

  function openEdit(row: TenantRow) {
    setEditing(row);
    setError(null);
    setForm({
      slug: row.slug,
      name: row.name,
      host: row.domains[0] ?? '',
      adminEmail: '',
      brandPrimary: row.brandPrimary,
      brandSecondary: row.brandSecondary,
      themeMode: row.themeMode,
      logoUrl: row.logoUrl ?? '',
    });
    setOpen(true);
  }

  useEffect(() => {
    if (params.get('new') === '1') {
      openCreate();
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const save = useMutation({
    mutationFn: () => {
      if (editing) {
        return apiPatch(
          `/platform/tenants/${editing.id}`,
          {
            name: form.name,
            brandPrimary: form.brandPrimary,
            brandSecondary: form.brandSecondary,
            themeMode: form.themeMode,
            logoUrl: form.logoUrl || null,
          },
          token,
        );
      }
      return apiPost(
        '/platform/tenants',
        {
          slug: form.slug.trim().toLowerCase(),
          name: form.name,
          host: form.host || `${form.slug.trim().toLowerCase()}.localhost`,
          adminEmail: form.adminEmail || `admin@${form.slug.trim().toLowerCase()}.com`,
          brandPrimary: form.brandPrimary,
          brandSecondary: form.brandSecondary,
          themeMode: form.themeMode,
          ...(form.logoUrl ? { logoUrl: form.logoUrl } : {}),
        },
        token,
      );
    },
    onSuccess: () => {
      setOpen(false);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => apiDelete(`/platform/tenants/${id}`, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const restore = useMutation({
    mutationFn: (id: string) =>
      apiPost(`/platform/tenants/${id}/activate`, {}, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const retry = useMutation({
    mutationFn: (id: string) =>
      apiPost(`/platform/tenants/${id}/retry`, {}, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (tenants.data ?? []).filter(
      (t) =>
        (filter === 'all' || t.status === filter) &&
        (!q ||
          t.name.toLowerCase().includes(q) ||
          t.slug.toLowerCase().includes(q) ||
          t.domains.some((d) => d.toLowerCase().includes(q))),
    );
  }, [tenants.data, query, filter]);

  if (!session?.isPlatformAdmin) {
    return (
      <section className="erp-panel p-6 text-[var(--erp-muted)]">
        Super Admin access required to manage tenants.
      </section>
    );
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="Platform"
        icon={<Building2 size={13} />}
        title="Tenants"
        description="Provision companies and control their branding. Each tenant has its own database, roles and theme."
        actions={
          <button type="button" className="erp-btn erp-btn-primary" onClick={openCreate}>
            <Plus size={16} />
            New tenant
          </button>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1 md:max-w-sm">
          <Search
            size={15}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-muted)]"
          />
          <input
            className="erp-input !pl-9"
            placeholder="Search by name, slug or domain…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`erp-chip capitalize ${filter === f ? 'erp-chip-active' : ''}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {error && !open && (
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--erp-danger)]">
          {error}
        </p>
      )}

      {tenants.isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="erp-skeleton h-52" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<Building2 size={22} />}
          title="No tenants found"
          description="Try a different search, or provision a new company."
          action={
            <button type="button" className="erp-btn erp-btn-primary" onClick={openCreate}>
              <Plus size={15} />
              New tenant
            </button>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.id} className="erp-panel overflow-hidden">
              <div
                className="h-1.5"
                style={{
                  background: `linear-gradient(90deg, ${row.brandPrimary}, ${row.brandSecondary})`,
                }}
              />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <CompanyAvatar name={row.name} logoUrl={row.logoUrl} size={44} />
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{row.name}</p>
                      <p className="truncate text-xs text-[var(--erp-muted)]">
                        {row.domains[0] ?? `${row.slug}.localhost`}
                      </p>
                    </div>
                  </div>
                  <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                </div>

                <dl className="mt-4 grid grid-cols-3 gap-3 text-xs">
                  <div>
                    <dt className="text-[var(--erp-muted)]">Members</dt>
                    <dd className="mt-0.5 text-base font-semibold">{row.activeMembers ?? 0}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--erp-muted)]">Theme</dt>
                    <dd className="mt-1 flex items-center gap-1.5 capitalize">
                      <span
                        className="h-3.5 w-3.5 rounded-full ring-1 ring-[var(--erp-line)]"
                        style={{
                          background: `linear-gradient(135deg, ${row.brandPrimary}, ${row.brandSecondary})`,
                        }}
                      />
                      {row.themeMode}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[var(--erp-muted)]">Database</dt>
                    <dd className="mt-1 truncate font-mono text-[11px]">{row.databaseName}</dd>
                  </div>
                </dl>

                <div className="mt-5 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="erp-btn erp-btn-ghost erp-btn-sm"
                    onClick={() => openEdit(row)}
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                  {row.status === 'failed' && (
                    <button
                      type="button"
                      className="erp-btn erp-btn-primary erp-btn-sm"
                      onClick={() => retry.mutate(row.id)}
                      disabled={retry.isPending}
                    >
                      Retry provision
                    </button>
                  )}
                  {row.slug !== 'demo' &&
                    (row.status === 'suspended' ? (
                      <button
                        type="button"
                        className="erp-btn erp-btn-ghost erp-btn-sm"
                        onClick={() => restore.mutate(row.id)}
                      >
                        <PlayCircle size={12} />
                        Restore
                      </button>
                    ) : row.status !== 'failed' ? (
                      <button
                        type="button"
                        className="erp-btn erp-btn-danger erp-btn-sm"
                        onClick={() => {
                          if (confirm(`Suspend ${row.name}? Its users will lose access.`))
                            suspend.mutate(row.id);
                        }}
                      >
                        <PauseCircle size={12} />
                        Suspend
                      </button>
                    ) : null)}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        title={editing ? `Edit ${editing.name}` : 'Provision tenant'}
        subtitle={
          editing
            ? 'Update branding and identity.'
            : 'Creates a dedicated database, roles and an admin user.'
        }
        footer={
          <>
            <button type="button" className="erp-btn erp-btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              type="submit"
              form="tenant-form"
              className="erp-btn erp-btn-primary"
              disabled={save.isPending}
            >
              {save.isPending ? 'Saving…' : editing ? 'Save changes' : 'Create tenant'}
            </button>
          </>
        }
      >
        <form
          id="tenant-form"
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            save.mutate();
          }}
        >
          {error && (
            <p className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--erp-danger)]">
              {error}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="sm:col-span-2">
              <span className="erp-label">Company name</span>
              <input
                className="erp-input"
                value={form.name}
                required
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            {!editing && (
              <>
                <label>
                  <span className="erp-label">Slug</span>
                  <input
                    className="erp-input"
                    value={form.slug}
                    required
                    pattern="[a-z0-9-]+"
                    placeholder="acme"
                    onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  />
                </label>
                <label>
                  <span className="erp-label">Host</span>
                  <input
                    className="erp-input"
                    value={form.host}
                    placeholder={`${form.slug || 'acme'}.localhost`}
                    onChange={(e) => setForm({ ...form, host: e.target.value })}
                  />
                </label>
                <label className="sm:col-span-2">
                  <span className="erp-label">Admin email</span>
                  <input
                    className="erp-input"
                    type="email"
                    value={form.adminEmail}
                    placeholder={`admin@${form.slug || 'acme'}.com`}
                    onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
                  />
                </label>
              </>
            )}
          </div>

          <LogoUploader
            value={form.logoUrl}
            name={form.name}
            onChange={(logoUrl) => setForm({ ...form, logoUrl })}
          />

          <ThemePresetPicker
            primary={form.brandPrimary}
            onPick={(brandPrimary, brandSecondary) =>
              setForm({ ...form, brandPrimary, brandSecondary })
            }
          />

          <div className="grid gap-4 sm:grid-cols-2">
            <ColorField
              label="Primary"
              value={form.brandPrimary}
              onChange={(brandPrimary) => setForm({ ...form, brandPrimary })}
            />
            <ColorField
              label="Secondary"
              value={form.brandSecondary}
              onChange={(brandSecondary) => setForm({ ...form, brandSecondary })}
            />
          </div>

          <div>
            <span className="erp-label">Default appearance</span>
            <div className="flex gap-2">
              {(['dark', 'light'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setForm({ ...form, themeMode: m })}
                  className={`erp-chip capitalize ${form.themeMode === m ? 'erp-chip-active' : ''}`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--erp-muted)]">
              Users can still choose light, dark or system for themselves.
            </p>
          </div>

          <div>
            <span className="erp-label">Live preview</span>
            <BrandPreview
              name={form.name}
              logoUrl={form.logoUrl}
              primary={form.brandPrimary}
              secondary={form.brandSecondary}
              mode={form.themeMode}
            />
          </div>
        </form>
      </Drawer>
    </section>
  );
}
