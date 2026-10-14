import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarDays,
  CalendarRange,
  Clock3,
  KeyRound,
  LogIn,
  LogOut,
  Network,
  Sparkles,
  UserRound,
  Users,
  Wallet,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge, StatCard } from '../components/ui';
import { apiGet, apiPost } from '../lib/api';
import { useAuth } from '../lib/auth';
import { hasFeature, useEntitlements } from '../lib/features';
import { useTheme } from '../lib/theme';
import { EmployeeDashboardPage } from './EmployeeDashboardPage';

/** HR / admin overview vs personal employee workspace. */
export function isHrDashboardUser(hasPermission: (key: string) => boolean) {
  return (
    hasPermission('employee.read') ||
    hasPermission('employee.write') ||
    hasPermission('roles.manage') ||
    hasPermission('attendance.report.read') ||
    hasPermission('attendance.approve') ||
    hasPermission('leave.approve') ||
    hasPermission('payroll.approve.hr') ||
    hasPermission('payroll.approve.ceo') ||
    hasPermission('tenant.settings')
  );
}

/** Chooses HR overview or employee self-service dashboard. */
export function HomePage() {
  const { hasPermission } = useAuth();
  if (!isHrDashboardUser(hasPermission)) {
    return <EmployeeDashboardPage />;
  }
  return <HrDashboardPage />;
}

