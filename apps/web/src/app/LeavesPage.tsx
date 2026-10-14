import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Badge, PageHeader } from '../components/ui';
import { apiDelete, apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

type LeaveType = {
  id: string;
  name: string;
  code: string;
  isPaid: boolean;
  allowHalfDay: boolean;
  maxDaysPerYear: string;
};

type BalancePayload = {
  session: {
    name: string;
    startsOn: string;
    endsOn: string;
  };
  balances: {
    id: string;
    leaveType: {
      id: string;
      name: string;
      code: string;
      allowHalfDay: boolean;
    };
    accrued: number;
    used: number;
    remaining: number;
  }[];
};

type LeaveActions = {
  isMine: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canDecide: boolean;
};

type LeaveRequest = {
  id: string;
  employeeId: number | string;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  reason: string;
  status: string;
  employee?: { fullName: string; employeeCode: string } | null;
  leaveType?: { id?: string; name: string; code: string } | null;
  actions?: LeaveActions;
};

const PAGE_SIZE = 8;

const emptyApply = {
  leaveTypeId: '',
  startDate: '',
  endDate: '',
  isHalfDay: false,
  reason: '',
};

function statusTone(status: string) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected' || status === 'cancelled') return 'danger' as const;
  if (status.startsWith('pending')) return 'warning' as const;
  return 'neutral' as const;
}

function PaginationBar({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--erp-line)] pt-3 text-sm">
      <p className="text-[var(--erp-muted)]">
        {total} total · page {page} of {pageCount}
      </p>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="erp-btn erp-btn-ghost px-2 py-1"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={16} />
        </button>
        {Array.from({ length: pageCount }, (_, i) => i + 1)
          .filter(
            (p) => p === 1 || p === pageCount || Math.abs(p - page) <= 1,
          )
          .reduce<(number | '…')[]>((acc, p, idx, arr) => {
            if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
            acc.push(p);
            return acc;
          }, [])
          .map((p, i) =>
            p === '…' ? (
              <span key={`e${i}`} className="px-1 text-[var(--erp-muted)]">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                className={`min-w-8 rounded-lg px-2 py-1 text-sm font-medium transition ${
                  p === page
                    ? 'bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]'
                    : 'text-[var(--erp-muted)] hover:text-[var(--erp-fg)]'
                }`}
                onClick={() => onPage(p)}
              >
                {p}
              </button>
            ),
          )}
        <button
          type="button"
          className="erp-btn erp-btn-ghost px-2 py-1"
          disabled={page >= pageCount}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

