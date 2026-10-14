import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Save,
  Search,
  Shield,
  Trash2,
  UserCog,
} from 'lucide-react';
import { Fragment, useEffect, useMemo, useState, type FormEvent } from 'react';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '../lib/api';
import { useAuth } from '../lib/auth';

type Permission = {
  id: string;
  key: string;
  label: string;
  description: string | null;
};

type Role = {
  id: string;
  key: string;
  name: string;
  isSystem: boolean;
  fullAccess?: boolean;
  permissions: string[];
};

type PlanFeature = {
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
};

type PlanModule = {
  key: string;
  name: string;
  description: string | null;
  features: PlanFeature[];
};

type RolesMatrix = {
  permissions: Permission[];
  roles: Role[];
  enabledFeatures?: string[];
  planModules?: PlanModule[];
  corePermissions?: string[];
};

type MemberRow = {
  membershipId: string;
  status: string;
  user: { id: string; email: string; fullName: string };
  roles: string[];
};

function moduleOf(key: string) {
  const i = key.indexOf('.');
  return i === -1 ? 'general' : key.slice(0, i);
}

function titleCase(mod: string) {
  return mod
    .split(/[-_]/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(' ');
}

/** Prefer catalog module/feature labels when entitlements are present. */
function groupKeyForPermission(
  permission: Permission,
  matrix: RolesMatrix | undefined,
): { groupKey: string; groupLabel: string; featureLabel?: string } {
  const core = matrix?.corePermissions ?? [];
  if (core.includes(permission.key)) {
    return { groupKey: 'company', groupLabel: 'Company' };
  }
  for (const mod of matrix?.planModules ?? []) {
    for (const feat of mod.features) {
      if (feat.permissions.includes(permission.key)) {
        return {
          groupKey: `${mod.key}:${feat.key}`,
          groupLabel: `${mod.name} · ${feat.name}`,
          featureLabel: feat.key,
        };
      }
    }
  }
  const fallback = moduleOf(permission.key);
  return { groupKey: fallback, groupLabel: titleCase(fallback) };
}

export function RolesPage() {
  const { session } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const [permForm, setPermForm] = useState({ key: '', label: '', description: '' });
  const [roleForm, setRoleForm] = useState({ key: '', name: '' });
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState<string>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [showCreate, setShowCreate] = useState(false);
  /** Local matrix edits — saved in one API batch per dirty role. */
  const [draft, setDraft] = useState<Record<string, string[]> | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const roles = useQuery({
    queryKey: ['roles-matrix'],
    queryFn: () => apiGet<RolesMatrix>('/access/roles', token),
    enabled: !!token,
  });

  const members = useQuery({
    queryKey: ['members'],
    queryFn: () => apiGet<MemberRow[]>('/access/members', token),
    enabled: !!token,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['roles-matrix'] });
    queryClient.invalidateQueries({ queryKey: ['members'] });
  };

  useEffect(() => {
    if (!roles.data || dirty) return;
    setDraft(
      Object.fromEntries(
        roles.data.roles.map((r) => [r.id, [...r.permissions]]),
      ),
    );
  }, [roles.data, dirty]);

  const moduleFilters = useMemo(() => {
    const labels = new Map<string, string>();
    for (const p of roles.data?.permissions ?? []) {
      const g = groupKeyForPermission(p, roles.data);
      labels.set(g.groupKey, g.groupLabel);
    }
    return [...labels.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) => ({ key, label }));
  }, [roles.data]);

  const filteredBySearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roles.data?.permissions ?? []).filter((p) => {
      const g = groupKeyForPermission(p, roles.data);
      if (moduleFilter !== 'all' && g.groupKey !== moduleFilter) return false;
      if (!q) return true;
      return (
        p.key.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        g.groupLabel.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [roles.data, search, moduleFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, { label: string; perms: Permission[] }>();
    for (const p of filteredBySearch) {
      const g = groupKeyForPermission(p, roles.data);
      const entry = map.get(g.groupKey) ?? { label: g.groupLabel, perms: [] };
      entry.perms.push(p);
      map.set(g.groupKey, entry);
    }
    return [...map.entries()]
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([mod, { label, perms }]) => ({
        mod,
        label,
        perms: perms.sort((a, b) => a.key.localeCompare(b.key)),
      }));
  }, [filteredBySearch, roles.data]);

  const createPermission = useMutation({
    mutationFn: () => apiPost('/access/permissions', permForm, token),
    onSuccess: () => {
      setPermForm({ key: '', label: '', description: '' });
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const updatePermission = useMutation({
    mutationFn: ({ id, label }: { id: string; label: string }) =>
      apiPatch(`/access/permissions/${id}`, { label }, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const deletePermission = useMutation({
    mutationFn: (id: string) => apiDelete(`/access/permissions/${id}`, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const createRole = useMutation({
    mutationFn: () => apiPost('/access/roles', roleForm, token),
    onSuccess: () => {
      setRoleForm({ key: '', name: '' });
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      apiPatch(`/access/roles/${id}`, { name }, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const deleteRole = useMutation({
    mutationFn: (id: string) => apiDelete(`/access/roles/${id}`, token),
    onSuccess: invalidate,
    onError: (err) => setError((err as Error).message),
  });

  const saveGrants = useMutation({
    mutationFn: async () => {
      if (!roles.data || !draft) return;
      const dirtyRoles = roles.data.roles.filter((role) => {
        if (role.fullAccess) return false;
        const next = [...(draft[role.id] ?? [])].sort().join('\0');
        const prev = [...role.permissions].sort().join('\0');
        return next !== prev;
      });
      if (!dirtyRoles.length) return { saved: 0 };
      await Promise.all(
        dirtyRoles.map((role) =>
          apiPut(
            `/access/roles/${role.id}/permissions`,
            { permissionKeys: draft[role.id] ?? [] },
            token,
          ),
        ),
      );
      return { saved: dirtyRoles.length };
    },
    onSuccess: (result) => {
      setDirty(false);
      setError(null);
      setSaveOk(
        result?.saved
          ? `Saved permissions for ${result.saved} role${result.saved === 1 ? '' : 's'}`
          : 'No changes to save',
      );
      invalidate();
    },
    onError: (err) => {
      setSaveOk(null);
      setError((err as Error).message);
    },
  });

  const assign = useMutation({
    mutationFn: ({ membershipId, roleKey }: { membershipId: string; roleKey: string }) =>
      apiPost(`/access/members/${membershipId}/roles`, { roleKey }, token),
    onSuccess: invalidate,
  });

  const unassign = useMutation({
    mutationFn: ({ membershipId, roleKey }: { membershipId: string; roleKey: string }) =>
      apiDelete(`/access/members/${membershipId}/roles/${roleKey}`, token),
    onSuccess: invalidate,
  });

  const revoke = useMutation({
    mutationFn: (membershipId: string) =>
      apiPost(`/access/members/${membershipId}/revoke`, {}, token),
    onSuccess: invalidate,
  });

  const roleList = roles.data?.roles ?? [];
  const busy = saveGrants.isPending;

  const hasUnsavedChanges = useMemo(() => {
    if (!roles.data || !draft) return false;
    return roles.data.roles.some((role) => {
      if (role.fullAccess) return false;
      const next = [...(draft[role.id] ?? [])].sort().join('\0');
      const prev = [...role.permissions].sort().join('\0');
      return next !== prev;
    });
  }, [roles.data, draft]);

  function toggleModule(mod: string) {
    setCollapsed((c) => ({ ...c, [mod]: !c[mod] }));
  }

  function expandAll() {
    setCollapsed({});
  }

  function collapseAll() {
    const next: Record<string, boolean> = {};
    for (const { mod } of grouped) next[mod] = true;
    setCollapsed(next);
  }

  function isGranted(role: Role, permissionKey: string) {
    if (role.fullAccess) return true;
    return (draft?.[role.id] ?? role.permissions).includes(permissionKey);
  }

  function toggleDraft(roleId: string, permissionKey: string) {
    setSaveOk(null);
    setDraft((prev) => {
      const base =
        prev ??
        Object.fromEntries(roleList.map((r) => [r.id, [...r.permissions]]));
      const set = new Set(base[roleId] ?? []);
      if (set.has(permissionKey)) set.delete(permissionKey);
      else set.add(permissionKey);
      return { ...base, [roleId]: [...set] };
    });
    setDirty(true);
  }

  function discardDraft() {
    if (!roles.data) return;
    setDraft(
      Object.fromEntries(
        roles.data.roles.map((r) => [r.id, [...r.permissions]]),
      ),
    );
    setDirty(false);
    setSaveOk(null);
    setError(null);
  }

  return (
    <section className="space-y-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--erp-line)] px-5 py-6 md:px-7"
        style={{ background: 'var(--erp-grad-soft), var(--erp-grad-panel)' }}
      >
        <div className="pointer-events-none absolute -right-10 -top-16 h-48 w-48 rounded-full bg-[var(--erp-accent)] opacity-[0.08] blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-[var(--erp-accent)]">
              <Shield size={14} />
              Access
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Roles & permissions</h1>
            <p className="mt-2 max-w-xl text-[var(--erp-muted)]">
              Only permissions for features enabled on this company&apos;s plan are listed.
              Company Admin still has full access within those enabled modules.
            </p>
          </div>
          <button
            type="button"
            className="erp-btn erp-btn-primary"
            onClick={() => setShowCreate((v) => !v)}
          >
            <Plus size={16} />
            {showCreate ? 'Hide forms' : 'Create'}
          </button>
        </div>
      </div>

      {error && (
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_30%,transparent)] bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--erp-danger)]">
          {error}
        </p>
      )}
      {saveOk && !error && (
        <p className="rounded-xl border border-[color-mix(in_srgb,var(--erp-accent)_30%,transparent)] bg-[color-mix(in_srgb,var(--erp-accent)_10%,transparent)] px-3 py-2 text-sm text-[var(--erp-accent)]">
          {saveOk}
        </p>
      )}

      {(hasUnsavedChanges || dirty) && (
        <div className="sticky top-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[color-mix(in_srgb,var(--erp-accent)_35%,transparent)] bg-[color-mix(in_srgb,var(--erp-panel)_92%,transparent)] px-4 py-3 shadow-lg backdrop-blur">
          <p className="text-sm text-[var(--erp-muted)]">
            Permission changes are local until you save.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="erp-btn"
              disabled={busy}
              onClick={discardDraft}
            >
              Discard
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-primary"
              disabled={busy || !hasUnsavedChanges}
              onClick={() => saveGrants.mutate()}
            >
              <Save size={16} />
              {busy ? 'Saving…' : 'Save permissions'}
            </button>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {roleList.map((role) => {
          const memberCount = (members.data ?? []).filter((m) =>
            m.roles.includes(role.key),
          ).length;
          const sampleMembers = (members.data ?? [])
            .filter((m) => m.roles.includes(role.key))
            .slice(0, 3);
          const grantCount = role.fullAccess
            ? 'All'
            : String((draft?.[role.id] ?? role.permissions).length);
          return (
            <div
              key={role.id}
              className="erp-panel space-y-3 p-4 transition hover:border-[var(--erp-line-hover)]"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold">{role.name}</p>
                  <p className="font-mono text-[11px] text-[var(--erp-muted)]">
                    {role.key}
                  </p>
                </div>
                {role.isSystem && (
                  <span className="rounded-full bg-[var(--erp-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--erp-accent)]">
                    System
                  </span>
                )}
              </div>
              <div className="flex gap-3 text-xs text-[var(--erp-muted)]">
                <span>
                  <span className="font-semibold text-[var(--erp-text)]">
                    {grantCount}
                  </span>{' '}
                  permissions
                </span>
                <span>
                  <span className="font-semibold text-[var(--erp-text)]">
                    {memberCount}
                  </span>{' '}
                  members
                </span>
              </div>
              {sampleMembers.length > 0 ? (
                <ul className="space-y-1 border-t border-[var(--erp-line)] pt-3">
                  {sampleMembers.map((m) => (
                    <li key={m.membershipId} className="truncate text-xs">
                      <span className="text-[var(--erp-text)]">{m.user.fullName}</span>
                      <span className="text-[var(--erp-muted)]"> · {m.user.email}</span>
                    </li>
                  ))}
                  {memberCount > sampleMembers.length && (
                    <li className="text-[11px] text-[var(--erp-muted)]">
                      +{memberCount - sampleMembers.length} more
                    </li>
                  )}
                </ul>
              ) : (
                <p className="border-t border-[var(--erp-line)] pt-3 text-xs text-[var(--erp-muted)]">
                  No members assigned yet
                </p>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            className="erp-panel space-y-3 p-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createPermission.mutate();
            }}
          >
            <h2 className="font-semibold">Create permission</h2>
            <input
              className="erp-input"
              placeholder="key e.g. reports.export"
              value={permForm.key}
              onChange={(e) => setPermForm({ ...permForm, key: e.target.value })}
              required
            />
            <input
              className="erp-input"
              placeholder="Label"
              value={permForm.label}
              onChange={(e) => setPermForm({ ...permForm, label: e.target.value })}
              required
            />
            <input
              className="erp-input"
              placeholder="Description (optional)"
              value={permForm.description}
              onChange={(e) => setPermForm({ ...permForm, description: e.target.value })}
            />
            <button type="submit" className="erp-btn erp-btn-primary">
              Add permission
            </button>
          </form>

          <form
            className="erp-panel space-y-3 p-5"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              createRole.mutate();
            }}
          >
            <h2 className="font-semibold">Create role</h2>
            <input
              className="erp-input"
              placeholder="key e.g. team_lead"
              value={roleForm.key}
              onChange={(e) => setRoleForm({ ...roleForm, key: e.target.value })}
              required
            />
            <input
              className="erp-input"
              placeholder="Display name"
              value={roleForm.name}
              onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
              required
            />
            <button type="submit" className="erp-btn erp-btn-primary">
              Add role
            </button>
          </form>
        </div>
      )}

      {(roles.data?.enabledFeatures?.length ?? 0) > 0 && (
        <div className="erp-panel flex flex-wrap items-center gap-2 p-4">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
            Active features
          </span>
          {(roles.data?.planModules ?? []).flatMap((mod) =>
            mod.features.map((f) => (
              <span key={f.key} className="erp-badge erp-badge-accent" title={mod.name}>
                {mod.name}: {f.name}
              </span>
            )),
          )}
          {(roles.data?.corePermissions ?? []).map((key) => (
            <span key={key} className="erp-badge erp-badge-neutral">
              {key}
            </span>
          ))}
        </div>
      )}

      <div className="erp-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--erp-line)] bg-[var(--erp-hover)] p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative min-w-0 flex-1 md:max-w-sm">
            <Search
              size={15}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-muted)]"
            />
            <input
              className="erp-input pl-9"
              placeholder="Search permissions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="erp-btn erp-btn-ghost !px-3 !py-1.5 !text-xs"
              onClick={expandAll}
            >
              Expand all
            </button>
            <button
              type="button"
              className="erp-btn erp-btn-ghost !px-3 !py-1.5 !text-xs"
              onClick={collapseAll}
            >
              Collapse all
            </button>
            <span className="text-xs text-[var(--erp-muted)]">
              {filteredBySearch.length} of {roles.data?.permissions.length ?? 0}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-[var(--erp-line)] px-4 py-3">
          <button
            type="button"
            className={['erp-chip', moduleFilter === 'all' ? 'erp-chip-active' : ''].join(
              ' ',
            )}
            onClick={() => setModuleFilter('all')}
          >
            All modules
          </button>
          {moduleFilters.map((mod) => (
            <button
              key={mod.key}
              type="button"
              className={[
                'erp-chip',
                moduleFilter === mod.key ? 'erp-chip-active' : '',
              ].join(' ')}
              onClick={() => setModuleFilter(mod.key)}
            >
              {mod.label}
            </button>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-[var(--erp-line)] text-[var(--erp-muted)]">
                <th className="sticky left-0 z-20 min-w-[240px] bg-[var(--erp-panel)] px-4 py-3 font-medium backdrop-blur">
                  Permission
                </th>
                {roleList.map((role) => (
                  <th
                    key={role.id}
                    className="min-w-[110px] px-3 py-3 text-center font-medium"
                  >
                    <div className="flex flex-col items-center gap-1">
                      <button
                        type="button"
                        className="font-medium text-[var(--erp-text)] transition hover:text-[var(--erp-accent)]"
                        title={role.fullAccess ? 'Full company access' : 'Rename role'}
                        onClick={() => {
                          if (role.fullAccess || role.isSystem) return;
                          const name = prompt('Rename role', role.name);
                          if (name && name !== role.name) {
                            updateRole.mutate({ id: role.id, name });
                          }
                        }}
                      >
                        {role.name}
                      </button>
                      <span className="text-[10px] text-[var(--erp-muted)]">{role.key}</span>
                      {role.fullAccess && (
                        <span className="rounded-full bg-[var(--erp-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--erp-accent)]">
                          Full access
                        </span>
                      )}
                      {!role.isSystem && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[10px] text-[var(--erp-danger)] transition hover:underline"
                          onClick={() => {
                            if (confirm(`Delete role ${role.name}?`)) {
                              deleteRole.mutate(role.id);
                            }
                          }}
                        >
                          <Trash2 size={10} />
                          Delete
                        </button>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grouped.length === 0 && (
                <tr>
                  <td
                    colSpan={roleList.length + 1}
                    className="px-4 py-10 text-center text-[var(--erp-muted)]"
                  >
                    No permissions match your filters.
                  </td>
                </tr>
              )}
              {grouped.map(({ mod, label, perms }) => {
                const isCollapsed = !!collapsed[mod];
                return (
                  <Fragment key={`mod-${mod}`}>
                    <tr className="bg-[var(--erp-accent-softer)]">
                      <td
                        colSpan={roleList.length + 1}
                        className="sticky left-0 px-3 py-2"
                      >
                        <button
                          type="button"
                          onClick={() => toggleModule(mod)}
                          className="flex w-full items-center gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-[var(--erp-accent-soft)]"
                        >
                          {isCollapsed ? (
                            <ChevronRight size={16} className="text-[var(--erp-accent)]" />
                          ) : (
                            <ChevronDown size={16} className="text-[var(--erp-accent)]" />
                          )}
                          <span className="font-semibold text-[var(--erp-accent)]">
                            {label}
                          </span>
                          <span className="rounded-full bg-[var(--erp-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--erp-accent)]">
                            {perms.length}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!isCollapsed &&
                      perms.map((permission) => (
                        <tr
                          key={permission.id}
                          className="erp-row border-b border-[var(--erp-line)]/50"
                        >
                          <td className="sticky left-0 z-10 bg-[var(--erp-panel)] px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <button
                                  type="button"
                                  className="text-left font-medium transition hover:text-[var(--erp-accent)]"
                                  title="Rename label"
                                  onClick={() => {
                                    const label = prompt(
                                      'Rename permission label',
                                      permission.label,
                                    );
                                    if (label && label !== permission.label) {
                                      updatePermission.mutate({
                                        id: permission.id,
                                        label,
                                      });
                                    }
                                  }}
                                >
                                  {permission.label}
                                </button>
                                <p className="font-mono text-[11px] text-[var(--erp-muted)]">
                                  {permission.key}
                                </p>
                              </div>
                              <button
                                type="button"
                                className="rounded-lg p-1.5 text-[var(--erp-muted)] transition hover:bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] hover:text-[var(--erp-danger)]"
                                title="Delete permission"
                                onClick={() => {
                                  if (confirm(`Delete permission ${permission.key}?`)) {
                                    deletePermission.mutate(permission.id);
                                  }
                                }}
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>
                          </td>
                          {roleList.map((role) => {
                            const granted = isGranted(role, permission.key);
                            const locked = !!role.fullAccess;
                            return (
                              <td
                                key={`${role.id}-${permission.key}`}
                                className="px-3 py-3 text-center"
                              >
                                <label
                                  className={[
                                    'inline-flex items-center justify-center',
                                    locked ? 'cursor-default' : 'cursor-pointer',
                                  ].join(' ')}
                                  title={
                                    locked
                                      ? 'Company Admin always has full tenant access'
                                      : undefined
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    className="erp-check"
                                    checked={granted}
                                    disabled={locked || busy}
                                    aria-label={`${role.name}: ${permission.label}`}
                                    onChange={() => {
                                      if (locked) return;
                                      toggleDraft(role.id, permission.key);
                                    }}
                                  />
                                </label>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="erp-panel p-5">
        <div className="mb-4 flex items-center gap-2">
          <UserCog size={18} className="text-[var(--erp-accent)]" />
          <h2 className="font-semibold">Members</h2>
        </div>
        <div className="space-y-3">
          {(members.data ?? []).map((member) => (
            <div
              key={member.membershipId}
              className="group flex flex-col gap-3 rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-4 transition hover:border-[var(--erp-line-hover)] hover:shadow-[var(--erp-shadow)] md:flex-row md:items-center md:justify-between"
            >
              <div>
                <p className="font-medium transition group-hover:text-[var(--erp-accent)]">
                  {member.user.fullName}
                </p>
                <p className="text-sm text-[var(--erp-muted)]">{member.user.email}</p>
                <p className="mt-1 text-xs text-[var(--erp-muted)]">
                  Status:{' '}
                  <span className="text-[var(--erp-accent)]">{member.status}</span>
                </p>
              </div>
              <div className="flex flex-col gap-3 md:items-end">
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {roleList.map((role) => {
                    const hasRole = member.roles.includes(role.key);
                    return (
                      <label
                        key={role.key}
                        className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1 text-xs transition hover:bg-[var(--erp-accent-soft)]"
                      >
                        <input
                          type="checkbox"
                          className="erp-check"
                          checked={hasRole}
                          disabled={assign.isPending || unassign.isPending}
                          onChange={() =>
                            hasRole
                              ? unassign.mutate({
                                  membershipId: member.membershipId,
                                  roleKey: role.key,
                                })
                              : assign.mutate({
                                  membershipId: member.membershipId,
                                  roleKey: role.key,
                                })
                          }
                        />
                        <span className={hasRole ? 'text-[var(--erp-accent)]' : ''}>
                          {role.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
                {member.status === 'active' && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirm('Revoke this membership?')) {
                        revoke.mutate(member.membershipId);
                      }
                    }}
                    className="erp-btn erp-btn-danger !px-3 !py-1.5 !text-xs"
                  >
                    Revoke access
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
