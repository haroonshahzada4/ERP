import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CalendarDays,
  Clock,
  Download,
  LogIn,
  LogOut,
  Upload,
} from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { Badge, PageHeader } from '../components/ui';
import { apiDownload, apiGet, apiPatch, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';

type Shift = {
  id: string;
  name: string;
  code: string;
  startTime: string;
  endTime: string;
  graceMinutes: number;
  earlyGraceMinutes?: number;
  otAfterMinutes?: number;
  isOvernight: boolean;
  isActive: boolean;
};

type Holiday = {
  id: string;
  holidayDate: string;
  name: string;
  isOptional: boolean;
};

type AttendanceRow = {
  id: string;
  employeeId: string;
  workDate: string;
  status: string;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  earlyDepartureMinutes?: number;
  overtimeMinutes?: number;
  workedMinutes: number;
  notes?: string | null;
  employee?: { fullName: string; employeeCode: string } | null;
  shift?: { name: string; code: string } | null;
};

type Today = {
  workDate: string;
  holiday: { id: string; name: string; isOptional: boolean } | null;
  shift: {
    id: string;
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    graceMinutes: number;
  } | null;
  attendance: AttendanceRow | null;
  employee: { id: string; fullName: string; employeeCode: string };
};

type Correction = {
  id: string;
  workDate: string;
  reason: string;
  status: string;
  requestedCheckInAt: string | null;
  requestedCheckOutAt: string | null;
  employee?: { fullName: string; employeeCode: string } | null;
};

type ReportPayload = {
  summary: {
    total: number;
    byStatus: Record<string, number>;
    totalLateMinutes: number;
    totalOvertimeMinutes: number;
    totalEarlyMinutes: number;
    totalWorkedMinutes: number;
  };
  rows?: AttendanceRow[];
  date?: string;
  from?: string;
  to?: string;
};

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function statusTone(status: string) {
  if (status === 'present' || status === 'approved' || status === 'holiday') {
    return 'success' as const;
  }
  if (status === 'late' || status === 'pending' || status === 'on_leave') {
    return 'warning' as const;
  }
  if (status === 'absent' || status === 'rejected') return 'danger' as const;
  return 'neutral' as const;
}

function isoDaysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

function isoToday() {
  return new Date().toISOString().slice(0, 10);
}

export function AttendancePage() {
  const { session, hasPermission } = useAuth();
  const token = session?.accessToken;
  const canCreate = hasPermission('attendance.create');
  const canUpdate = hasPermission('attendance.update');
  const canImport = hasPermission('attendance.import');
  const canExport = hasPermission('attendance.export');
  const canReport = hasPermission('attendance.report.read');
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<
    'today' | 'timesheet' | 'reports' | 'corrections' | 'setup'
  >('today');
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState(isoDaysAgo(14));
  const [to, setTo] = useState(isoToday());
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    checkInAt: '',
    checkOutAt: '',
    status: 'present',
    notes: '',
  });
  const [reportDate, setReportDate] = useState(isoToday());
  const [reportKind, setReportKind] = useState<'daily' | 'weekly' | 'monthly' | 'summary'>(
    'daily',
  );
  const [correction, setCorrection] = useState({
    workDate: isoToday(),
    requestedCheckInAt: '',
    requestedCheckOutAt: '',
    reason: '',
  });
  const [shiftForm, setShiftForm] = useState({
    name: '',
    code: '',
    startTime: '09:00',
    endTime: '18:00',
    graceMinutes: 15,
    earlyGraceMinutes: 0,
    otAfterMinutes: 0,
    isOvernight: false,
  });
  const [holidayForm, setHolidayForm] = useState({
    holidayDate: '',
    name: '',
    isOptional: false,
  });

  const listQuery = useMemo(() => {
    const params = new URLSearchParams({ from, to });
    if (statusFilter) params.set('status', statusFilter);
    if (search.trim()) params.set('q', search.trim());
    return params.toString();
  }, [from, to, statusFilter, search]);

  const today = useQuery({
    queryKey: ['attendance-today'],
    queryFn: () => apiGet<Today>('/hrm/attendance/me/today', token),
    enabled: !!token,
  });

  const records = useQuery({
    queryKey: ['attendance-list', listQuery],
    queryFn: () =>
      apiGet<AttendanceRow[]>(`/hrm/attendance?${listQuery}`, token),
    enabled: !!token && tab === 'timesheet',
  });

  const reportPath =
    reportKind === 'daily'
      ? `/hrm/attendance/reports/daily?date=${reportDate}`
      : reportKind === 'weekly'
        ? `/hrm/attendance/reports/weekly?from=${reportDate}`
        : reportKind === 'monthly'
          ? `/hrm/attendance/reports/monthly?year=${reportDate.slice(0, 4)}&month=${Number(reportDate.slice(5, 7))}`
          : `/hrm/attendance/reports/summary?from=${from}&to=${to}`;

  const report = useQuery({
    queryKey: ['attendance-report', reportPath],
    queryFn: () => apiGet<ReportPayload>(reportPath, token),
    enabled: !!token && tab === 'reports' && canReport,
  });

  const requests = useQuery({
    queryKey: ['attendance-requests'],
    queryFn: () =>
      apiGet<Correction[]>('/hrm/attendance/requests?status=pending', token),
    enabled: !!token && tab === 'corrections',
  });

  const shifts = useQuery({
    queryKey: ['attendance-shifts'],
    queryFn: () => apiGet<Shift[]>('/hrm/attendance/shifts', token),
    enabled: !!token && tab === 'setup',
  });

  const holidays = useQuery({
    queryKey: ['attendance-holidays'],
    queryFn: () => apiGet<Holiday[]>('/hrm/attendance/holidays', token),
    enabled: !!token && tab === 'setup',
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
    queryClient.invalidateQueries({ queryKey: ['attendance-list'] });
    queryClient.invalidateQueries({ queryKey: ['attendance-requests'] });
    queryClient.invalidateQueries({ queryKey: ['attendance-shifts'] });
    queryClient.invalidateQueries({ queryKey: ['attendance-holidays'] });
    queryClient.invalidateQueries({ queryKey: ['attendance-report'] });
  };

  const checkIn = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/me/check-in', {}, token),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const checkOut = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/me/check-out', {}, token),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const saveEdit = useMutation({
    mutationFn: () =>
      apiPatch(
        `/hrm/attendance/${editId}`,
        {
          checkInAt: editForm.checkInAt
            ? new Date(editForm.checkInAt).toISOString()
            : null,
          checkOutAt: editForm.checkOutAt
            ? new Date(editForm.checkOutAt).toISOString()
            : null,
          status: editForm.status,
          notes: editForm.notes || null,
        },
        token,
      ),
    onSuccess: () => {
      setEditId(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const importCsv = useMutation({
    mutationFn: async (file: File) => {
      const text = await file.text();
      const lines = text.trim().split(/\r?\n/).slice(1);
      const rows = lines
        .map((line) => {
          const [employeeCode, workDate, checkInAt, checkOutAt, status, notes] =
            line.split(',').map((c) => c.replace(/^"|"$/g, '').trim());
          return {
            employeeCode,
            workDate,
            checkInAt: checkInAt || null,
            checkOutAt: checkOutAt || null,
            status: (status || undefined) as AttendanceRow['status'] | undefined,
            notes: notes || null,
          };
        })
        .filter((r) => r.employeeCode && r.workDate);
      return apiPost<{ upserted: number; errors: string[] }>(
        '/hrm/attendance/import',
        { rows },
        token,
      );
    },
    onSuccess: (res) => {
      setError(
        res.errors.length
          ? `Imported ${res.upserted}; ${res.errors.length} row errors`
          : `Imported ${res.upserted} rows`,
      );
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const submitCorrection = useMutation({
    mutationFn: () =>
      apiPost(
        '/hrm/attendance/me/corrections',
        {
          workDate: correction.workDate,
          requestedCheckInAt: correction.requestedCheckInAt
            ? new Date(correction.requestedCheckInAt).toISOString()
            : null,
          requestedCheckOutAt: correction.requestedCheckOutAt
            ? new Date(correction.requestedCheckOutAt).toISOString()
            : null,
          reason: correction.reason,
        },
        token,
      ),
    onSuccess: () => {
      setCorrection({
        workDate: isoToday(),
        requestedCheckInAt: '',
        requestedCheckOutAt: '',
        reason: '',
      });
      setTab('corrections');
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) =>
      apiPost(`/hrm/attendance/requests/${id}/decide`, { approve }, token),
    onSuccess: () => invalidate(),
    onError: (err) => setError((err as Error).message),
  });

  const createShift = useMutation({
    mutationFn: () =>
      apiPost(
        '/hrm/attendance/shifts',
        {
          ...shiftForm,
          startTime:
            shiftForm.startTime.length === 5
              ? `${shiftForm.startTime}:00`
              : shiftForm.startTime,
          endTime:
            shiftForm.endTime.length === 5
              ? `${shiftForm.endTime}:00`
              : shiftForm.endTime,
        },
        token,
      ),
    onSuccess: () => {
      setShiftForm({
        name: '',
        code: '',
        startTime: '09:00',
        endTime: '18:00',
        graceMinutes: 15,
        earlyGraceMinutes: 0,
        otAfterMinutes: 0,
        isOvernight: false,
      });
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const createHoliday = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/holidays', holidayForm, token),
    onSuccess: () => {
      setHolidayForm({ holidayDate: '', name: '', isOptional: false });
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const runJobs = useMutation({
    mutationFn: (kind: 'generate-daily' | 'update-status') =>
      apiPost(`/hrm/attendance/jobs/${kind}`, {}, token),
    onSuccess: () => {
      setError(null);
      invalidate();
    },
    onError: (err) => setError((err as Error).message),
  });

  const att = today.data?.attendance;
  const checkedIn = !!att?.checkInAt;
  const checkedOut = !!att?.checkOutAt;
  const holidayBlocks =
    !!today.data?.holiday && !today.data.holiday.isOptional;

  const tabs = [
    { id: 'today' as const, label: 'My day' },
    { id: 'timesheet' as const, label: 'Timesheet' },
    ...(canReport ? [{ id: 'reports' as const, label: 'Reports' }] : []),
    { id: 'corrections' as const, label: 'Corrections' },
    { id: 'setup' as const, label: 'Shifts & holidays' },
  ];

  async function downloadExport(format: 'xlsx' | 'csv' | 'pdf') {
    try {
      await apiDownload(
        `/hrm/attendance/export?from=${from}&to=${to}&format=${format}`,
        token,
        `attendance.${format}`,
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function openEdit(row: AttendanceRow) {
    setEditId(row.id);
    setEditForm({
      checkInAt: row.checkInAt
        ? new Date(row.checkInAt).toISOString().slice(0, 16)
        : '',
      checkOutAt: row.checkOutAt
        ? new Date(row.checkOutAt).toISOString().slice(0, 16)
        : '',
      status: row.status,
      notes: row.notes ?? '',
    });
  }

  return (
    <section className="space-y-6">
      <PageHeader
        eyebrow="HRM"
        icon={<CalendarDays className="h-3.5 w-3.5" />}
        title="Attendance"
        description="Simple check-in / check-out, timesheets, automation statuses, and reports — no GPS."
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

      {tab === 'today' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="erp-panel space-y-4 p-5 lg:col-span-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
                  {today.data?.workDate ?? '…'}
                </p>
                <h2 className="mt-1 text-xl font-semibold">
                  {today.data?.employee.fullName ?? 'Your attendance'}
                </h2>
                {today.data?.holiday && (
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    Holiday: {today.data.holiday.name}
                    {today.data.holiday.isOptional ? ' (optional)' : ''}
                  </p>
                )}
              </div>
              {att && <Badge tone={statusTone(att.status)}>{att.status}</Badge>}
            </div>

            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-[var(--erp-line)] p-3">
                <p className="text-xs text-[var(--erp-muted)]">Check in</p>
                <p className="mt-1 text-lg font-semibold">{fmtTime(att?.checkInAt)}</p>
              </div>
              <div className="rounded-xl border border-[var(--erp-line)] p-3">
                <p className="text-xs text-[var(--erp-muted)]">Check out</p>
                <p className="mt-1 text-lg font-semibold">{fmtTime(att?.checkOutAt)}</p>
              </div>
              <div className="rounded-xl border border-[var(--erp-line)] p-3">
                <p className="text-xs text-[var(--erp-muted)]">Late / early</p>
                <p className="mt-1 text-lg font-semibold">
                  {att?.lateMinutes ?? 0}m / {att?.earlyDepartureMinutes ?? 0}m
                </p>
              </div>
              <div className="rounded-xl border border-[var(--erp-line)] p-3">
                <p className="text-xs text-[var(--erp-muted)]">OT / worked</p>
                <p className="mt-1 text-lg font-semibold">
                  {att?.overtimeMinutes ?? 0}m / {att?.workedMinutes ?? 0}m
                </p>
              </div>
            </div>

            {canCreate && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={checkedIn || checkIn.isPending || holidayBlocks}
                  onClick={() => checkIn.mutate()}
                  className="erp-btn erp-btn-primary inline-flex items-center gap-2"
                >
                  <LogIn className="h-4 w-4" />
                  Check in
                </button>
                <button
                  type="button"
                  disabled={!checkedIn || checkedOut || checkOut.isPending}
                  onClick={() => checkOut.mutate()}
                  className="erp-btn erp-btn-ghost inline-flex items-center gap-2"
                >
                  <LogOut className="h-4 w-4" />
                  Check out
                </button>
              </div>
            )}
          </div>

          <div className="erp-panel space-y-3 p-5">
            <div className="flex items-center gap-2 text-[var(--erp-accent)]">
              <Clock className="h-4 w-4" />
              <h3 className="font-semibold">Active shift</h3>
            </div>
            {today.data?.shift ? (
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--erp-muted)]">Name</dt>
                  <dd>{today.data.shift.name}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--erp-muted)]">Window</dt>
                  <dd>
                    {today.data.shift.startTime.slice(0, 5)} –{' '}
                    {today.data.shift.endTime.slice(0, 5)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="text-[var(--erp-muted)]">Grace</dt>
                  <dd>{today.data.shift.graceMinutes} min</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm text-[var(--erp-muted)]">
                No shift assigned for today.
              </p>
            )}
          </div>

          {canCreate && (
            <form
              className="erp-panel space-y-3 p-5 lg:col-span-3"
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                submitCorrection.mutate();
              }}
            >
              <h3 className="font-semibold">Request correction</h3>
              <div className="grid gap-3 md:grid-cols-4">
                <label className="text-sm">
                  <span className="text-[var(--erp-muted)]">Work date</span>
                  <input
                    type="date"
                    className="erp-input mt-1 w-full"
                    value={correction.workDate}
                    onChange={(e) =>
                      setCorrection((c) => ({ ...c, workDate: e.target.value }))
                    }
                    required
                  />
                </label>
                <label className="text-sm">
                  <span className="text-[var(--erp-muted)]">Corrected check-in</span>
                  <input
                    type="datetime-local"
                    className="erp-input mt-1 w-full"
                    value={correction.requestedCheckInAt}
                    onChange={(e) =>
                      setCorrection((c) => ({
                        ...c,
                        requestedCheckInAt: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-sm">
                  <span className="text-[var(--erp-muted)]">Corrected check-out</span>
                  <input
                    type="datetime-local"
                    className="erp-input mt-1 w-full"
                    value={correction.requestedCheckOutAt}
                    onChange={(e) =>
                      setCorrection((c) => ({
                        ...c,
                        requestedCheckOutAt: e.target.value,
                      }))
                    }
                  />
                </label>
                <label className="text-sm md:col-span-4">
                  <span className="text-[var(--erp-muted)]">Reason</span>
                  <input
                    className="erp-input mt-1 w-full"
                    value={correction.reason}
                    onChange={(e) =>
                      setCorrection((c) => ({ ...c, reason: e.target.value }))
                    }
                    required
                    minLength={3}
                  />
                </label>
              </div>
              <button type="submit" className="erp-btn erp-btn-ghost">
                Submit correction
              </button>
            </form>
          )}
        </div>
      )}

      {tab === 'timesheet' && (
        <div className="space-y-4">
          <div className="erp-panel flex flex-col gap-3 p-4 md:flex-row md:flex-wrap md:items-end">
            <label className="text-sm">
              <span className="text-[var(--erp-muted)]">From</span>
              <input
                type="date"
                className="erp-input mt-1"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--erp-muted)]">To</span>
              <input
                type="date"
                className="erp-input mt-1"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
            <label className="text-sm">
              <span className="text-[var(--erp-muted)]">Status</span>
              <select
                className="erp-input mt-1"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="">All</option>
                {[
                  'present',
                  'late',
                  'absent',
                  'on_leave',
                  'holiday',
                  'incomplete',
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-[180px] flex-1 text-sm">
              <span className="text-[var(--erp-muted)]">Search</span>
              <input
                className="erp-input mt-1 w-full"
                placeholder="Name or code…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              {canExport && (
                <>
                  <button
                    type="button"
                    className="erp-btn erp-btn-ghost inline-flex items-center gap-1 text-sm"
                    onClick={() => downloadExport('xlsx')}
                  >
                    <Download className="h-3.5 w-3.5" /> Excel
                  </button>
                  <button
                    type="button"
                    className="erp-btn erp-btn-ghost inline-flex items-center gap-1 text-sm"
                    onClick={() => downloadExport('csv')}
                  >
                    CSV
                  </button>
                  <button
                    type="button"
                    className="erp-btn erp-btn-ghost inline-flex items-center gap-1 text-sm"
                    onClick={() => downloadExport('pdf')}
                  >
                    PDF
                  </button>
                </>
              )}
              {canImport && (
                <label className="erp-btn erp-btn-ghost inline-flex cursor-pointer items-center gap-1 text-sm">
                  <Upload className="h-3.5 w-3.5" />
                  Import CSV
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) importCsv.mutate(f);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
            </div>
          </div>

          {editId && canUpdate && (
            <form
              className="erp-panel grid gap-3 p-4 md:grid-cols-5"
              onSubmit={(e) => {
                e.preventDefault();
                saveEdit.mutate();
              }}
            >
              <h3 className="font-semibold md:col-span-5">Edit record #{editId}</h3>
              <input
                type="datetime-local"
                className="erp-input"
                value={editForm.checkInAt}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, checkInAt: e.target.value }))
                }
              />
              <input
                type="datetime-local"
                className="erp-input"
                value={editForm.checkOutAt}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, checkOutAt: e.target.value }))
                }
              />
              <select
                className="erp-input"
                value={editForm.status}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, status: e.target.value }))
                }
              >
                {[
                  'present',
                  'late',
                  'absent',
                  'on_leave',
                  'holiday',
                  'incomplete',
                ].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                className="erp-input"
                placeholder="Notes"
                value={editForm.notes}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, notes: e.target.value }))
                }
              />
              <div className="flex gap-2">
                <button type="submit" className="erp-btn erp-btn-primary text-sm">
                  Save
                </button>
                <button
                  type="button"
                  className="erp-btn erp-btn-ghost text-sm"
                  onClick={() => setEditId(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          <div className="erp-panel overflow-x-auto">
            <table className="w-full min-w-[780px] text-left text-sm">
              <thead className="border-b border-[var(--erp-line)] text-[var(--erp-muted)]">
                <tr>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Employee</th>
                  <th className="px-4 py-3 font-medium">In</th>
                  <th className="px-4 py-3 font-medium">Out</th>
                  <th className="px-4 py-3 font-medium">Late</th>
                  <th className="px-4 py-3 font-medium">Early</th>
                  <th className="px-4 py-3 font-medium">OT</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  {canUpdate && <th className="px-4 py-3 font-medium" />}
                </tr>
              </thead>
              <tbody>
                {(records.data ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-[var(--erp-line)]/60">
                    <td className="px-4 py-3">{r.workDate}</td>
                    <td className="px-4 py-3">
                      {r.employee?.fullName ?? r.employeeId}
                      <span className="ml-1 text-xs text-[var(--erp-muted)]">
                        {r.employee?.employeeCode}
                      </span>
                    </td>
                    <td className="px-4 py-3">{fmtTime(r.checkInAt)}</td>
                    <td className="px-4 py-3">{fmtTime(r.checkOutAt)}</td>
                    <td className="px-4 py-3">{r.lateMinutes}m</td>
                    <td className="px-4 py-3">{r.earlyDepartureMinutes ?? 0}m</td>
                    <td className="px-4 py-3">{r.overtimeMinutes ?? 0}m</td>
                    <td className="px-4 py-3">
                      <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                    </td>
                    {canUpdate && (
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          className="text-xs text-[var(--erp-accent)] hover:underline"
                          onClick={() => openEdit(r)}
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
                {!records.isLoading && !(records.data ?? []).length && (
                  <tr>
                    <td
                      colSpan={canUpdate ? 9 : 8}
                      className="px-4 py-8 text-center text-[var(--erp-muted)]"
                    >
                      No attendance records for this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-[var(--erp-muted)]">
            CSV import columns: employeeCode, workDate, checkInAt, checkOutAt,
            status, notes
          </p>
        </div>
      )}

      {tab === 'reports' && canReport && (
        <div className="space-y-4">
          <div className="erp-panel flex flex-wrap items-end gap-3 p-4">
            <div className="flex flex-wrap gap-2">
              {(['daily', 'weekly', 'monthly', 'summary'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={`erp-chip ${reportKind === k ? 'erp-chip-active' : ''}`}
                  onClick={() => setReportKind(k)}
                >
                  {k}
                </button>
              ))}
            </div>
            {reportKind !== 'summary' && (
              <label className="text-sm">
                <span className="text-[var(--erp-muted)]">
                  {reportKind === 'monthly' ? 'Month (any day)' : 'Date / week start'}
                </span>
                <input
                  type="date"
                  className="erp-input mt-1"
                  value={reportDate}
                  onChange={(e) => setReportDate(e.target.value)}
                />
              </label>
            )}
            {canExport && (
              <button
                type="button"
                className="erp-btn erp-btn-ghost text-sm"
                onClick={() => downloadExport('xlsx')}
              >
                Export Excel
              </button>
            )}
          </div>

          {report.data && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="erp-panel p-4">
                <p className="text-xs text-[var(--erp-muted)]">Records</p>
                <p className="mt-1 text-2xl font-semibold">
                  {report.data.summary.total}
                </p>
              </div>
              <div className="erp-panel p-4">
                <p className="text-xs text-[var(--erp-muted)]">Late minutes</p>
                <p className="mt-1 text-2xl font-semibold">
                  {report.data.summary.totalLateMinutes}
                </p>
              </div>
              <div className="erp-panel p-4">
                <p className="text-xs text-[var(--erp-muted)]">Overtime</p>
                <p className="mt-1 text-2xl font-semibold">
                  {report.data.summary.totalOvertimeMinutes}m
                </p>
              </div>
              <div className="erp-panel p-4">
                <p className="text-xs text-[var(--erp-muted)]">By status</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(report.data.summary.byStatus).map(([k, v]) => (
                    <Badge key={k} tone={statusTone(k)}>
                      {k}: {v}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'corrections' && (
        <div className="space-y-3">
          {(requests.data ?? []).map((r) => (
            <div
              key={r.id}
              className="erp-panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <p className="font-medium">
                  {r.employee?.fullName ?? 'Employee'} · {r.workDate}
                </p>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">{r.reason}</p>
                <p className="mt-1 text-xs text-[var(--erp-muted)]">
                  In {fmtTime(r.requestedCheckInAt)} · Out{' '}
                  {fmtTime(r.requestedCheckOutAt)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                {canUpdate && r.status === 'pending' && (
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
                      onClick={() => decide.mutate({ id: r.id, approve: false })}
                    >
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
          {!requests.isLoading && !(requests.data ?? []).length && (
            <p className="text-sm text-[var(--erp-muted)]">
              No pending correction requests.
            </p>
          )}
        </div>
      )}

      {tab === 'setup' && (
        <div className="space-y-4">
          {canUpdate && (
            <div className="erp-panel flex flex-wrap gap-2 p-4">
              <button
                type="button"
                className="erp-btn erp-btn-ghost text-sm"
                disabled={runJobs.isPending}
                onClick={() => runJobs.mutate('generate-daily')}
              >
                Run daily record job
              </button>
              <button
                type="button"
                className="erp-btn erp-btn-ghost text-sm"
                disabled={runJobs.isPending}
                onClick={() => runJobs.mutate('update-status')}
              >
                Run status update job
              </button>
            </div>
          )}
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="erp-panel space-y-4 p-5">
              <h3 className="font-semibold">Shifts</h3>
              <ul className="space-y-2 text-sm">
                {(shifts.data ?? []).map((s) => (
                  <li
                    key={s.id}
                    className="flex justify-between gap-2 rounded-lg border border-[var(--erp-line)] px-3 py-2"
                  >
                    <span>
                      {s.name}{' '}
                      <span className="text-[var(--erp-muted)]">({s.code})</span>
                    </span>
                    <span className="text-[var(--erp-muted)]">
                      {s.startTime.slice(0, 5)}–{s.endTime.slice(0, 5)} · grace{' '}
                      {s.graceMinutes}m
                    </span>
                  </li>
                ))}
              </ul>
              {canUpdate && (
                <form
                  className="grid gap-2 border-t border-[var(--erp-line)] pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createShift.mutate();
                  }}
                >
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      className="erp-input"
                      placeholder="Name"
                      value={shiftForm.name}
                      onChange={(e) =>
                        setShiftForm((f) => ({ ...f, name: e.target.value }))
                      }
                      required
                    />
                    <input
                      className="erp-input"
                      placeholder="Code"
                      value={shiftForm.code}
                      onChange={(e) =>
                        setShiftForm((f) => ({ ...f, code: e.target.value }))
                      }
                      required
                    />
                    <input
                      type="time"
                      className="erp-input"
                      value={shiftForm.startTime}
                      onChange={(e) =>
                        setShiftForm((f) => ({ ...f, startTime: e.target.value }))
                      }
                      required
                    />
                    <input
                      type="time"
                      className="erp-input"
                      value={shiftForm.endTime}
                      onChange={(e) =>
                        setShiftForm((f) => ({ ...f, endTime: e.target.value }))
                      }
                      required
                    />
                    <input
                      type="number"
                      className="erp-input"
                      min={0}
                      placeholder="Late grace"
                      value={shiftForm.graceMinutes}
                      onChange={(e) =>
                        setShiftForm((f) => ({
                          ...f,
                          graceMinutes: Number(e.target.value),
                        }))
                      }
                    />
                    <input
                      type="number"
                      className="erp-input"
                      min={0}
                      placeholder="Early grace"
                      value={shiftForm.earlyGraceMinutes}
                      onChange={(e) =>
                        setShiftForm((f) => ({
                          ...f,
                          earlyGraceMinutes: Number(e.target.value),
                        }))
                      }
                    />
                    <input
                      type="number"
                      className="erp-input"
                      min={0}
                      placeholder="OT after (min)"
                      value={shiftForm.otAfterMinutes}
                      onChange={(e) =>
                        setShiftForm((f) => ({
                          ...f,
                          otAfterMinutes: Number(e.target.value),
                        }))
                      }
                    />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={shiftForm.isOvernight}
                      onChange={(e) =>
                        setShiftForm((f) => ({
                          ...f,
                          isOvernight: e.target.checked,
                        }))
                      }
                    />
                    Overnight
                  </label>
                  <button type="submit" className="erp-btn erp-btn-ghost">
                    Add shift
                  </button>
                </form>
              )}
            </div>

            <div className="erp-panel space-y-4 p-5">
              <h3 className="font-semibold">Holidays</h3>
              <ul className="space-y-2 text-sm">
                {(holidays.data ?? []).map((h) => (
                  <li
                    key={h.id}
                    className="flex justify-between gap-2 rounded-lg border border-[var(--erp-line)] px-3 py-2"
                  >
                    <span>{h.name}</span>
                    <span className="text-[var(--erp-muted)]">
                      {h.holidayDate}
                      {h.isOptional ? ' · optional' : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {canUpdate && (
                <form
                  className="grid gap-2 border-t border-[var(--erp-line)] pt-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    createHoliday.mutate();
                  }}
                >
                  <input
                    type="date"
                    className="erp-input"
                    value={holidayForm.holidayDate}
                    onChange={(e) =>
                      setHolidayForm((f) => ({
                        ...f,
                        holidayDate: e.target.value,
                      }))
                    }
                    required
                  />
                  <input
                    className="erp-input"
                    placeholder="Holiday name"
                    value={holidayForm.name}
                    onChange={(e) =>
                      setHolidayForm((f) => ({ ...f, name: e.target.value }))
                    }
                    required
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={holidayForm.isOptional}
                      onChange={(e) =>
                        setHolidayForm((f) => ({
                          ...f,
                          isOptional: e.target.checked,
                        }))
                      }
                    />
                    Optional
                  </label>
                  <button type="submit" className="erp-btn erp-btn-ghost">
                    Add holiday
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
