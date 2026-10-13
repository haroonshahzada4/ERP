import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarRange } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Badge, PageHeader, StatCard } from '../components/ui';
import { apiGet, apiPost } from '../lib/api';
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

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  isHalfDay: boolean;
  reason: string;
  status: string;
  employee?: { fullName: string; employeeCode: string } | null;
  leaveType?: { name: string; code: string } | null;
  approvals?: { step: string; status: string; note: string | null }[];
};

function statusTone(status: string) {
  if (status === 'approved') return 'success' as const;
  if (status === 'rejected' || status === 'cancelled') return 'danger' as const;
  if (status.startsWith('pending')) return 'warning' as const;
  return 'neutral' as const;
}

export function LeavesPage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const canApproveHr = hasPermission('leave.approve');
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'balances' | 'apply' | 'requests' | 'types'>(
    'balances',
  );
  const [error, setError] = useState<string | null>(null);
  const [apply, setApply] = useState({
    leaveTypeId: '',
    startDate: '',
    endDate: '',
    isHalfDay: false,
    reason: '',
  });
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
    enabled: !!token && (tab === 'requests' || tab === 'apply'),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['leave-balances'] });
    queryClient.invalidateQueries({ queryKey: ['leave-types'] });
    queryClient.invalidateQueries({ queryKey: ['leave-requests'] });
  };

  const applyLeave = useMutation({
    mutationFn: () =>
      apiPost(
        '/hrm/leaves/me/requests',
        {
          leaveTypeId: apply.leaveTypeId,
          startDate: apply.startDate,
          endDate: apply.endDate || apply.startDate,
          isHalfDay: apply.isHalfDay,
          reason: apply.reason,
        },
        token,
      ),
    onSuccess: () => {
      setApply({
        leaveTypeId: '',
        startDate: '',
        endDate: '',
        isHalfDay: false,
        reason: '',
      });
      setError(null);
      setTab('requests');
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
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const tabs = [
    { id: 'balances' as const, label: 'My balances' },
    { id: 'apply' as const, label: 'Apply' },
    { id: 'requests' as const, label: 'Requests' },
    { id: 'types' as const, label: 'Leave types' },
  ];

  const canDecide = (status: string) => {
    if (status === 'pending_hr') return canApproveHr;
    if (status === 'pending_manager') return true;
    return false;
  };

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="HRM"
        icon={<CalendarRange className="h-3.5 w-3.5" />}
        title="Leaves"
        description="Balances, applications, and manager → HR approvals for the leave year."
      />

      <div className="flex flex-wrap gap-2 border-b border-[var(--erp-line)] pb-3">
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

      {tab === 'balances' && (
        <div className="space-y-4">
          {balances.data?.session && (
            <p className="text-sm text-[var(--erp-muted)]">
              Session {balances.data.session.name} (
              {balances.data.session.startsOn} → {balances.data.session.endsOn})
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {(balances.data?.balances ?? []).map((b) => (
              <StatCard
                key={b.id}
                label={b.leaveType.name}
                value={b.remaining}
                hint={`${b.used} used of ${b.accrued}`}
              />
            ))}
            {!balances.isLoading && !(balances.data?.balances ?? []).length && (
              <p className="text-sm text-[var(--erp-muted)] sm:col-span-2">
                No leave balances yet. Link an employee profile to your account.
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'apply' && (
        <form
          className="erp-panel max-w-xl space-y-3 p-5"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            applyLeave.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-[var(--erp-muted)]">Leave type</span>
            <select
              className="erp-input mt-1 w-full"
              value={apply.leaveTypeId}
              onChange={(e) =>
                setApply((a) => ({ ...a, leaveTypeId: e.target.value }))
              }
              required
            >
              <option value="">Select type</option>
              {(types.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.code})
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--erp-muted)]">Start</span>
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
              <span className="text-[var(--erp-muted)]">End</span>
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
          </div>
          <label className="flex items-center gap-2 text-sm">
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
          <label className="block text-sm">
            <span className="text-[var(--erp-muted)]">Reason</span>
            <textarea
              className="erp-input mt-1 w-full"
              rows={3}
              value={apply.reason}
              onChange={(e) =>
                setApply((a) => ({ ...a, reason: e.target.value }))
              }
              required
              minLength={3}
            />
          </label>
          <button
            type="submit"
            className="erp-btn erp-btn-primary"
            disabled={applyLeave.isPending}
          >
            Submit leave request
          </button>
        </form>
      )}

      {tab === 'requests' && (
        <div className="space-y-3">
          {(requests.data ?? []).map((r) => (
            <div
              key={r.id}
              className="erp-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {r.employee?.fullName ?? 'You'} · {r.leaveType?.name ?? 'Leave'}
                </p>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  {r.startDate}
                  {r.endDate !== r.startDate ? ` → ${r.endDate}` : ''} ·{' '}
                  {r.days} day{r.days === 1 ? '' : 's'}
                  {r.isHalfDay ? ' (half)' : ''}
                </p>
                <p className="mt-1 text-sm">{r.reason}</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={statusTone(r.status)}>
                  {r.status.replace(/_/g, ' ')}
                </Badge>
                {canDecide(r.status) && (
                  <>
                    <button
                      type="button"
                      className="erp-btn erp-btn-primary text-sm"
                      onClick={() => decide.mutate({ id: r.id, approve: true })}
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      className="erp-btn erp-btn-ghost text-sm"
                      onClick={() =>
                        decide.mutate({ id: r.id, approve: false })
                      }
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!requests.isLoading && !(requests.data ?? []).length && (
            <p className="text-sm text-[var(--erp-muted)]">No leave requests.</p>
          )}
        </div>
      )}

      {tab === 'types' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <ul className="erp-panel space-y-2 p-5 text-sm">
            {(types.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex justify-between gap-2 rounded-lg border border-[var(--erp-line)] px-3 py-2"
              >
                <span>
                  {t.name}{' '}
                  <span className="text-[var(--erp-muted)]">({t.code})</span>
                </span>
                <span className="text-[var(--erp-muted)]">
                  {t.maxDaysPerYear} days
                  {!t.isPaid ? ' · unpaid' : ''}
                </span>
              </li>
            ))}
          </ul>
          {canApproveHr && (
            <form
              className="erp-panel space-y-3 p-5"
              onSubmit={(e) => {
                e.preventDefault();
                createType.mutate();
              }}
            >
              <h3 className="font-semibold">Add leave type</h3>
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
                value={typeForm.maxDaysPerYear}
                onChange={(e) =>
                  setTypeForm((f) => ({
                    ...f,
                    maxDaysPerYear: Number(e.target.value),
                  }))
                }
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={typeForm.isPaid}
                  onChange={(e) =>
                    setTypeForm((f) => ({ ...f, isPaid: e.target.checked }))
                  }
                />
                Paid
              </label>
              <label className="flex items-center gap-2 text-sm">
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
                Allow half day
              </label>
              <button type="submit" className="erp-btn erp-btn-ghost">
                Create type
              </button>
            </form>
          )}
        </div>
      )}
    </section>
  );
}
