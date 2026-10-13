import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  Search,
  Shield,
  Trash2,
  UserCog,
} from 'lucide-react';
import { Fragment, useMemo, useState, type FormEvent } from 'react';
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

type RolesMatrix = {
  permissions: Permission[];
  roles: Role[];
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

  const modules = useMemo(() => {
    const set = new Set((roles.data?.permissions ?? []).map((p) => moduleOf(p.key)));
    return [...set].sort();
  }, [roles.data?.permissions]);

  const filteredBySearch = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (roles.data?.permissions ?? []).filter((p) => {
      if (moduleFilter !== 'all' && moduleOf(p.key) !== moduleFilter) return false;
      if (!q) return true;
      return (
        p.key.toLowerCase().includes(q) ||
        p.label.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [roles.data?.permissions, search, moduleFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const p of filteredBySearch) {
      const mod = moduleOf(p.key);
      const list = map.get(mod) ?? [];
      list.push(p);
      map.set(mod, list);
    }
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mod, perms]) => ({
        mod,
        perms: perms.sort((a, b) => a.key.localeCompare(b.key)),
      }));
  }, [filteredBySearch]);

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

  const toggleGrant = useMutation({
    mutationFn: ({
      roleId,
      permissionKey,
      granted,
    }: {
      roleId: string;
      permissionKey: string;
      granted: boolean;
    }) =>
      apiPut(
        `/access/roles/${roleId}/permissions/${permissionKey}`,
        { granted },
        token,
      ),
    onMutate: async ({ roleId, permissionKey, granted }) => {
      await queryClient.cancelQueries({ queryKey: ['roles-matrix'] });
      const prev = queryClient.getQueryData<RolesMatrix>(['roles-matrix']);
      if (prev) {
        queryClient.setQueryData<RolesMatrix>(['roles-matrix'], {
          ...prev,
          roles: prev.roles.map((role) => {
            if (role.id !== roleId) return role;
            const set = new Set(role.permissions);
            if (granted) set.add(permissionKey);
            else set.delete(permissionKey);
            return { ...role, permissions: [...set] };
          }),
        });
      }
      return { prev };
    },
    onError: (err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(['roles-matrix'], ctx.prev);
      setError((err as Error).message);
    },
    onSettled: invalidate,
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
  const busy = toggleGrant.isPending;

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
              Permissions are tenant-specific and dynamic. Company Admin has full company
              access; HR, Manager, and Employee only get grants you assign.
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
          {modules.map((mod) => (
            <button
              key={mod}
              type="button"
              className={['erp-chip', moduleFilter === mod ? 'erp-chip-active' : ''].join(
                ' ',
              )}
              onClick={() => setModuleFilter(mod)}
            >
              {titleCase(mod)}
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
              {grouped.map(({ mod, perms }) => {
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
                            {titleCase(mod)}
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
                            const granted =
                              !!role.fullAccess ||
                              role.permissions.includes(permission.key);
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
                                    disabled={
                                      locked ||
                                      (busy &&
                                        toggleGrant.variables?.roleId === role.id &&
                                        toggleGrant.variables?.permissionKey ===
                                          permission.key)
                                    }
                                    aria-label={`${role.name}: ${permission.label}`}
                                    onChange={() => {
                                      if (locked) return;
                                      toggleGrant.mutate({
                                        roleId: role.id,
                                        permissionKey: permission.key,
                                        granted: !granted,
                                      });
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