export function LeavesPage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const canApproveHr = hasPermission('leave.approve');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'mine' | 'requests' | 'types'>('mine');
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | string>('all');
  const [reqPage, setReqPage] = useState(1);
  const [myReqPage, setMyReqPage] = useState(1);
  const [typePage, setTypePage] = useState(1);
  const [showTypeForm, setShowTypeForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [apply, setApply] = useState(emptyApply);
  const [typeForm, setTypeForm] = useState({
    name: '',
    code: '',
    isPaid: true,
    allowHalfDay: true,
    maxDaysPerYear: 14,
  });

  const balances = useQuery({
    queryKey: ['leave-balances'],
    queryFn: () => apiGet<BalancePayload>('/hrm/leaves/me/balances', token),
    enabled: !!token,
  });

  const types = useQuery({
    queryKey: ['leave-types'],
    queryFn: () => apiGet<LeaveType[]>('/hrm/leaves/types', token),
    enabled: !!token,
  });

  const requests = useQuery({
    queryKey: ['leave-requests'],
    queryFn: () => apiGet<LeaveRequest[]>('/hrm/leaves/requests', token),
    enabled: !!token,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
  };

  const resetForm = () => {
    setApply(emptyApply);
    setEditingId(null);
  };

  const startEdit = (r: LeaveRequest) => {
    setEditingId(r.id);
    setApply({
      leaveTypeId: String(r.leaveType?.id ?? ''),
      startDate: r.startDate,
      endDate: r.endDate,
      isHalfDay: r.isHalfDay,
      reason: r.reason,
    });
    setTab('mine');
    setError(null);
  };

  const applyLeave = useMutation({
    mutationFn: () => {
      const leaveTypeId = Number(apply.leaveTypeId);
      const startDate = apply.startDate;
      const endDate = apply.isHalfDay
        ? apply.startDate
        : apply.endDate || apply.startDate;
      if (!Number.isFinite(leaveTypeId) || leaveTypeId <= 0) {
        throw new Error('Select a leave type');
      }
      if (endDate < startDate) {
        throw new Error('End date must be on or after the start date');
      }
      const body = {
        leaveTypeId,
        startDate,
        endDate,
        isHalfDay: apply.isHalfDay,
        reason: apply.reason.trim(),
      };
      if (editingId) {
        return apiPatch(`/hrm/leaves/requests/${editingId}`, body, token);
      }
      return apiPost('/hrm/leaves/me/requests', body, token);
    },
    onSuccess: () => {
      resetForm();
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const deleteRequest = useMutation({
    mutationFn: (id: string) =>
      apiDelete(`/hrm/leaves/requests/${id}`, token),
    onSuccess: () => {
      if (editingId) resetForm();
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiPost(`/hrm/leaves/requests/${id}/decide`, { approve }, token),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const createType = useMutation({
    mutationFn: () => apiPost('/hrm/leaves/types', typeForm, token),
    onSuccess: () => {
      setTypeForm({
        name: '',
        code: '',
        isPaid: true,
        allowHalfDay: true,
        maxDaysPerYear: 14,
      });
      setShowTypeForm(false);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const tabs = [
    { id: 'mine' as const, label: 'My leave' },
    { id: 'requests' as const, label: 'Requests' },
    ...(canApproveHr
      ? [{ id: 'types' as const, label: 'Leave types' }]
      : []),
  ];

  const ownRequests = useMemo(() => {
    return (requests.data ?? []).filter((r) => r.actions?.isMine);
  }, [requests.data]);

  const filteredRequests = useMemo(() => {
    const list = requests.data ?? [];
    if (statusFilter === 'all') return list;
    return list.filter((r) => r.status === statusFilter);
  }, [requests.data, statusFilter]);

  const reqPageCount = Math.max(
    1,
    Math.ceil(filteredRequests.length / PAGE_SIZE),
  );
  const pagedRequests = filteredRequests.slice(
    (reqPage - 1) * PAGE_SIZE,
    reqPage * PAGE_SIZE,
  );

  const myPageCount = Math.max(1, Math.ceil(ownRequests.length / PAGE_SIZE));
  const pagedMine = ownRequests.slice(
    (myReqPage - 1) * PAGE_SIZE,
    myReqPage * PAGE_SIZE,
  );

  const typeList = types.data ?? [];
  const typePageCount = Math.max(1, Math.ceil(typeList.length / PAGE_SIZE));
  const pagedTypes = typeList.slice(
    (typePage - 1) * PAGE_SIZE,
    typePage * PAGE_SIZE,
  );

  const balanceRows = balances.data?.balances ?? [];

  function renderRowActions(r: LeaveRequest) {
    const a = r.actions;
    if (!a) return <span className="text-xs text-[var(--erp-muted)]">—</span>;

    if (a.canDecide) {
      return (
        <div className="inline-flex flex-wrap justify-end gap-1.5">
          <button
            type="button"
            className="erp-btn erp-btn-primary px-2.5 py-1 text-xs"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id: r.id, approve: true })}
          >
            Approve
          </button>
          <button
            type="button"
            className="erp-btn erp-btn-ghost px-2.5 py-1 text-xs"
            disabled={decide.isPending}
            onClick={() => decide.mutate({ id: r.id, approve: false })}
          >
            Reject
          </button>
        </div>
      );
    }

    if (a.canEdit || a.canDelete) {
      return (
        <div className="inline-flex flex-wrap justify-end gap-1">
          {a.canEdit && (
            <button
              type="button"
              className="erp-btn erp-btn-ghost px-2 py-1 text-xs"
              title="Edit"
              onClick={() => startEdit(r)}
            >
              <Pencil size={13} />
              Edit
            </button>
          )}
          {a.canDelete && (
            <button
              type="button"
              className="erp-btn erp-btn-ghost px-2 py-1 text-xs text-[var(--erp-danger)]"
              title="Delete"
              disabled={deleteRequest.isPending}
              onClick={() => {
                if (confirm('Delete this leave request?')) {
                  deleteRequest.mutate(r.id);
                }
              }}
            >
              <Trash2 size={13} />
              Delete
            </button>
          )}
        </div>
      );
    }

    return <span className="text-xs text-[var(--erp-muted)]">—</span>;
  }

  return (
    <section className="space-y-4">
      <PageHeader
        eyebrow="HRM"
        icon={<CalendarRange className="h-3.5 w-3.5" />}
        title="Leaves"
        description="Balances, applications, and approvals for the leave year."
      />

      <div className="flex flex-wrap gap-1.5 border-b border-[var(--erp-line)] pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              setError(null);
            }}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              tab === t.id
                ? 'bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]'
                : 'text-[var(--erp-muted)] hover:text-[var(--erp-fg)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400">
          {error}
        </p>
      )}

      {tab === 'mine' && (
        <div className="space-y-3">
          {/* Compact balance strip */}
          <div className="erp-panel px-4 py-3">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">Balances</h2>
              {balances.data?.session && (
                <p className="text-xs text-[var(--erp-muted)]">
                  {balances.data.session.name} ·{' '}
                  {balances.data.session.startsOn} →{' '}
                  {balances.data.session.endsOn}
                </p>
              )}
            </div>
            {balanceRows.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {balanceRows.map((b) => (
                  <div
                    key={b.id}
                    className="flex min-w-[7.5rem] flex-1 items-center justify-between gap-3 rounded-lg border border-[var(--erp-line)] bg-[color-mix(in_srgb,var(--erp-bg)_40%,transparent)] px-3 py-2 sm:max-w-[12rem]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-medium">
                        {b.leaveType.code}
                      </p>
                      <p className="truncate text-[10px] text-[var(--erp-muted)]">
                        {b.used}/{b.accrued} used
                      </p>
                    </div>
                    <p className="text-lg font-semibold tabular-nums text-[var(--erp-accent)]">
                      {b.remaining}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-[var(--erp-muted)]">
                {balances.isLoading
                  ? 'Loading balances…'
                  : 'No leave balances yet. Link an employee profile to your account.'}
              </p>
            )}
          </div>

          {/* Apply / edit form — compact single panel */}
          <form
            className="erp-panel p-4"
            onSubmit={(e: FormEvent) => {
              e.preventDefault();
              applyLeave.mutate();
            }}
          >
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {editingId ? 'Edit leave request' : 'Apply for leave'}
              </h2>
              {editingId && (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs text-[var(--erp-muted)] hover:text-[var(--erp-fg)]"
                  onClick={resetForm}
                >
                  <X size={14} />
                  Cancel edit
                </button>
              )}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="block text-sm sm:col-span-2 lg:col-span-1">
                <span className="text-xs text-[var(--erp-muted)]">Type</span>
                <select
                  className="erp-input mt-1 w-full"
                  value={apply.leaveTypeId}
                  onChange={(e) =>
                    setApply((a) => ({ ...a, leaveTypeId: e.target.value }))
                  }
                  required
                >
                  <option value="">Select</option>
                  {(types.data ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name} ({t.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                <span className="text-xs text-[var(--erp-muted)]">Start</span>
                <input
                  type="date"
                  className="erp-input mt-1 w-full"
                  value={apply.startDate}
                  onChange={(e) =>
                    setApply((a) => ({ ...a, startDate: e.target.value }))
                  }
                  required
                />
              </label>
              <label className="block text-sm">
                <span className="text-xs text-[var(--erp-muted)]">End</span>
                <input
                  type="date"
                  className="erp-input mt-1 w-full"
                  value={apply.endDate}
                  onChange={(e) =>
                    setApply((a) => ({ ...a, endDate: e.target.value }))
                  }
                  disabled={apply.isHalfDay}
                />
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm">
                <input
                  type="checkbox"
                  checked={apply.isHalfDay}
                  onChange={(e) =>
                    setApply((a) => ({
                      ...a,
                      isHalfDay: e.target.checked,
                      endDate: e.target.checked ? a.startDate : a.endDate,
                    }))
                  }
                />
                Half day
              </label>
              <label className="block text-sm sm:col-span-2 lg:col-span-3">
                <span className="text-xs text-[var(--erp-muted)]">Reason</span>
                <input
                  className="erp-input mt-1 w-full"
                  value={apply.reason}
                  onChange={(e) =>
                    setApply((a) => ({ ...a, reason: e.target.value }))
                  }
                  required
                  minLength={3}
                  placeholder="Brief reason"
                />
              </label>
              <div className="flex items-end">
                <button
                  type="submit"
                  className="erp-btn erp-btn-primary w-full"
                  disabled={applyLeave.isPending}
                >
                  {applyLeave.isPending
                    ? 'Saving…'
                    : editingId
                      ? 'Update request'
                      : 'Submit'}
                </button>
              </div>
            </div>
          </form>

          {/* My requests with edit/delete */}
          <div className="erp-panel overflow-hidden">
            <div className="border-b border-[var(--erp-line)] px-4 py-2.5">
              <h2 className="text-sm font-semibold">My requests</h2>
            </div>
            {pagedMine.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--erp-line)] text-left text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                      <th className="px-4 py-2 font-medium">Type / dates</th>
                      <th className="px-4 py-2 font-medium">Reason</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium text-right">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {pagedMine.map((r) => (
                      <tr
                        key={r.id}
                        className="border-b border-[var(--erp-line)] last:border-0 align-top"
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium">
                            {r.leaveType?.name ?? 'Leave'}
                          </p>
                          <p className="text-xs text-[var(--erp-muted)]">
                            {r.startDate}
                            {r.endDate !== r.startDate
                              ? ` → ${r.endDate}`
                              : ''}{' '}
                            · {r.days}d{r.isHalfDay ? ' (half)' : ''}
                          </p>
                        </td>
                        <td className="max-w-[12rem] px-4 py-2.5 text-[var(--erp-muted)]">
                          <span className="line-clamp-2">{r.reason}</span>
                        </td>
                        <td className="px-4 py-2.5">
                          <Badge tone={statusTone(r.status)}>
                            {r.status.replace(/_/g, ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          {renderRowActions(r)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="px-4 py-8 text-center text-sm text-[var(--erp-muted)]">
                {requests.isLoading
                  ? 'Loading…'
                  : 'No requests yet. Submit one above.'}
              </p>
            )}
            <div className="px-4 py-3">
              <PaginationBar
                page={Math.min(myReqPage, myPageCount)}
                pageCount={myPageCount}
                total={ownRequests.length}
                onPage={setMyReqPage}
              />
            </div>
          </div>
        </div>
      )}

      {tab === 'requests' && (
        <div className="erp-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--erp-line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Leave requests</h2>
            <div className="flex flex-wrap gap-1">
              {(
                [
                  ['all', 'All'],
                  ['pending_manager', 'Manager'],
                  ['pending_hr', 'HR'],
                  ['approved', 'Approved'],
                  ['rejected', 'Rejected'],
                ] as const
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setStatusFilter(id);
                    setReqPage(1);
                  }}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                    statusFilter === id
                      ? 'bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]'
                      : 'text-[var(--erp-muted)] hover:text-[var(--erp-fg)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {pagedRequests.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--erp-line)] text-left text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                    <th className="px-4 py-2 font-medium">Employee</th>
                    <th className="px-4 py-2 font-medium">Type / dates</th>
                    <th className="px-4 py-2 font-medium">Reason</th>
                    <th className="px-4 py-2 font-medium">Status</th>
                    <th className="px-4 py-2 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRequests.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-[var(--erp-line)] last:border-0 align-top"
                    >
                      <td className="px-4 py-2.5 font-medium whitespace-nowrap">
                        {r.employee?.fullName ?? 'You'}
                      </td>
                      <td className="px-4 py-2.5">
                        <p>{r.leaveType?.name ?? 'Leave'}</p>
                        <p className="text-xs text-[var(--erp-muted)]">
                          {r.startDate}
                          {r.endDate !== r.startDate
                            ? ` → ${r.endDate}`
                            : ''}{' '}
                          · {r.days}d{r.isHalfDay ? ' (half)' : ''}
                        </p>
                      </td>
                      <td className="max-w-[14rem] px-4 py-2.5 text-[var(--erp-muted)]">
                        <span className="line-clamp-2">{r.reason}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <Badge tone={statusTone(r.status)}>
                          {r.status.replace(/_/g, ' ')}
                        </Badge>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {renderRowActions(r)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-[var(--erp-muted)]">
              {requests.isLoading
                ? 'Loading requests…'
                : statusFilter === 'all'
                  ? 'No leave requests yet.'
                  : 'No requests in this filter.'}
            </p>
          )}

          <div className="px-4 py-3">
            <PaginationBar
              page={Math.min(reqPage, reqPageCount)}
              pageCount={reqPageCount}
              total={filteredRequests.length}
              onPage={setReqPage}
            />
          </div>
        </div>
      )}

      {tab === 'types' && canApproveHr && (
        <div className="erp-panel overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--erp-line)] px-4 py-3">
            <h2 className="text-sm font-semibold">Leave types</h2>
            <button
              type="button"
              className="erp-btn erp-btn-primary px-2.5 py-1 text-xs"
              onClick={() => setShowTypeForm((v) => !v)}
            >
              <Plus size={14} />
              {showTypeForm ? 'Hide form' : 'Add type'}
            </button>
          </div>

          {showTypeForm && (
            <form
              className="grid gap-3 border-b border-[var(--erp-line)] bg-[color-mix(in_srgb,var(--erp-panel)_80%,transparent)] p-4 sm:grid-cols-2 lg:grid-cols-4"
              onSubmit={(e) => {
                e.preventDefault();
                createType.mutate();
              }}
            >
              <input
                className="erp-input w-full"
                placeholder="Name"
                value={typeForm.name}
                onChange={(e) =>
                  setTypeForm((f) => ({ ...f, name: e.target.value }))
                }
                required
              />
              <input
                className="erp-input w-full"
                placeholder="Code"
                value={typeForm.code}
                onChange={(e) =>
                  setTypeForm((f) => ({ ...f, code: e.target.value }))
                }
                required
              />
              <input
                type="number"
                min={0}
                className="erp-input w-full"
                placeholder="Max days / year"
                value={typeForm.maxDaysPerYear}
                onChange={(e) =>
                  setTypeForm((f) => ({
                    ...f,
                    maxDaysPerYear: Number(e.target.value),
                  }))
                }
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={typeForm.isPaid}
                    onChange={(e) =>
                      setTypeForm((f) => ({ ...f, isPaid: e.target.checked }))
                    }
                  />
                  Paid
                </label>
                <label className="flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={typeForm.allowHalfDay}
                    onChange={(e) =>
                      setTypeForm((f) => ({
                        ...f,
                        allowHalfDay: e.target.checked,
                      }))
                    }
                  />
                  Half day
                </label>
                <button
                  type="submit"
                  className="erp-btn erp-btn-primary ml-auto text-xs"
                  disabled={createType.isPending}
                >
                  Create
                </button>
              </div>
            </form>
          )}

          {pagedTypes.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--erp-line)] text-left text-xs uppercase tracking-wide text-[var(--erp-muted)]">
                    <th className="px-4 py-2 font-medium">Name</th>
                    <th className="px-4 py-2 font-medium">Code</th>
                    <th className="px-4 py-2 font-medium text-right">
                      Max / year
                    </th>
                    <th className="px-4 py-2 font-medium">Flags</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedTypes.map((t) => (
                    <tr
                      key={t.id}
                      className="border-b border-[var(--erp-line)] last:border-0"
                    >
                      <td className="px-4 py-2.5 font-medium">{t.name}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-[var(--erp-muted)]">
                        {t.code}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">
                        {t.maxDaysPerYear}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-[var(--erp-muted)]">
                        {[
                          t.isPaid ? 'Paid' : 'Unpaid',
                          t.allowHalfDay ? 'Half day' : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-sm text-[var(--erp-muted)]">
              {types.isLoading ? 'Loading…' : 'No leave types configured.'}
            </p>
          )}

          <div className="px-4 py-3">
            <PaginationBar
              page={Math.min(typePage, typePageCount)}
              pageCount={typePageCount}
              total={typeList.length}
              onPage={setTypePage}
            />
          </div>
        </div>
      )}
    </section>
  );
}
