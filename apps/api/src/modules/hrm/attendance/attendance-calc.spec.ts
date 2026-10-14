import {
  computeEarlyDepartureMinutes,
  computeLateMinutes,
  computeOvertimeMinutes,
  resolveAttendanceScope,
} from './attendance-calc';
import { Shift } from './entities/shift.entity';

function shift(partial: Partial<Shift>): Shift {
  return {
    id: 1,
    name: 'General',
    code: 'GEN',
    startTime: '09:00:00',
    endTime: '18:00:00',
    graceMinutes: 15,
    earlyGraceMinutes: 10,
    otAfterMinutes: 30,
    isOvernight: false,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...partial,
  };
}

describe('attendance-calc', () => {
  it('computes late after grace', () => {
    const checkIn = new Date('2026-10-14T09:20:00');
    expect(computeLateMinutes(shift({}), checkIn)).toBe(5);
  });

  it('computes early departure', () => {
    const checkOut = new Date('2026-10-14T17:40:00');
    expect(computeEarlyDepartureMinutes(shift({}), checkOut)).toBe(10);
  });

  it('computes overtime after threshold', () => {
    const checkOut = new Date('2026-10-14T19:00:00');
    // end 18:00 + 30m OT threshold = 18:30 → 30m OT
    expect(computeOvertimeMinutes(shift({}), checkOut)).toBe(30);
  });

  it('resolves attendance scope', () => {
    expect(resolveAttendanceScope(['attendance.update'])).toBe('company');
    expect(resolveAttendanceScope(['attendance.read'])).toBe('team');
    expect(resolveAttendanceScope(['attendance.create'])).toBe('self');
  });
});
