import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

type EmployeeRow = {
  id: string;
  employeeCode: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string | null;
  basicSalary: string | null;
  cnic: string | null;
  dateOfJoining: string | null;
  branchId: string | null;
  departmentId: string | null;
  designationId: string | null;
  employmentTypeId: string | null;
  employmentStatusId: string | null;
  reportingToId: string | null;
  branch: { name: string } | null;
  department: { name: string } | null;
  designation: { name: string } | null;
  employmentStatus: { name: string } | null;
  reportingTo: { fullName: string } | null;
};

type Setup = {
  branches: { id: string; name: string }[];
  departments: { id: string; name: string }[];
  designations: { id: string; name: string }[];
  employmentTypes: { id: string; name: string }[];
  employmentStatuses: { id: string; name: string }[];
};

type EmployeeForm = {
  employeeCode: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  branchId: string;
  departmentId: string;
  designationId: string;
  employmentTypeId: string;
  employmentStatusId: string;
  reportingToId: string;
  dateOfJoining: string;
  basicSalary: string;
  cnic: string;
};

const emptyForm: EmployeeForm = {
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
};

function toPayload(form: EmployeeForm) {
  return {
    employeeCode: form.employeeCode,
    firstName: form.firstName,
    lastName: form.lastName,
    email: form.email,
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
  };
}

function fromEmployee(row: EmployeeRow): EmployeeForm {
  return {
    employeeCode: row.employeeCode,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone ?? '',
    branchId: row.branchId ?? '',
    departmentId: row.departmentId ?? '',
    designationId: row.designationId ?? '',
    employmentTypeId: row.employmentTypeId ?? '',
    employmentStatusId: row.employmentStatusId ?? '',
    reportingToId: row.reportingToId ?? '',
    dateOfJoining: row.dateOfJoining ?? '',
    basicSalary: row.basicSalary ?? '',
    cnic: row.cnic ?? '',
  };
}

