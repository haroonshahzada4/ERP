import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { Employee } from '../employees/entities/employee.entity';
import {
  canApproveAttendance,
  resolveTenantDs,
  todayIso,
} from '../common/tenant-ds';
import { AttendanceRequest } from './entities/attendance-request.entity';
import { Attendance } from './entities/attendance.entity';
import { Holiday } from './entities/holiday.entity';
import { ShiftAssignment } from './entities/shift-assignment.entity';
import { Shift } from './entities/shift.entity';

@Injectable()
export class AttendanceService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  private ds() {
    return resolveTenantDs(this.tenantDatabases, this.tenantConnections);
  }

  // ---- Shifts / holidays setup ----

  async listShifts() {
    const ds = await this.ds();
    return ds.getRepository(Shift).find({ order: { name: 'ASC' } });
  }

  async createShift(input: {
    name: string;
    code: string;
    startTime: string;
    endTime: string;
    graceMinutes?: number;
    isOvernight?: boolean;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(Shift);
    return repo.save(
      repo.create({
        name: input.name,
        code: input.code.toUpperCase(),
        startTime: input.startTime,
        endTime: input.endTime,
        graceMinutes: input.graceMinutes ?? 15,
        isOvernight: !!input.isOvernight,
        isActive: true,
      }),
    );
  }

  async listHolidays() {
    const ds = await this.ds();
    return ds
      .getRepository(Holiday)
      .find({ order: { holidayDate: 'ASC' } });
  }

  async createHoliday(input: {
    holidayDate: string;
    name: string;
    isOptional?: boolean;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(Holiday);
    return repo.save(
      repo.create({
        holidayDate: input.holidayDate,
        name: input.name,
        isOptional: !!input.isOptional,
      }),
    );
  }

  async assignShift(input: {
    employeeId: number;
    shiftId: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) {
    const ds = await this.ds();
    const emp = await ds.getRepository(Employee).findOne({
      where: { id: input.employeeId },
    });
    if (!emp) throw new NotFoundException('Employee not found');
    const shift = await ds.getRepository(Shift).findOne({
      where: { id: input.shiftId },
    });
    if (!shift) throw new NotFoundException('Shift not found');
    const repo = ds.getRepository(ShiftAssignment);
    return repo.save(
      repo.create({
        employeeId: input.employeeId,
        shiftId: input.shiftId,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
      }),
    );
  }

  // ---- Attendance ----

  async list(
    user: AuthUser,
    filters: { from?: string; to?: string; employeeId?: number },
  ) {
    const ds = await this.ds();
    const qb = ds
      .getRepository(Attendance)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.employee', 'employee')
      .leftJoinAndSelect('a.shift', 'shift')
      .orderBy('a.workDate', 'DESC')
      .addOrderBy('employee.employeeCode', 'ASC');

    if (filters.from) qb.andWhere('a.workDate >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('a.workDate <= :to', { to: filters.to });
    if (filters.employeeId) {
      qb.andWhere('a.employeeId = :employeeId', {
        employeeId: filters.employeeId,
      });
    }

    if (!canApproveAttendance(user)) {
      const scopeIds = await this.scopeEmployeeIds(ds, user);
      if (!scopeIds.length) return [];
      qb.andWhere('a.employeeId IN (:...scopeIds)', { scopeIds });
    }

    const rows = await qb.getMany();
    return rows.map((r) => this.serializeAttendance(r));
  }

  async myToday(user: AuthUser) {
    const ds = await this.ds();
    const self = await this.requireSelfEmployee(ds, user);
    const workDate = todayIso();
    const holiday = await ds.getRepository(Holiday).findOne({
      where: { holidayDate: workDate },
    });
    const shift = await this.activeShiftFor(ds, self.id, workDate);
    let row = await ds.getRepository(Attendance).findOne({
      where: { employeeId: self.id, workDate },
      relations: { shift: true, employee: true },
    });
    return {
      workDate,
      holiday: holiday
        ? { id: holiday.id, name: holiday.name, isOptional: holiday.isOptional }
        : null,
      shift: shift
        ? {
            id: shift.id,
            name: shift.name,
            code: shift.code,
            startTime: shift.startTime,
            endTime: shift.endTime,
            graceMinutes: shift.graceMinutes,
          }
        : null,
      attendance: row ? this.serializeAttendance(row) : null,
      employee: {
        id: self.id,
        fullName: `${self.firstName} ${self.lastName}`,
        employeeCode: self.employeeCode,
      },
    };
  }

  async checkIn(user: AuthUser) {
    const ds = await this.ds();
    const self = await this.requireSelfEmployee(ds, user);
    const workDate = todayIso();
    const holiday = await ds.getRepository(Holiday).findOne({
      where: { holidayDate: workDate, isOptional: false },
    });
    if (holiday) {
      throw new BadRequestException(`Today is a holiday (${holiday.name})`);
    }

    const repo = ds.getRepository(Attendance);
    let row = await repo.findOne({
      where: { employeeId: self.id, workDate },
    });
    if (row?.checkInAt) {
      throw new BadRequestException('Already checked in for today');
    }

    const now = new Date();
    const shift = await this.activeShiftFor(ds, self.id, workDate);
    const lateMinutes = shift ? this.computeLateMinutes(shift, now) : 0;
    const status = lateMinutes > 0 ? 'late' : 'present';

    if (!row) {
      row = repo.create({
        employeeId: self.id,
        workDate,
        shiftId: shift?.id ?? null,
        checkInAt: now,
        checkOutAt: null,
        status,
        lateMinutes,
        workedMinutes: 0,
      });
    } else {
      row.checkInAt = now;
      row.shiftId = shift?.id ?? row.shiftId;
      row.status = status;
      row.lateMinutes = lateMinutes;
    }
    row = await repo.save(row);
    return this.serializeAttendance(
      (await repo.findOne({
        where: { id: row.id },
        relations: { employee: true, shift: true },
      }))!,
    );
  }

  async checkOut(user: AuthUser) {
    const ds = await this.ds();
    const self = await this.requireSelfEmployee(ds, user);
    const workDate = todayIso();
    const repo = ds.getRepository(Attendance);
    const row = await repo.findOne({
      where: { employeeId: self.id, workDate },
      relations: { employee: true, shift: true },
    });
    if (!row?.checkInAt) {
      throw new BadRequestException('Check in first');
    }
    if (row.checkOutAt) {
      throw new BadRequestException('Already checked out for today');
    }
    const now = new Date();
    row.checkOutAt = now;
    row.workedMinutes = Math.max(
      0,
      Math.round((now.getTime() - row.checkInAt.getTime()) / 60_000),
    );
    if (row.status === 'incomplete') {
      row.status = row.lateMinutes > 0 ? 'late' : 'present';
    }
    await repo.save(row);
    return this.serializeAttendance(row);
  }

  async requestCorrection(
    user: AuthUser,
    input: {
      workDate: string;
      requestedCheckInAt?: string | null;
      requestedCheckOutAt?: string | null;
      reason: string;
    },
  ) {
    if (!input.requestedCheckInAt && !input.requestedCheckOutAt) {
      throw new BadRequestException('Provide at least one corrected time');
    }
    const ds = await this.ds();
    const self = await this.requireSelfEmployee(ds, user);
    const attendance = await ds.getRepository(Attendance).findOne({
      where: { employeeId: self.id, workDate: input.workDate },
    });
    const pending = await ds.getRepository(AttendanceRequest).findOne({
      where: {
        employeeId: self.id,
        workDate: input.workDate,
        status: 'pending',
      },
    });
    if (pending) {
      throw new BadRequestException('A pending correction already exists');
    }
    const repo = ds.getRepository(AttendanceRequest);
    const row = await repo.save(
      repo.create({
        attendanceId: attendance?.id ?? null,
        employeeId: self.id,
        workDate: input.workDate,
        requestedCheckInAt: input.requestedCheckInAt
          ? new Date(input.requestedCheckInAt)
          : null,
        requestedCheckOutAt: input.requestedCheckOutAt
          ? new Date(input.requestedCheckOutAt)
          : null,
        reason: input.reason,
        status: 'pending',
      }),
    );
    return this.serializeRequest(row);
  }

  async listRequests(user: AuthUser, status?: string) {
    const ds = await this.ds();
    const qb = ds
      .getRepository(AttendanceRequest)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.employee', 'employee')
      .orderBy('r.createdAt', 'DESC');
    if (status) qb.andWhere('r.status = :status', { status });

    if (!canApproveAttendance(user)) {
      const self = await this.requireSelfEmployee(ds, user);
      qb.andWhere('r.employeeId = :selfId', { selfId: self.id });
    }

    return (await qb.getMany()).map((r) => this.serializeRequest(r));
  }

  async decideRequest(
    id: number,
    user: AuthUser,
    input: { approve: boolean; note?: string },
  ) {
    if (!canApproveAttendance(user)) {
      throw new ForbiddenException('Missing attendance.approve');
    }
    const ds = await this.ds();
    const repo = ds.getRepository(AttendanceRequest);
    const row = await repo.findOne({
      where: { id },
      relations: { employee: true },
    });
    if (!row) throw new NotFoundException('Request not found');
    if (row.status !== 'pending') {
      throw new BadRequestException('Request is not pending');
    }

    row.status = input.approve ? 'approved' : 'rejected';
    row.decidedByUserId = user.userId;
    row.decidedAt = new Date();
    row.decisionNote = input.note ?? null;
    await repo.save(row);

    if (input.approve) {
      const attRepo = ds.getRepository(Attendance);
      let attendance =
        (row.attendanceId
          ? await attRepo.findOne({ where: { id: row.attendanceId } })
          : null) ??
        (await attRepo.findOne({
          where: { employeeId: row.employeeId, workDate: row.workDate },
        }));

      if (!attendance) {
        attendance = attRepo.create({
          employeeId: row.employeeId,
          workDate: row.workDate,
          status: 'present',
        });
      }
      if (row.requestedCheckInAt) attendance.checkInAt = row.requestedCheckInAt;
      if (row.requestedCheckOutAt) {
        attendance.checkOutAt = row.requestedCheckOutAt;
      }
      if (attendance.checkInAt && attendance.checkOutAt) {
        attendance.workedMinutes = Math.max(
          0,
          Math.round(
            (attendance.checkOutAt.getTime() -
              attendance.checkInAt.getTime()) /
              60_000,
          ),
        );
      }
      if (attendance.checkInAt) {
        attendance.status =
          attendance.lateMinutes > 0 ? 'late' : 'present';
      }
      attendance = await attRepo.save(attendance);
      row.attendanceId = attendance.id;
      await repo.save(row);
    }

    return this.serializeRequest(row);
  }

  // ---- helpers ----

  private async requireSelfEmployee(ds: DataSource, user: AuthUser) {
    const self = await ds.getRepository(Employee).findOne({
      where: { userId: user.userId },
    });
    if (!self) {
      throw new ForbiddenException(
        'No employee profile linked to your user account',
      );
    }
    return self;
  }

  private async scopeEmployeeIds(ds: DataSource, user: AuthUser) {
    const self = await ds.getRepository(Employee).findOne({
      where: { userId: user.userId },
    });
    if (!self) return [] as string[];
    const reports = await ds.getRepository(Employee).find({
      where: { reportingToId: self.id },
      select: ['id'],
    });
    return [self.id, ...reports.map((r) => r.id)];
  }

  private async activeShiftFor(
    ds: DataSource,
    employeeId: number,
    workDate: string,
  ) {
    const rows = await ds.getRepository(ShiftAssignment).find({
      where: { employeeId },
      relations: { shift: true },
      order: { effectiveFrom: 'DESC' },
    });
    const match = rows.find(
      (a) =>
        a.effectiveFrom <= workDate &&
        (!a.effectiveTo || a.effectiveTo >= workDate),
    );
    return match?.shift ?? null;
  }

  private computeLateMinutes(shift: Shift, checkIn: Date) {
    const [hh, mm] = shift.startTime.split(':').map(Number);
    const start = new Date(checkIn);
    start.setUTCHours(hh, mm, 0, 0);
    // Compare using local wall-clock of check-in day in UTC slice — good enough for MVP
    const startLocal = new Date(checkIn);
    startLocal.setHours(hh, mm, 0, 0);
    const graceMs = (shift.graceMinutes ?? 0) * 60_000;
    const delta = checkIn.getTime() - startLocal.getTime() - graceMs;
    return delta > 0 ? Math.round(delta / 60_000) : 0;
  }

  private serializeAttendance(r: Attendance) {
    return {
      id: r.id,
      employeeId: r.employeeId,
      employee: r.employee
        ? {
            id: r.employee.id,
            fullName: `${r.employee.firstName} ${r.employee.lastName}`,
            employeeCode: r.employee.employeeCode,
          }
        : null,
      workDate: r.workDate,
      status: r.status,
      checkInAt: r.checkInAt,
      checkOutAt: r.checkOutAt,
      lateMinutes: r.lateMinutes,
      workedMinutes: r.workedMinutes,
      notes: r.notes,
      shift: r.shift
        ? {
            id: r.shift.id,
            name: r.shift.name,
            code: r.shift.code,
            startTime: r.shift.startTime,
            endTime: r.shift.endTime,
          }
        : null,
    };
  }

  private serializeRequest(r: AttendanceRequest) {
    return {
      id: r.id,
      attendanceId: r.attendanceId,
      employeeId: r.employeeId,
      employee: r.employee
        ? {
            id: r.employee.id,
            fullName: `${r.employee.firstName} ${r.employee.lastName}`,
            employeeCode: r.employee.employeeCode,
          }
        : null,
      workDate: r.workDate,
      requestedCheckInAt: r.requestedCheckInAt,
      requestedCheckOutAt: r.requestedCheckOutAt,
      reason: r.reason,
      status: r.status,
      decidedAt: r.decidedAt,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt,
    };
  }
}
