import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent, type ReactNode } from 'react';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

type Setup = {
  branches: { id: string; name: string; code: string; city: string | null }[];
  departments: {
    id: string;
    name: string;
    code: string;
    branch?: { name: string } | null;
  }[];
  designations: { id: string; name: string; code: string }[];
  employmentTypes: { id: string; name: string; code: string }[];
  employmentStatuses: { id: string; name: string; code: string }[];
  documentTypes: { id: string; name: string; code: string; isRequired: boolean }[];
};

function Panel({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel)] p-5">
      <h2 className="font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function OrganizationPage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const queryClient = useQueryClient();
  const canWrite = hasPermission('employee.write');

  const setup = useQuery({
    queryKey: ['org-setup'],
    queryFn: () => apiGet<Setup>('/hrm/organization/setup', token),
    enabled: !!token,
  });

  const [branchForm, setBranchForm] = useState({ name: '', code: '', city: '' });
  const [deptForm, setDeptForm] = useState({
    name: '',
    code: '',
    branchId: '',
  });
  const [desigForm, setDesigForm] = useState({ name: '', code: '' });

  const createBranch = useMutation({
    mutationFn: () => apiPost('/hrm/organization/branches', branchForm, token),
    onSuccess: () => {
      setBranchForm({ name: '', code: '', city: '' });
      queryClient.invalidateQueries({ queryKey: ['org-setup'] });
    },
  });

  const createDept = useMutation({
    mutationFn: () =>
      apiPost(
        '/hrm/organization/departments',
        {
          name: deptForm.name,
          code: deptForm.code,
          branchId: deptForm.branchId || undefined,
        },
        token,
      ),
    onSuccess: () => {
      setDeptForm({ name: '', code: '', branchId: '' });
      queryClient.invalidateQueries({ queryKey: ['org-setup'] });
    },
  });

  const createDesig = useMutation({
    mutationFn: () => apiPost('/hrm/organization/designations', desigForm, token),
    onSuccess: () => {
      setDesigForm({ name: '', code: '' });
      queryClient.invalidateQueries({ queryKey: ['org-setup'] });
    },
  });

  function onSubmit(
    event: FormEvent,
    action: () => void,
  ) {
    event.preventDefault();
    action();
  }

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm font-medium uppercase tracking-[0.16em] text-[var(--erp-accent)]">
          Phase 2
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Organization</h1>
        <p className="mt-2 text-[var(--erp-muted)]">
          Branches, departments, designations and employment dictionaries.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel title="Branches">
          <ul className="space-y-2 text-sm">
            {(setup.data?.branches ?? []).map((b) => (
              <li
                key={b.id}
                className="flex items-center justify-between rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-3 py-2"
              >
                <span>
                  {b.name}{' '}
                  <span className="text-[var(--erp-muted)]">({b.code})</span>
                </span>
                <span className="text-[var(--erp-muted)]">{b.city}</span>
              </li>
            ))}
          </ul>
          {canWrite && (
            <form
              className="mt-4 grid gap-2"
              onSubmit={(e) => onSubmit(e, () => createBranch.mutate())}
            >
              <input
                className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                placeholder="Name"
                value={branchForm.name}
                onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                  placeholder="Code"
                  value={branchForm.code}
                  onChange={(e) => setBranchForm({ ...branchForm, code: e.target.value })}
                  required
                />
                <input
                  className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                  placeholder="City"
                  value={branchForm.city}
                  onChange={(e) => setBranchForm({ ...branchForm, city: e.target.value })}
                />
              </div>
              <button className="rounded-xl bg-[var(--erp-accent)] px-3 py-2 text-sm font-semibold text-[var(--erp-on-accent)]">
                Add branch
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Departments">
          <ul className="space-y-2 text-sm">
            {(setup.data?.departments ?? []).map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-3 py-2"
              >
                <span>
                  {d.name}{' '}
                  <span className="text-[var(--erp-muted)]">({d.code})</span>
                </span>
                <span className="text-[var(--erp-muted)]">{d.branch?.name}</span>
              </li>
            ))}
          </ul>
          {canWrite && (
            <form
              className="mt-4 grid gap-2"
              onSubmit={(e) => onSubmit(e, () => createDept.mutate())}
            >
              <input
                className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                placeholder="Name"
                value={deptForm.name}
                onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                required
              />
              <div className="grid grid-cols-2 gap-2">
                <input
                  className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                  placeholder="Code"
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  required
                />
                <select
                  className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                  value={deptForm.branchId}
                  onChange={(e) => setDeptForm({ ...deptForm, branchId: e.target.value })}
                >
                  <option value="">Branch</option>
                  {(setup.data?.branches ?? []).map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </div>
              <button className="rounded-xl bg-[var(--erp-accent)] px-3 py-2 text-sm font-semibold text-[var(--erp-on-accent)]">
                Add department
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Designations">
          <ul className="space-y-2 text-sm">
            {(setup.data?.designations ?? []).map((d) => (
              <li
                key={d.id}
                className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-3 py-2"
              >
                {d.name}{' '}
                <span className="text-[var(--erp-muted)]">({d.code})</span>
              </li>
            ))}
          </ul>
          {canWrite && (
            <form
              className="mt-4 grid gap-2"
              onSubmit={(e) => onSubmit(e, () => createDesig.mutate())}
            >
              <input
                className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                placeholder="Name"
                value={desigForm.name}
                onChange={(e) => setDesigForm({ ...desigForm, name: e.target.value })}
                required
              />
              <input
                className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-sm"
                placeholder="Code"
                value={desigForm.code}
                onChange={(e) => setDesigForm({ ...desigForm, code: e.target.value })}
                required
              />
              <button className="rounded-xl bg-[var(--erp-accent)] px-3 py-2 text-sm font-semibold text-[var(--erp-on-accent)]">
                Add designation
              </button>
            </form>
          )}
        </Panel>

        <Panel title="Dictionaries">
          <div className="grid gap-4 sm:grid-cols-3 text-sm">
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                Types
              </p>
              {(setup.data?.employmentTypes ?? []).map((x) => (
                <p key={x.id}>{x.name}</p>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                Statuses
              </p>
              {(setup.data?.employmentStatuses ?? []).map((x) => (
                <p key={x.id}>{x.name}</p>
              ))}
            </div>
            <div>
              <p className="mb-2 text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                Documents
              </p>
              {(setup.data?.documentTypes ?? []).map((x) => (
                <p key={x.id}>
                  {x.name}
                  {x.isRequired ? ' *' : ''}
                </p>
              ))}
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}
