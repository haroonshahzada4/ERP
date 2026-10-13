import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch } from '../lib/api';
import { useAuth } from '../lib/auth';

type EmployeeProfile = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  dateOfJoining: string | null;
  basicSalary: string | null;
  cnic: string | null;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  employmentTypeId: string | null;
  employmentStatusId: string | null;
  reportingToId: string | null;
  branch: { name: string } | null;
  department: { name: string } | null;
  designation: { name: string } | null;
  employmentType: { name: string } | null;
  employmentStatus: { name: string } | null;
  reportingTo: { id: string; fullName: string; employeeCode: string } | null;
  documents: { id: string; fileName: string; documentType: { name: string } | null }[];
  history: {
    id: string;
    title: string;
    notes: string | null;
    effectiveFrom: string;
    effectiveTo: string | null;
  }[];
  directReports: { id: string; fullName: string; employeeCode: string }[];
};

type Setup = {
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  employmentTypes: { id: string; name: string }[];
  employmentStatuses: { id: string; name: string }[];
};

type EmployeeListItem = { id: string; fullName: string };

const tabs = ['Overview', 'Edit', 'History', 'Documents', 'Team'] as const;

export function EmployeeProfilePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { session, hasPermission } = useAuth();
  const canWrite = hasPermission('employee.write');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Overview');
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    employeeCode: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    branchId: '',
    departmentId: '',
    designationId: '',
    employmentTypeId: '',
    employmentStatusId: '',
    reportingToId: '',
    dateOfJoining: '',
    basicSalary: '',
    cnic: '',
  });

  const profile = useQuery({
    queryKey: ['employee', id],
    queryFn: () =>
      apiGet<EmployeeProfile>(`/hrm/employees/${id}`, session?.accessToken),
    enabled: !!session && !!id,
  });

  const setup = useQuery({
    queryKey: ['org-setup'],
    queryFn: () => apiGet<Setup>('/hrm/organization/setup', session?.accessToken),
    enabled: !!session && canWrite,
  });

  const allEmployees = useQuery({
    queryKey: ['employees'],
    queryFn: () => apiGet<EmployeeListItem[]>('/hrm/employees', session?.accessToken),
    enabled: !!session && canWrite,
  });

  useEffect(() => {
    if (!profile.data) return;
    const e = profile.data;
    setForm({
      employeeCode: e.employeeCode,
      firstName: e.firstName,
      lastName: e.lastName,
      email: e.email,
      phone: e.phone ?? '',
      branchId: e.branchId ?? '',
      departmentId: e.departmentId ?? '',
      designationId: e.designationId ?? '',
      employmentTypeId: e.employmentTypeId ?? '',
      employmentStatusId: e.employmentStatusId ?? '',
      reportingToId: e.reportingToId ?? '',
      dateOfJoining: e.dateOfJoining ?? '',
      basicSalary: e.basicSalary ?? '',
      cnic: e.cnic ?? '',
    });
  }, [profile.data]);

  const update = useMutation({
    mutationFn: () =>
      apiPatch(
        `/hrm/employees/${id}`,
        {
          ...form,
          phone: form.phone || null,
          branchId: form.branchId || null,
          departmentId: form.departmentId || null,
          designationId: form.designationId || null,
          employmentTypeId: form.employmentTypeId || null,
          employmentStatusId: form.employmentStatusId || null,
          reportingToId: form.reportingToId || null,
          dateOfJoining: form.dateOfJoining || null,
          basicSalary: form.basicSalary || null,
          cnic: form.cnic || null,
        },
        session?.accessToken,
      ),
    onSuccess: () => {
      setError(null);
      setTab('Overview');
      queryClient.invalidateQueries({ queryKey: ['employee', id] });
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: () => apiDelete(`/hrm/employees/${id}`, session?.accessToken),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['employees'] });
      navigate('/employees');
    },
    onError: (err) => setError((err as Error).message),
  });

  if (profile.isLoading) {
    return <p className="text-[var(--erp-muted)]">Loading profile…</p>;
  }

  if (profile.isError || !profile.data) {
    return (
      <div className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel)] p-6">
        <p className="text-[var(--erp-danger)]">
          {(profile.error as Error)?.message ?? 'Employee not found'}
        </p>
        <Link to="/employees" className="mt-3 inline-block text-[var(--erp-accent)]">
          Back to employees
        </Link>
      </div>
    );
  }

  const e = profile.data;
  const visibleTabs = canWrite ? tabs : tabs.filter((t) => t !== 'Edit');

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <Link
            to="/employees"
            className="text-sm text-[var(--erp-muted)] hover:text-[var(--erp-accent)]"
          >
            ← Employees
          </Link>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{e.fullName}</h1>
          <p className="mt-1 text-[var(--erp-muted)]">
            {e.employeeCode} · {e.designation?.name ?? 'No designation'} ·{' '}
            {e.department?.name ?? 'No department'}
          </p>
        </div>
        {canWrite && (
          <div className="flex gap-2">
            <button
              onClick={() => setTab('Edit')}
              className="rounded-xl border border-[var(--erp-line)] px-4 py-2 text-sm"
            >
              Edit
            </button>
            <button
              onClick={() => {
                if (confirm(`Delete ${e.fullName}?`)) remove.mutate();
              }}
              className="rounded-xl border border-[color-mix(in_srgb,var(--erp-danger)_40%,transparent)] px-4 py-2 text-sm text-[var(--erp-danger)]"
            >
              Delete
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {visibleTabs.map((item) => (
          <button
            key={item}
            onClick={() => setTab(item)}
            className={[
              'rounded-xl px-4 py-2 text-sm',
              tab === item
                ? 'bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]'
                : 'border border-[var(--erp-line)] text-[var(--erp-muted)]',
            ].join(' ')}
          >
            {item}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-xl bg-[color-mix(in_srgb,var(--erp-danger)_10%,transparent)] px-3 py-2 text-sm text-[var(--erp-danger)]">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel)] p-5">
        {tab === 'Overview' && (
          <dl className="grid gap-4 sm:grid-cols-2 text-sm">
            {[
              ['Email', e.email],
              ['Phone', e.phone ?? '—'],
              ['Branch', e.branch?.name ?? '—'],
              ['Status', e.employmentStatus?.name ?? '—'],
              ['Type', e.employmentType?.name ?? '—'],
              ['Joined', e.dateOfJoining ?? '—'],
              ['Manager', e.reportingTo?.fullName ?? '—'],
              ['Salary', e.basicSalary ?? 'Restricted'],
              ['CNIC', e.cnic ?? 'Restricted'],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-[var(--erp-muted)]">{label}</dt>
                <dd className="mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {tab === 'Edit' && canWrite && (
          <form
            className="grid gap-3 md:grid-cols-2"
            onSubmit={(ev: FormEvent) => {
              ev.preventDefault();
              update.mutate();
            }}
          >
            {(
              [
                ['employeeCode', 'Employee code'],
                ['firstName', 'First name'],
                ['lastName', 'Last name'],
                ['email', 'Email'],
                ['phone', 'Phone'],
                ['dateOfJoining', 'Date of joining'],
                ['basicSalary', 'Basic salary'],
                ['cnic', 'CNIC'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="text-sm text-[var(--erp-muted)]">
                {label}
                <input
                  className="mt-1 w-full rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2 text-[var(--erp-text)]"
                  type={
                    key === 'dateOfJoining' ? 'date' : key === 'email' ? 'email' : 'text'
                  }
                  value={form[key]}
                  onChange={(ev) => setForm({ ...form, [key]: ev.target.value })}
                  required={['employeeCode', 'firstName', 'lastName', 'email'].includes(
                    key,
                  )}
                />
              </label>
            ))}
            {(
              [
                ['branchId', 'Branch', setup.data?.branches ?? []],
                ['departmentId', 'Department', setup.data?.departments ?? []],
                ['designationId', 'Designation', setup.data?.designations ?? []],
                ['employmentTypeId', 'Type', setup.data?.employmentTypes ?? []],
                ['employmentStatusId', 'Status', setup.data?.employmentStatuses ?? []],
              ] as const
            ).map(([key, label, options]) => (
              <label key={key} className="text-sm text-[var(--erp-muted)]">
                {label}
                <select
                  className="mt-1 w-full rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2"
                  value={form[key]}
                  onChange={(ev) => setForm({ ...form, [key]: ev.target.value })}
                >
                  <option value="">Select</option>
                  {options.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.name}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <label className="text-sm text-[var(--erp-muted)]">
              Reports to
              <select
                className="mt-1 w-full rounded-xl border border-[var(--erp-line)] bg-[var(--erp-bg)] px-3 py-2"
                value={form.reportingToId}
                onChange={(ev) => setForm({ ...form, reportingToId: ev.target.value })}
              >
                <option value="">None</option>
                {(allEmployees.data ?? [])
                  .filter((row) => row.id !== id)
                  .map((row) => (
                    <option key={row.id} value={row.id}>
                      {row.fullName}
                    </option>
                  ))}
              </select>
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={update.isPending}
                className="rounded-xl bg-[var(--erp-accent)] px-4 py-2 text-sm font-semibold text-[var(--erp-on-accent)] disabled:opacity-60"
              >
                {update.isPending ? 'Saving…' : 'Save changes'}
              </button>
            </div>
          </form>
        )}

        {tab === 'History' && (
          <ul className="space-y-3 text-sm">
            {(e.history ?? []).map((h) => (
              <li
                key={h.id}
                className="rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-3"
              >
                <p className="font-medium">{h.title}</p>
                <p className="text-[var(--erp-muted)]">{h.notes}</p>
                <p className="mt-1 text-xs text-[var(--erp-accent)]">
                  {h.effectiveFrom}
                  {h.effectiveTo ? ` → ${h.effectiveTo}` : ' → present'}
                </p>
              </li>
            ))}
            {!e.history?.length && (
              <p className="text-[var(--erp-muted)]">No history yet.</p>
            )}
          </ul>
        )}

        {tab === 'Documents' && (
          <ul className="space-y-3 text-sm">
            {(e.documents ?? []).map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between rounded-xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] px-3 py-2"
              >
                <span>{d.fileName}</span>
                <span className="text-[var(--erp-muted)]">{d.documentType?.name}</span>
              </li>
            ))}
            {!e.documents?.length && (
              <p className="text-[var(--erp-muted)]">No documents uploaded.</p>
            )}
          </ul>
        )}

        {tab === 'Team' && (
          <ul className="space-y-3 text-sm">
            {(e.directReports ?? []).map((r) => (
              <li key={r.id}>
                <Link
                  to={`/employees/${r.id}`}
                  className="text-[var(--erp-accent)] hover:underline"
                >
                  {r.fullName}
                </Link>{' '}
                <span className="text-[var(--erp-muted)]">({r.employeeCode})</span>
              </li>
            ))}
            {!e.directReports?.length && (
              <p className="text-[var(--erp-muted)]">No direct reports.</p>
            )}
          </ul>
        )}
      </div>
    </section>
  );
}
