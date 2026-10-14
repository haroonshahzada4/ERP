import { AttendanceStatus } from './entities/attendance.entity';
import { Shift } from './entities/shift.entity';

/** Build a Date on the same calendar day as `base` at HH:MM(:SS). */
export function wallClockOnDay(base: Date, timeHms: string) {
  const [hh, mm, ss] = timeHms.split(':').map((p) => Number(p) || 0);
  const d = new Date(base);
  d.setHours(hh, mm, ss, 0);
  return d;
}

export function computeLateMinutes(shift: Shift, checkIn: Date) {
  const start = wallClockOnDay(checkIn, shift.startTime);
  const graceMs = (shift.graceMinutes ?? 0) * 60_000;
  const delta = checkIn.getTime() - start.getTime() - graceMs;
  return delta > 0 ? Math.round(delta / 60_000) : 0;
}

export function computeEarlyDepartureMinutes(shift: Shift, checkOut: Date) {
  let end = wallClockOnDay(checkOut, shift.endTime);
  if (shift.isOvernight && end <= wallClockOnDay(checkOut, shift.startTime)) {
    end = new Date(end.getTime() + 24 * 60 * 60_000);
  }
  const graceMs = (shift.earlyGraceMinutes ?? 0) * 60_000;
  const delta = end.getTime() - checkOut.getTime() - graceMs;
  return delta > 0 ? Math.round(delta / 60_000) : 0;
}

export function computeOvertimeMinutes(shift: Shift, checkOut: Date) {
  let end = wallClockOnDay(checkOut, shift.endTime);
  if (shift.isOvernight && end <= wallClockOnDay(checkOut, shift.startTime)) {
    end = new Date(end.getTime() + 24 * 60 * 60_000);
  }
  const threshold = end.getTime() + (shift.otAfterMinutes ?? 0) * 60_000;
  const delta = checkOut.getTime() - threshold;
  return delta > 0 ? Math.round(delta / 60_000) : 0;
}

export function statusFromPunch(input: {
  lateMinutes: number;
  checkInAt: Date | null;
  checkOutAt: Date | null;
}): AttendanceStatus {
  if (!input.checkInAt) return 'incomplete';
  if (input.lateMinutes > 0) return 'late';
  return 'present';
}

export type AttendanceScope = 'self' | 'team' | 'company';

/**
 * Resolve data scope from tenant RBAC permissions.
 * company > team > self
 */
export function resolveAttendanceScope(permissions: string[]): AttendanceScope {
  if (
    permissions.includes('tenant:*') ||
    permissions.includes('attendance.update') ||
    permissions.includes('attendance.import') ||
    permissions.includes('attendance.approve')
  ) {
    return 'company';
  }
  if (
    permissions.includes('attendance.read') ||
    permissions.includes('attendance.report.read')
  ) {
    return 'team';
  }
  return 'self';
}

export function hasAnyPermission(
  permissions: string[],
  keys: string[],
) {
  if (permissions.includes('tenant:*')) return true;
  return keys.some((k) => permissions.includes(k));
}