type Setup = {
  branches: unknown[];
  departments: unknown[];
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

type LeaveRequest = {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  reason: string;
  employee?: { fullName: string; employeeCode: string } | null;
  leaveType?: { name: string; code: string } | null;
};

type AttendanceCorrection = {
  id: string;
  workDate: string;
  reason: string;
  status: string;
  employee?: { fullName: string; employeeCode: string } | null;
};

type DailyReport = {
  summary: {
    total: number;
    byStatus: Record<string, number>;
  };
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

function roleLabel(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtTime(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
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

function HrDashboardPage() {
  const { session, hasPermission } = useAuth();
  const { branding } = useTheme();
  const entitlements = useEntitlements();
  const queryClient = useQueryClient();
  const token = session?.accessToken;

  const canEmployees = hasPermission('employee.read');
  const canAttendance = hasPermission('attendance.read');
  const canClock = hasPermission('attendance.create');
  const canAttendanceReport = hasPermission('attendance.report.read');
  const canLeaves = hasPermission('leave.read');
  const canApproveLeave = hasPermission('leave.approve');

  const attendanceEnabled = hasFeature(entitlements.data, 'hrm.attendance');
  const leaveEnabled = hasFeature(entitlements.data, 'hrm.leave');
  const payrollEnabled = hasFeature(entitlements.data, 'hrm.payroll');

  const employees = useQuery({
    queryKey: ['home-employees'],
    queryFn: () => apiGet<unknown[]>('/hrm/employees', token),
    enabled: !!token && canEmployees,
  });

  const setup = useQuery({
    queryKey: ['org-setup'],
    queryFn: () => apiGet<Setup>('/hrm/organization/setup', token),
    enabled: !!token && canEmployees,
  });

  const today = useQuery({
    queryKey: ['home-attendance-today'],
    queryFn: () => apiGet<TodayAttendance>('/hrm/attendance/me/today', token),
    enabled: !!token && canAttendance && attendanceEnabled,
    retry: false,
  });

  const daily = useQuery({
    queryKey: ['home-attendance-daily', todayIso()],
    queryFn: () =>
      apiGet<DailyReport>(
        `/hrm/attendance/reports/daily?date=${todayIso()}`,
        token,
      ),
    enabled: !!token && canAttendanceReport && attendanceEnabled,
    retry: false,
  });

  const leaveRequests = useQuery({
    queryKey: ['home-leave-requests'],
    queryFn: () => apiGet<LeaveRequest[]>('/hrm/leaves/requests', token),
    enabled: !!token && canLeaves && leaveEnabled,
    retry: false,
  });

  const corrections = useQuery({
    queryKey: ['home-attendance-corrections'],
    queryFn: () =>
      apiGet<AttendanceCorrection[]>(
        '/hrm/attendance/requests?status=pending',
        token,
      ),
    enabled: !!token && canAttendance && attendanceEnabled,
    retry: false,
  });

  const checkIn = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/me/check-in', {}, token),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['home-attendance-today'] }),
  });
  const checkOut = useMutation({
    mutationFn: () => apiPost('/hrm/attendance/me/check-out', {}, token),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ['home-attendance-today'] }),
  });

  const company = branding.name ?? session?.tenant?.name ?? 'your company';
  const firstName = session?.user.fullName.split(' ')[0] ?? 'there';
  const roles = session?.roles ?? [];
  const dateLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const byStatus = daily.data?.summary.byStatus ?? {};
  const presentToday =
    (byStatus.present ?? 0) + (byStatus.late ?? 0) + (byStatus.holiday ?? 0);
  const absentToday = byStatus.absent ?? 0;
  const onLeaveToday = byStatus.on_leave ?? 0;

  const pendingLeaves = (leaveRequests.data ?? []).filter((r) =>
    r.status.startsWith('pending'),
  );
  const pendingCorrections = corrections.data ?? [];

  const attendanceRow = today.data?.attendance;
  const checkedIn = !!attendanceRow?.checkInAt;
  const checkedOut = !!attendanceRow?.checkOutAt;

  const modules = [
    {
      to: '/employees',
      label: 'Employees',
      desc: 'Profiles, org chart links, and records',
      icon: Users,
      show: canEmployees,
      accent: true,
    },
    {
      to: '/organization',
      label: 'Organization',
      desc: 'Branches, departments, and designations',
      icon: Network,
      show: canEmployees,
    },
    {
      to: '/attendance',
      label: 'Attendance',
      desc: 'Shifts, check-ins, and daily reports',
      icon: CalendarDays,
      show: canAttendance && attendanceEnabled,
    },
    {
      to: '/leaves',
      label: 'Leaves',
      desc: 'Balances, requests, and approvals',
      icon: CalendarRange,
      show: canLeaves && leaveEnabled,
    },
    {
      to: '/payroll',
      label: 'Payroll',
      desc: 'Compensation and payslip workflows',
      icon: Wallet,
      show: hasPermission('payroll.view') && payrollEnabled,
    },
    {
      to: '/roles',
      label: 'Roles & access',
      desc: 'Permissions for your company users',
      icon: KeyRound,
      show: hasPermission('roles.manage'),
    },
    {
      to: '/settings',
      label: 'Branding',
      desc: 'Logo, colors, and company theme',
      icon: Building2,
      show: hasPermission('tenant.settings'),
    },
  ].filter((m) => m.show);

  const attentionItems = [
    ...pendingLeaves.slice(0, 4).map((r) => ({
      id: `leave-${r.id}`,
      title: r.employee?.fullName ?? 'Leave request',
      meta: `${r.leaveType?.name ?? 'Leave'} · ${fmtDate(r.startDate)} – ${fmtDate(r.endDate)}`,
      tone: statusTone(r.status),
      status: r.status.replace(/_/g, ' '),
      to: '/leaves',
    })),
    ...pendingCorrections.slice(0, 4).map((r) => ({
      id: `corr-${r.id}`,
      title: r.employee?.fullName ?? 'Attendance correction',
      meta: `${fmtDate(r.workDate)} · ${r.reason.slice(0, 60)}`,
      tone: 'warning' as const,
      status: 'pending',
      to: '/attendance',
    })),
  ].slice(0, 6);

  return (
    <section className="space-y-6">
      {/* Hero */}
      <div
        className="relative overflow-hidden rounded-3xl border border-[var(--erp-line)] p-6 md:p-8"
        style={{
          background:
            'radial-gradient(ellipse 90% 140% at 100% -10%, var(--erp-accent-glow), transparent 55%), var(--erp-grad-panel)',
        }}
      >
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--erp-accent-soft)] blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--erp-accent)]">
              <Sparkles size={13} />
              {company}
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight md:text-4xl">
              {greeting()}, {firstName}
            </h1>
            <p className="mt-2 text-sm text-[var(--erp-muted)]">
              {dateLabel}. Your HR workspace overview for today.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {roles.slice(0, 3).map((role) => (
                <span key={role} className="erp-badge erp-badge-accent">
                  {roleLabel(role)}
                </span>
              ))}
              {session?.isPlatformAdmin && (
                <span className="erp-badge erp-badge-accent">Platform admin</span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {canEmployees && (
              <Link to="/employees" className="erp-btn erp-btn-primary">
                <Users size={15} />
                Employees
              </Link>
            )}
            {canAttendance && attendanceEnabled && (
              <Link to="/attendance" className="erp-btn erp-btn-ghost">
                <CalendarDays size={15} />
                Attendance
              </Link>
            )}
            {canLeaves && leaveEnabled && (
              <Link to="/leaves" className="erp-btn erp-btn-ghost">
                <CalendarRange size={15} />
                Leaves
              </Link>
            )}
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {canEmployees && (
          <StatCard
            label="Employees"
            value={employees.data?.length ?? 0}
            icon={<Users size={16} />}
            loading={employees.isLoading}
            hint={`${setup.data?.departments.length ?? 0} departments · ${setup.data?.branches.length ?? 0} branches`}
          />
        )}
        {canAttendanceReport && attendanceEnabled && (
          <StatCard
            label="Present today"
            value={presentToday}
            icon={<CalendarCheck2 size={16} />}
            loading={daily.isLoading}
            hint={`${absentToday} absent · ${onLeaveToday} on leave`}
          />
        )}
        {canLeaves && leaveEnabled && (
          <StatCard
            label="Pending leaves"
            value={pendingLeaves.length}
            icon={<CalendarRange size={16} />}
            loading={leaveRequests.isLoading}
            hint={
              canApproveLeave
                ? 'Waiting for review'
                : 'Your open leave requests'
            }
          />
        )}
        {canAttendance && attendanceEnabled && (
          <StatCard
            label="Corrections"
            value={pendingCorrections.length}
            icon={<Clock3 size={16} />}
            loading={corrections.isLoading}
            hint="Attendance fixes awaiting decision"
          />
        )}
        {!canEmployees && !canAttendance && !canLeaves && (
          <StatCard
            label="Your access"
            value={roles.length ? roleLabel(roles[0]) : 'Member'}
            icon={<UserRound size={16} />}
            hint="Ask an admin if modules are missing"
          />
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        {/* Today / clock */}
        <div className="space-y-6">
          {canAttendance && attendanceEnabled && (
            <div className="erp-panel p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold">My day</h2>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    {today.data?.shift
                      ? `${today.data.shift.name} · ${today.data.shift.startTime.slice(0, 5)} – ${today.data.shift.endTime.slice(0, 5)}`
                      : 'No shift assigned for today'}
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
                  Link your user to an employee profile to use check-in.
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
                          Worked {Math.round(attendanceRow.workedMinutes / 60)}h{' '}
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
                        disabled={!checkedIn || checkedOut || checkOut.isPending}
                        onClick={() => checkOut.mutate()}
                      >
                        <LogOut size={15} />
                        {checkOut.isPending ? 'Checking out…' : 'Check out'}
                      </button>
                      <Link to="/attendance" className="erp-btn erp-btn-ghost">
                        Open attendance
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Modules */}
          <div className="erp-panel p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">HR modules</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Jump into the areas you use most.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {modules.map((m) => {
                const Icon = m.icon;
                return (
                  <Link
                    key={m.to}
                    to={m.to}
                    className="erp-panel erp-panel-interactive group flex items-start gap-3 !rounded-2xl p-4"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
                      <Icon size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="font-medium">{m.label}</span>
                        <ArrowRight
                          size={14}
                          className="text-[var(--erp-muted)] transition group-hover:translate-x-0.5 group-hover:text-[var(--erp-accent)]"
                        />
                      </span>
                      <span className="mt-0.5 block text-xs text-[var(--erp-muted)]">
                        {m.desc}
                      </span>
                    </span>
                  </Link>
                );
              })}
              {!modules.length && (
                <p className="col-span-full rounded-2xl border border-dashed border-[var(--erp-line)] px-4 py-8 text-center text-sm text-[var(--erp-muted)]">
                  No modules available yet. Ask your company admin for access.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Attention + org snapshot */}
        <div className="space-y-6">
          <div className="erp-panel p-5 md:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="font-semibold">Needs attention</h2>
                <p className="mt-1 text-sm text-[var(--erp-muted)]">
                  Pending leaves and attendance corrections.
                </p>
              </div>
              <span className="erp-badge erp-badge-warning">
                {attentionItems.length}
              </span>
            </div>

            <div className="mt-4 space-y-2">
              {attentionItems.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[var(--erp-line)] px-4 py-10 text-center">
                  <p className="font-medium">All clear</p>
                  <p className="mt-1 text-sm text-[var(--erp-muted)]">
                    No pending approvals right now.
                  </p>
                </div>
              )}
              {attentionItems.map((item) => (
                <Link
                  key={item.id}
                  to={item.to}
                  className="erp-hover flex items-start gap-3 rounded-2xl border border-[var(--erp-line)] px-3.5 py-3"
                >
                  <span className="mt-0.5 grid h-9 w-9 place-items-center rounded-xl bg-[var(--erp-accent-soft)] text-[var(--erp-accent)]">
                    <CalendarCheck2 size={15} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium">{item.title}</span>
                      <Badge tone={item.tone}>{item.status}</Badge>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-[var(--erp-muted)]">
                      {item.meta}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </div>

          {canEmployees && (
            <div className="erp-panel p-5 md:p-6">
              <h2 className="font-semibold">Organization</h2>
              <p className="mt-1 text-sm text-[var(--erp-muted)]">
                Structure snapshot for {company}.
              </p>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[
                  {
                    label: 'People',
                    value: employees.data?.length ?? 0,
                    icon: Users,
                  },
                  {
                    label: 'Departments',
                    value: setup.data?.departments.length ?? 0,
                    icon: Network,
                  },
                  {
                    label: 'Branches',
                    value: setup.data?.branches.length ?? 0,
                    icon: Building2,
                  },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-[var(--erp-line)] bg-[var(--erp-panel-2)] p-3 text-center"
                    >
                      <Icon
                        size={14}
                        className="mx-auto text-[var(--erp-accent)]"
                      />
                      <p className="mt-2 text-xl font-semibold tracking-tight">
                        {item.value}
                      </p>
                      <p className="text-[11px] text-[var(--erp-muted)]">
                        {item.label}
                      </p>
                    </div>
                  );
                })}
              </div>
              <Link
                to="/organization"
                className="erp-btn erp-btn-ghost mt-4 w-full"
              >
                Manage organization
                <ArrowRight size={14} />
              </Link>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