export function EmployeesPage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const canWrite = hasPermission('employee.write');
  const queryClient = useQueryClient();
  const [q, setQ] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (departmentId) params.set('departmentId', departmentId);
    const qs = params.toString();
    return qs ? `/hrm/employees?${qs}` : '/hrm/employees';
  }, [q, departmentId]);

  const employees = useQuery({
    queryKey: ['employees', q, departmentId],
    queryFn: () => apiGet<EmployeeRow[]>(query, token),
    enabled: !!token,
  });

  const setup = useQuery({
    queryKey: ['org-setup'],
    queryFn: () => apiGet<Setup>('/hrm/organization/setup', token),
    enabled: !!token,
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload = toPayload(form);
      if (mode === 'edit' && editingId) {
        return apiPatch(`/hrm/employees/${editingId}`, payload, token);
      }
      return apiPost('/hrm/employees', payload, token);
    },
    onSuccess: () => {
      setMode(null);
      setEditingId(null);
      setForm(emptyForm);
      setError(null);
      queryClient.invalidateQueries({ queryKey: ['employees'] });
    },
    onError: (err) => setError((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => apiDelete(`/hrm/employees/${id}`, token),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['employees'] }),
    onError: (err) => setError((err as Error).message),
  });

  function openCreate() {
    setMode('create');
    setEditingId(null);
    setForm(emptyForm);
    setError(null);
  }

  function openEdit(row: EmployeeRow) {
    setMode('edit');
    setEditingId(row.id);
    setForm(fromEmployee(row));
    setError(null);
  }

  function exportCsv() {
    const rows = employees.data ?? [];
    const header = ['Code', 'Name', 'Email', 'Department', 'Designation', 'Branch', 'Status'];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.employeeCode,
          r.fullName,
          r.email,
          r.department?.name ?? '',
          r.designation?.name ?? '',
          r.branch?.name ?? '',
          r.employmentStatus?.name ?? '',
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'employees.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="space-y-6">
      <div
        className="relative overflow-hidden rounded-2xl border border-[var(--erp-line)] px-5 py-6 md:px-7"
        style={{ background: 'var(--erp-grad-soft), var(--erp-grad-panel)' }}
      >
        <div className="pointer-events-none absolute -right-8 -top-14 h-44 w-44 rounded-full bg-[var(--erp-accent)] opacity-[0.08] blur-3xl" />
        <div className="relative flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-sm font-medium uppercase tracking-[0.16em] text-[var(--erp-accent)]">
              <Users size={14} />
              HRM
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">Employees</h1>
            <p className="mt-2 text-[var(--erp-muted)]">
              Create, edit, filter and export your workforce directory.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={exportCsv} className="erp-btn erp-btn-ghost">
              <Download size={15} />
              Export CSV
            </button>
            {canWrite && (
              <button
                type="button"
                onClick={() => (mode ? setMode(null) : openCreate())}
                className="erp-btn erp-btn-primary"
              >
                <Plus size={16} />
                {mode ? 'Close form' : 'New employee'}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 md:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--erp-muted)]"
          />
          <input
            className="erp-input pl-9"
            placeholder="Search name, email, code…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <select
          className="erp-input md:w-56"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
        >
          <option value="">All departments</option>
          {(setup.data?.departments ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>

      {mode && canWrite && (
        <form
          className="erp-panel grid gap-3 p-5 md:grid-cols-2"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <h2 className="md:col-span-2 font-semibold">
            {mode === 'edit' ? 'Edit employee' : 'Create employee'}
          </h2>
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
                className="erp-input mt-1"
                type={
                  key === 'dateOfJoining' ? 'date' : key === 'email' ? 'email' : 'text'
                }
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                required={['employeeCode', 'firstName', 'lastName', 'email'].includes(key)}
              />
            </label>
          ))}
          {(
            [
              ['branchId', 'Branch', setup.data?.branches ?? []],
              ['departmentId', 'Department', setup.data?.departments ?? []],
              ['designationId', 'Designation', setup.data?.designations ?? []],
              ['employmentTypeId', 'Employment type', setup.data?.employmentTypes ?? []],
              ['employmentStatusId', 'Status', setup.data?.employmentStatuses ?? []],
            ] as const
          ).map(([key, label, options]) => (
            <label key={key} className="text-sm text-[var(--erp-muted)]">
              {label}
              <select
                className="erp-input mt-1"
                value={form[key]}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
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
              className="erp-input mt-1"
              value={form.reportingToId}
              onChange={(e) => setForm({ ...form, reportingToId: e.target.value })}
            >
              <option value="">None</option>
              {(employees.data ?? [])
                .filter((e) => e.id !== editingId)
                .map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.fullName}
                  </option>
                ))}
            </select>
          </label>
          <div className="md:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={save.isPending}
              className="erp-btn erp-btn-primary"
            >
              {save.isPending ? 'Saving…' : mode === 'edit' ? 'Update' : 'Create'}
            </button>
            <button type="button" onClick={() => setMode(null)} className="erp-btn erp-btn-ghost">
              Cancel
            </button>
          </div>
          {error && (
            <p className="md:col-span-2 text-sm text-[var(--erp-danger)]">{error}</p>
          )}
        </form>
      )}

      <div className="erp-panel overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-[var(--erp-line)] text-[var(--erp-muted)]">
              <tr>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Designation</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Salary</th>
                {canWrite && <th className="px-4 py-3 font-medium">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {(employees.data ?? []).length === 0 && (
                <tr>
                  <td
                    colSpan={canWrite ? 8 : 7}
                    className="px-4 py-10 text-center text-[var(--erp-muted)]"
                  >
                    No employees found.
                  </td>
                </tr>
              )}
              {(employees.data ?? []).map((row) => (
                <tr
                  key={row.id}
                  className="erp-row border-b border-[var(--erp-line)]/50"
                >
                  <td className="px-4 py-3">
                    <Link
                      to={`/employees/${row.id}`}
                      className="font-medium text-[var(--erp-accent)] transition hover:underline"
                    >
                      {row.employeeCode}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      to={`/employees/${row.id}`}
                      className="font-medium transition hover:text-[var(--erp-accent)]"
                    >
                      {row.fullName}
                    </Link>
                    <p className="text-xs text-[var(--erp-muted)]">{row.email}</p>
                  </td>
                  <td className="px-4 py-3">{row.department?.name ?? '—'}</td>
                  <td className="px-4 py-3">{row.designation?.name ?? '—'}</td>
                  <td className="px-4 py-3">{row.reportingTo?.fullName ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[var(--erp-accent-soft)] px-2.5 py-0.5 text-xs text-[var(--erp-accent)]">
                      {row.employmentStatus?.name ?? '—'}
                    </span>
                  </td>
                  <td className="px-4 py-3 tabular-nums">{row.basicSalary ?? '•••'}</td>
                  {canWrite && (
                    <td className="px-4 py-3">
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(row)}
                          className="erp-btn erp-btn-ghost !px-2.5 !py-1.5 !text-xs"
                          title="Edit"
                        >
                          <Pencil size={13} />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete ${row.fullName}?`)) remove.mutate(row.id);
                          }}
                          className="erp-btn erp-btn-danger !px-2.5 !py-1.5 !text-xs"
                          title="Delete"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
