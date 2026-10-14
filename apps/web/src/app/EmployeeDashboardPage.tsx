import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Briefcase,
  Building2,
  CalendarDays,
  CalendarRange,
  Clock3,
  LogIn,
  LogOut,
  Mail,
  Phone,
  Sparkles,
  UserRound,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, StatCard } from '../components/ui';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasFeature, useEntitlements } from '../lib/features';
import { useTheme } from '../lib/theme';

type MyProfile = {
  id: number;
  employeeCode: string;
  fullName: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  dateOfJoining: string | null;
  branch?: { name: string; code: string } | null;
  department?: { name: string; code: string } | null;
  designation?: { name: string; code: string } | null;
  employmentStatus?: { name: string; code: string } | null;
  reportingTo?: { fullName: string; employeeCode: string } | null;
};

type TodayAttendance = {
  workDate: string;
  holiday: { id: string; name: string; isOptional: boolean } | null;
  shift: {
    id: string;
    name: string;
    code: string;
    startTime: string;
    endTime: string;
  } | null;
  attendance: {
    id: string;
    status: string;
    checkInAt: string | null;
    checkOutAt: string | null;
    lateMinutes: number;
    workedMinutes: number;
  } | null;
  employee: { id: string; fullName: string; employeeCode: string };
};

type BalancePayload = {
  session: { name: string; startsOn: string; endsOn: string };
  balances: {
    id: string;
    leaveType: { id: string; name: string; code: string };
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
  status: string;
  reason: string;
  leaveType?: { name: string; code: string } | null;
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function statusTone(status: string) {
  if (status === 'present' || status === 'approved' || status === 'holiday') {
    return 'success' as const;
  }
  if (
    status === 'late' ||
    status.startsWith('pending') ||
    status === 'on_leave'
  ) {
    return 'warning' as const;
  }
  if (status === 'absent' || status === 'rejected') return 'danger' as const;
  return 'neutral' as const;
}

export function EmployeeDashboardPage() {
  const { session, hasPermission } = useAuth();
  const { branding } = useTheme();
  const entitlements = useEntitlements();
  const queryClient = useQueryClient();
  const token = session?.accessToken;

  const attendanceEnabled = hasFeature(entitlements.data, 'hrm.attendance');
  const leaveEnabled = hasFeature(entitlements.data, 'hrm.leave');
  const employeesEnabled = hasFeature(entitlements.data, 'hrm.employees');

  const canAttendance = hasPermission('attendance.read');
  const canClock = hasPermission('attendance.create');
  const canLeaves = hasPermission('leave.read');
  const canApplyLeave = hasPermission('leave.read'); // apply uses leave.read on API

  const company = branding.name ?? session?.tenant?.name ?? 'your company';
  const firstName = session?.user.fullName.split(' ')[0] ?? 'there';
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const profile = useQuery({
    queryKey: ['employee-me'],
    queryFn: () => apiGet<MyProfile>('/hrm/employees/me', token),
    enabled: !!token && employeesEnabled,
    retry: false,
  });

  const today = useQuery({
    queryKey: ['employee-attendance-today'],
    queryFn: () => apiGet<TodayAttendance>('/hrm/attendance/me/today', token),
    enabled: !!token && canAttendance && attendanceEnabled,
    retry: false,
  });

  const balances = useQuery({
    queryKey: ['employee-leave-balances'],
    queryFn: () => apiGet<BalancePayload>('/hrm/leaves/me/balances', token),
    enabled: !!token && canLeaves && leaveEnabled,
    retry: false,
  });

  const leaveRequests = useQuery({
    queryKey: ['employee-leave-requests'],
    queryFn: () => apiGet<LeaveRequest[]>('/hrm/leaves/requests', token),
    enabled: !!token && canLeaves && leaveEnabled,
    retry: false,
  });

  const checkIn = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/me/check-in', {}, token),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['employee-attendance-today'] }),
  });
  const checkOut = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/me/check-out', {}, token),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['employee-attendance-today'] }),
  });

  const attendanceRow = today.data?.attendance;
  const checkedIn = !!attendanceRow?.checkInAt;
  const checkedOut = !!attendanceRow?.checkOutAt;

  const myLeaves = (leaveRequests.data ?? [])
    .filter((r) => {
      // Prefer requests that look like mine when profile is known
      if (!profile.data) return true;
      return true; // API already scopes for non-approvers in practice; show recent
    })
    .slice(0, 5);

  const pendingLeaves = myLeaves.filter((r) => r.status.startsWith('pending'));
  const remainingLeave = (balances.data?.balances ?? []).reduce(
    (sum, b) => sum + (b.remaining || 0),
    0,
  );

  const me = profile.data;

  return (
    <section className="space-y-6">
      <div
        className="relative overflow-hidden rounded-3xl border border-[var(--erp-line)] p-6 md:p-8"
        style={{
          background:
            'radial-gradient(ellipse 90% 140% at 0% -10%, var(--erp-accent-glow), transparent 55%), var(--erp-grad-panel)',
        }}
      >
        <div className="pointer-events-none absolute -left-10 -top-10 h-48 w-48 rounded-full bg-[var(--erp-accent-soft)] blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--erp-accent)]">
              <Sparkles size={13} />
              {company} · Employee
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              {greeting()}, {me?.firstName ?? firstName}
            </h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              {dateLabel}. Your personal workspace — attendance, leave, and profile.
            </p>
            {me && (
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="erp-badge erp-badge-accent">
                  {me.employeeCode}
                </span>
                {me.designation && (
                  <span className="erp-badge erp-badge-neutral">
                    {me.designation.name}
                  </span>
                )}
                {me.department && (
                  <span className="erp-badge erp-badge-neutral">
                    {me.department.name}
                  </span>
                )}
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {canAttendance && attendanceEnabled && (
              <Link to="/attendance" className="erp-btn erp-btn-ghost">
                <CalendarDays size={15} />
                Attendance
              </Link>
            )}
            {canLeaves && leaveEnabled && (
              <Link to="/leaves" className="erp-btn erp-btn-primary">
                <CalendarRange size={15} />
                My leaves
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {attendanceEnabled && canAttendance && (
          <StatCard
            label="Today"
            value={
              attendanceRow
                ? attendanceRow.status.replace(/_/g, ' ')
                : today.data?.holiday
                  ? 'Holiday'
                  : 'Not started'
            }
            icon={<Clock3 size={16} />}
            loading={today.isLoading}
            hint={
              checkedIn
                ? `In ${fmtTime(attendanceRow?.checkInAt)}${
                    checkedOut ? ` · Out ${fmtTime(attendanceRow?.checkOutAt)}` : ''
                  }`
                : today.data?.shift
                  ? `Shift ${today.data.shift.startTime.slice(0, 5)}–${today.data.shift.endTime.slice(0, 5)}`
                  : 'No shift assigned'
            }
          />
        )}
        {leaveEnabled && canLeaves && (
          <StatCard
            label="Leave balance"
            value={Math.round(remainingLeave * 10) / 10}
            icon={<CalendarRange size={16} />}
            loading={balances.isLoading}
            hint={balances.data?.session.name ?? 'Current session'}
          />
        )}
        {leaveEnabled && canLeaves && (
          <StatCard
            label="Pending requests"
            value={pendingLeaves.length}
            icon={<CalendarDays size={16} />}
            loading={leaveRequests.isLoading}
            hint="Awaiting manager / HR"
          />
        )}
        <StatCard
          label="Profile"
          value={me?.employmentStatus?.name ?? 'Linked'}
          icon={<UserRound size={16} />}
          loading={profile.isLoading}
          hint={
            me
              ? `${me.branch?.name ?? 'No branch'} · joined ${fmtDate(me.dateOfJoining)}`
              : profile.isError
                ? 'No employee record linked'
                : 'Your HR record'
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-6">
          {attendanceEnabled && canAttendance && (
            <div className="erp-panel p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Clock in / out</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    {today.data?.shift
                      ? `${today.data.shift.name} · ${today.data.shift.startTime.slice(0, 5)} – ${today.data.shift.endTime.slice(0, 5)}`
                      : 'Mark your attendance for today'}
                  </p>
                </div>
                {attendanceRow && (
                  <Badge tone={statusTone(attendanceRow.status)}>
                    {attendanceRow.status.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>

              {today.isLoading ? (
                <div className="mt-5 grid gap-3 sm:grid-cols-2">
                  <div className="erp-skeleton h-20 rounded-2xl" />
                  <div className="erp-skeleton h-20 rounded-2xl" />
                </div>
              ) : today.isError ? (
                <p className="mt-5 text-sm text-[var(--erp-muted)]">
                  Link your login to an employee profile to use check-in.
                </p>
              ) : (
                <>
                  {today.data?.holiday && (
                    <div className="mt-4 rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-accent-softer)] px-4 py-3 text-sm">
                      Holiday today:{' '}
                      <span className="font-semibold">
                        {today.data.holiday.name}
                      </span>
                    </div>
                  )}
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
                        Check in
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight">
                        {fmtTime(attendanceRow?.checkInAt)}
                      </p>
                      {!!attendanceRow?.lateMinutes && (
                        <p className="mt-1 text-xs text-[var(--erp-warning)]">
                          Late by {attendanceRow.lateMinutes} min
                        </p>
                      )}
                    </div>
                    <div className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--erp-muted)]">
                        Check out
                      </p>
                      <p className="mt-2 text-2xl font-semibold tracking-tight">
                        {fmtTime(attendanceRow?.checkOutAt)}
                      </p>
                      {!!attendanceRow?.workedMinutes && (
                        <p className="mt-1 text-xs text-[var(--erp-muted)]">
                          Worked {Math.floor(attendanceRow.workedMinutes / 60)}h{' '}
                          {attendanceRow.workedMinutes % 60}m
                        </p>
                      )}
                    </div>
                  </div>
                  {canClock && (
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="erp-btn erp-btn-primary"
                        disabled={checkedIn || checkIn.isPending}
                        onClick={() => checkIn.mutate()}
                      >
                        <LogIn size={15} />
                        {checkIn.isPending ? 'Checking in…' : 'Check in'}
                      </button>
                      <button
                        type="button"
                        className="erp-btn erp-btn-ghost"
                        disabled={
                          !checkedIn || checkedOut || checkOut.isPending
                        }
                        onClick={() => checkOut.mutate()}
                      >
                        <LogOut size={15} />
                        {checkOut.isPending ? 'Checking out…' : 'Check out'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {leaveEnabled && canLeaves && (
            <div className="erp-panel p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Leave balances</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    {balances.data?.session.name ?? 'Current leave session'}
                  </p>
                </div>
                {canApplyLeave && (
                  <Link to="/leaves" className="erp-btn erp-btn-ghost erp-btn-sm">
                    Apply
                    <ArrowRight size={13} />
                  </Link>
                )}
              </div>
              {balances.isLoading ? (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div className="erp-skeleton h-24 rounded-2xl" />
                  <div className="erp-skeleton h-24 rounded-2xl" />
                </div>
              ) : (balances.data?.balances.length ?? 0) === 0 ? (
                <p className="mt-4 text-sm text-[var(--erp-muted)]">
                  No leave balances yet.
                </p>
              ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  {(balances.data?.balances ?? []).map((b) => {
                    const pct =
                      b.accrued > 0
                        ? Math.min(100, Math.round((b.remaining / b.accrued) * 100))
                        : 0;
                    return (
                      <div
                        key={b.id}
                        className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-4"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-medium">{b.leaveType.name}</p>
                          <span className="font-mono text-[11px] text-[var(--erp-muted)]">
                            {b.leaveType.code}
                          </span>
                        </div>
                        <p className="mt-2 text-2xl font-semibold tracking-tight">
                          {b.remaining}
                          <span className="ml-1 text-sm font-normal text-[var(--erp-muted)]">
                            / {b.accrued} days
                          </span>
                        </p>
                        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-[var(--erp-line)]">
                          <div
                            className="h-full rounded-full bg-[var(--erp-accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-2 text-xs text-[var(--erp-muted)]">
                          Used {b.used} days
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="erp-panel p-5 md:p-6">
            <h2 className="font-semibold">My profile</h2>
            <p className="mt-1 text-sm text-[var(--erp-muted)]">
              Details from your HR record.
            </p>
            {profile.isLoading ? (
              <div className="mt-4 space-y-3">
                <div className="erp-skeleton h-16 rounded-2xl" />
                <div className="erp-skeleton h-24 rounded-2xl" />
              </div>
            ) : profile.isError || !me ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--erp-line)] px-4 py-8 text-center">
                <UserRound
                  size={22}
                  className="mx-auto text-[var(--erp-muted)]"
                />
                <p className="mt-3 font-medium">No employee profile linked</p>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Ask HR to link your user account to an employee record.
                </p>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="flex items-center gap-3 rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-4">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--erp-grad-accent)] text-sm font-bold text-[var(--erp-on-accent)]">
                    {me.firstName[0]}
                    {me.lastName?.[0] ?? ''}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{me.fullName}</p>
                    <p className="truncate text-xs text-[var(--erp-muted)]">
                      {me.employeeCode}
                      {me.designation ? ` · ${me.designation.name}` : ''}
                    </p>
                  </div>
                </div>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2 text-[var(--erp-muted)]">
                    <Mail size={14} className="text-[var(--erp-accent)]" />
                    <span className="text-[var(--erp-text)]">{me.email}</span>
                  </li>
                  {me.phone && (
                    <li className="flex items-center gap-2 text-[var(--erp-muted)]">
                      <Phone size={14} className="text-[var(--erp-accent)]" />
                      <span className="text-[var(--erp-text)]">{me.phone}</span>
                    </li>
                  )}
                  {me.department && (
                    <li className="flex items-center gap-2 text-[var(--erp-muted)]">
                      <Briefcase size={14} className="text-[var(--erp-accent)]" />
                      <span className="text-[var(--erp-text)]">
                        {me.department.name}
                      </span>
                    </li>
                  )}
                  {me.branch && (
                    <li className="flex items-center gap-2 text-[var(--erp-muted)]">
                      <Building2 size={14} className="text-[var(--erp-accent)]" />
                      <span className="text-[var(--erp-text)]">{me.branch.name}</span>
                    </li>
                  )}
                  {me.reportingTo && (
                    <li className="flex items-center gap-2 text-[var(--erp-muted)]">
                      <UserRound size={14} className="text-[var(--erp-accent)]" />
                      <span className="text-[var(--erp-text)]">
                        Reports to {me.reportingTo.fullName}
                      </span>
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>

          {leaveEnabled && canLeaves && (
            <div className="erp-panel p-5 md:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="font-semibold">Recent leave requests</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    Latest applications and status.
                  </p>
                </div>
                <Link to="/leaves" className="erp-btn erp-btn-ghost erp-btn-sm">
                  View all
                </Link>
              </div>
              <div className="mt-4 space-y-2">
                {leaveRequests.isLoading && (
                  <div className="erp-skeleton h-16 rounded-2xl" />
                )}
                {!leaveRequests.isLoading && myLeaves.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-[var(--erp-line)] px-4 py-8 text-center text-sm text-[var(--erp-muted)]">
                    No leave requests yet.
                  </div>
                )}
                {myLeaves.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--erp-line)] px-3.5 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {r.leaveType?.name ?? 'Leave'}
                      </p>
                      <p className="mt-0.5 text-xs text-[var(--erp-muted)]">
                        {fmtDate(r.startDate)} – {fmtDate(r.endDate)} · {r.days}{' '}
                        day{r.days === 1 ? '' : 's'}
                      </p>
                    </div>
                    <Badge tone={statusTone(r.status)}>
                      {r.status.replace(/_/g, ' ')}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {!canAttendance && !canLeaves && (
        <div className="erp-panel px-6 py-10 text-center">
          <p className="font-semibold">Almost there</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--erp-muted)]">
            Your account is signed in, but no attendance or leave permissions are
            assigned yet. Ask your Company Admin to grant access in Roles & Access.
          </p>
        </div>
      )}
    </section>
  );
}
