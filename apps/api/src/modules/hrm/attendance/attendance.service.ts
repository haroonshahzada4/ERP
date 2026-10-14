import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as ExcelJS from 'exceljs';
import PDFDocument = require('pdfkit');
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { Employee } from '../employees/entities/employee.entity';
import { Leave } from '../leaves/entities/leave.entity';
import { resolveTenantDs, todayIso } from '../common/tenant-ds';
import {
  computeEarlyDepartureMinutes,
  computeLateMinutes,
  computeOvertimeMinutes,
  hasAnyPermission,
  resolveAttendanceScope,
  statusFromPunch,
  type AttendanceScope,
} from './attendance-calc';
import { AttendanceRequest } from './entities/attendance-request.entity';
import { Attendance, AttendanceStatus } from './entities/attendance.entity';
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

  // ---- Shifts / holidays ----

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
    earlyGraceMinutes?: number;
    otAfterMinutes?: number;
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
        earlyGraceMinutes: input.earlyGraceMinutes ?? 0,
        otAfterMinutes: input.otAfterMinutes ?? 0,
        isOvernight: !!input.isOvernight,
        isActive: true,
      }),
    );
  }

  async listHolidays() {
    const ds = await this.ds();
    return ds.getRepository(Holiday).find({ order: { holidayDate: 'ASC' } });
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

  // ---- List / update ----

  async list(
    user: AuthUser,
    filters: {
      from?: string;
      to?: string;
      employeeId?: number;
      status?: string;
      q?: string;
    },
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
    if (filters.status) {
      qb.andWhere('a.status = :status', { status: filters.status });
    }
    if (filters.q?.trim()) {
      const q = `%${filters.q.trim().toLowerCase()}%`;
      qb.andWhere(
        `(LOWER(employee.firstName) LIKE :q OR LOWER(employee.lastName) LIKE :q OR LOWER(employee.employeeCode) LIKE :q OR LOWER(CONCAT(employee.firstName, ' ', employee.lastName)) LIKE :q)`,
        { q },
      );
    }

    await this.applyScopeFilter(qb, ds, user, 'a.employeeId');

    const rows = await qb.getMany();
    return rows.map((r) => this.serializeAttendance(r));
  }

  async updateRecord(
    id: number,
    user: AuthUser,
    input: {
      checkInAt?: string | null;
      checkOutAt?: string | null;
      status?: AttendanceStatus;
      notes?: string | null;
      lateMinutes?: number;
      earlyDepartureMinutes?: number;
      overtimeMinutes?: number;
      workedMinutes?: number;
    },
  ) {
    if (
      !hasAnyPermission(user.permissions, [
        'attendance.update',
        'attendance.approve',
      ])
    ) {
      throw new ForbiddenException('Missing attendance.update');
    }
    const ds = await this.ds();
    const repo = ds.getRepository(Attendance);
    const row = await repo.findOne({
      where: { id },
      relations: { employee: true, shift: true },
    });
    if (!row) throw new NotFoundException('Attendance not found');

    await this.assertCanAccessEmployee(ds, user, row.employeeId);

    if (input.checkInAt !== undefined) {
      row.checkInAt = input.checkInAt ? new Date(input.checkInAt) : null;
    }
    if (input.checkOutAt !== undefined) {
      row.checkOutAt = input.checkOutAt ? new Date(input.checkOutAt) : null;
    }
    if (input.notes !== undefined) row.notes = input.notes;
    if (input.status) row.status = input.status;

    const shift =
      row.shift ??
      (row.shiftId
        ? await ds.getRepository(Shift).findOne({ where: { id: row.shiftId } })
        : await this.activeShiftFor(ds, row.employeeId, row.workDate));

    this.recalculatePunchMetrics(row, shift);

    if (input.lateMinutes !== undefined) row.lateMinutes = input.lateMinutes;
    if (input.earlyDepartureMinutes !== undefined) {
      row.earlyDepartureMinutes = input.earlyDepartureMinutes;
    }
    if (input.overtimeMinutes !== undefined) {
      row.overtimeMinutes = input.overtimeMinutes;
    }
    if (input.workedMinutes !== undefined) {
      row.workedMinutes = input.workedMinutes;
    }
    if (input.status) row.status = input.status;

    await repo.save(row);
    return this.serializeAttendance(
      (await repo.findOne({
        where: { id: row.id },
        relations: { employee: true, shift: true },
      }))!,
    );
  }

  // ---- Punch ----

  async myToday(user: AuthUser) {
    const ds = await this.ds();
    const self = await this.requireSelfEmployee(ds, user);
    const workDate = todayIso();
    const holiday = await ds.getRepository(Holiday).findOne({
      where: { holidayDate: workDate },
    });
    const shift = await this.activeShiftFor(ds, self.id, workDate);
    const row = await ds.getRepository(Attendance).findOne({
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
            earlyGraceMinutes: shift.earlyGraceMinutes,
            otAfterMinutes: shift.otAfterMinutes,
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
    if (row && (row.status === 'on_leave' || row.status === 'holiday')) {
      throw new BadRequestException(`Cannot check in — status is ${row.status}`);
    }

    const now = new Date();
    const shift = await this.activeShiftFor(ds, self.id, workDate);
    const lateMinutes = shift ? computeLateMinutes(shift, now) : 0;
    const status = statusFromPunch({
      lateMinutes,
      checkInAt: now,
      checkOutAt: null,
    });

    if (!row) {
      row = repo.create({
        employeeId: self.id,
        workDate,
        shiftId: shift?.id ?? null,
        checkInAt: now,
        checkOutAt: null,
        status,
        lateMinutes,
        earlyDepartureMinutes: 0,
        overtimeMinutes: 0,
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
    const shift =
      row.shift ??
      (await this.activeShiftFor(ds, self.id, workDate));
    this.recalculatePunchMetrics(row, shift);
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

    const scope = resolveAttendanceScope(user.permissions);
    if (scope !== 'company') {
      const self = await this.requireSelfEmployee(ds, user);
      if (scope === 'self') {
        qb.andWhere('r.employeeId = :selfId', { selfId: self.id });
      } else {
        const ids = await this.scopeEmployeeIds(ds, user);
        qb.andWhere('r.employeeId IN (:...ids)', { ids });
      }
    }

    return (await qb.getMany()).map((r) => this.serializeRequest(r));
  }

  async decideRequest(
    id: number,
    user: AuthUser,
    input: { approve: boolean; note?: string },
  ) {
    if (
      !hasAnyPermission(user.permissions, [
        'attendance.update',
        'attendance.approve',
      ])
    ) {
      throw new ForbiddenException('Missing attendance.update');
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
      const shift = await this.activeShiftFor(
        ds,
        row.employeeId,
        row.workDate,
      );
      this.recalculatePunchMetrics(attendance, shift);
      attendance = await attRepo.save(attendance);
      row.attendanceId = attendance.id;
      await repo.save(row);
    }

    return this.serializeRequest(row);
  }

  // ---- Automation (tenant DS injected by jobs) ----

  async generateDailyRecords(ds: DataSource, workDate: string) {
    const employees = await ds
      .getRepository(Employee)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.employmentStatus', 'status')
      .where('status.isActive = true OR e.employmentStatusId IS NULL')
      .getMany();

    const holiday = await ds.getRepository(Holiday).findOne({
      where: { holidayDate: workDate, isOptional: false },
    });
    const onLeaveIds = await this.employeesOnLeave(ds, workDate);
    const repo = ds.getRepository(Attendance);
    let created = 0;

    for (const emp of employees) {
      const existing = await repo.findOne({
        where: { employeeId: emp.id, workDate },
      });
      if (existing) continue;

      const shift = await this.activeShiftFor(ds, emp.id, workDate);
      let status: AttendanceStatus = 'incomplete';
      if (holiday) status = 'holiday';
      else if (onLeaveIds.has(emp.id)) status = 'on_leave';

      await repo.save(
        repo.create({
          employeeId: emp.id,
          workDate,
          shiftId: shift?.id ?? null,
          status,
          checkInAt: null,
          checkOutAt: null,
          lateMinutes: 0,
          earlyDepartureMinutes: 0,
          overtimeMinutes: 0,
          workedMinutes: 0,
        }),
      );
      created += 1;
    }
    return { created };
  }

  async updateStatusesForDate(ds: DataSource, workDate: string) {
    const holiday = await ds.getRepository(Holiday).findOne({
      where: { holidayDate: workDate, isOptional: false },
    });
    const onLeaveIds = await this.employeesOnLeave(ds, workDate);
    const repo = ds.getRepository(Attendance);
    const rows = await repo.find({
      where: { workDate },
      relations: { shift: true },
    });
    const now = new Date();
    const today = todayIso(now);
    let updated = 0;

    for (const row of rows) {
      let changed = false;

      if (holiday && !row.checkInAt && row.status !== 'holiday') {
        row.status = 'holiday';
        changed = true;
      } else if (
        onLeaveIds.has(row.employeeId) &&
        !row.checkInAt &&
        row.status !== 'on_leave'
      ) {
        row.status = 'on_leave';
        changed = true;
      } else if (
        !holiday &&
        !onLeaveIds.has(row.employeeId) &&
        !row.checkInAt &&
        workDate < today &&
        row.status !== 'absent'
      ) {
        row.status = 'absent';
        changed = true;
      } else if (row.checkInAt) {
        const shift =
          row.shift ??
          (await this.activeShiftFor(ds, row.employeeId, workDate));
        const before = JSON.stringify({
          l: row.lateMinutes,
          e: row.earlyDepartureMinutes,
          o: row.overtimeMinutes,
          w: row.workedMinutes,
          s: row.status,
        });
        this.recalculatePunchMetrics(row, shift);
        const after = JSON.stringify({
          l: row.lateMinutes,
          e: row.earlyDepartureMinutes,
          o: row.overtimeMinutes,
          w: row.workedMinutes,
          s: row.status,
        });
        if (before !== after) changed = true;
      }

      if (changed) {
        await repo.save(row);
        updated += 1;
      }
    }
    return { updated };
  }

  // ---- Import / export ----

  async importRows(
    user: AuthUser,
    rows: Array<{
      employeeCode: string;
      workDate: string;
      checkInAt?: string | null;
      checkOutAt?: string | null;
      status?: AttendanceStatus;
      notes?: string | null;
    }>,
  ) {
    if (!hasAnyPermission(user.permissions, ['attendance.import'])) {
      throw new ForbiddenException('Missing attendance.import');
    }
    const ds = await this.ds();
    const empRepo = ds.getRepository(Employee);
    const attRepo = ds.getRepository(Attendance);
    let upserted = 0;
    const errors: string[] = [];

    for (const [i, raw] of rows.entries()) {
      try {
        const emp = await empRepo.findOne({
          where: { employeeCode: raw.employeeCode.trim() },
        });
        if (!emp) {
          errors.push(`Row ${i + 1}: unknown employee ${raw.employeeCode}`);
          continue;
        }
        let row = await attRepo.findOne({
          where: { employeeId: emp.id, workDate: raw.workDate },
        });
        const shift = await this.activeShiftFor(ds, emp.id, raw.workDate);
        if (!row) {
          row = attRepo.create({
            employeeId: emp.id,
            workDate: raw.workDate,
            shiftId: shift?.id ?? null,
            status: raw.status ?? 'incomplete',
          });
        }
        if (raw.checkInAt !== undefined) {
          row.checkInAt = raw.checkInAt ? new Date(raw.checkInAt) : null;
        }
        if (raw.checkOutAt !== undefined) {
          row.checkOutAt = raw.checkOutAt ? new Date(raw.checkOutAt) : null;
        }
        if (raw.notes !== undefined) row.notes = raw.notes;
        if (raw.status) row.status = raw.status;
        row.shiftId = shift?.id ?? row.shiftId;
        this.recalculatePunchMetrics(row, shift);
        if (raw.status) row.status = raw.status;
        await attRepo.save(row);
        upserted += 1;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }
    return { upserted, errors };
  }

  async exportFile(
    user: AuthUser,
    filters: { from: string; to: string; format: 'xlsx' | 'csv' | 'pdf' },
  ) {
    if (
      !hasAnyPermission(user.permissions, [
        'attendance.export',
        'attendance.report.read',
        'attendance.read',
      ])
    ) {
      throw new ForbiddenException('Missing attendance.export');
    }
    const rows = await this.list(user, {
      from: filters.from,
      to: filters.to,
    });

    if (filters.format === 'csv') {
      const header =
        'employeeCode,employeeName,workDate,status,checkInAt,checkOutAt,lateMinutes,earlyDepartureMinutes,overtimeMinutes,workedMinutes\n';
      const body = rows
        .map((r) =>
          [
            r.employee?.employeeCode ?? '',
            `"${r.employee?.fullName ?? ''}"`,
            r.workDate,
            r.status,
            r.checkInAt ?? '',
            r.checkOutAt ?? '',
            r.lateMinutes,
            r.earlyDepartureMinutes,
            r.overtimeMinutes,
            r.workedMinutes,
          ].join(','),
        )
        .join('\n');
      return {
        filename: `attendance_${filters.from}_${filters.to}.csv`,
        contentType: 'text/csv',
        buffer: Buffer.from(header + body, 'utf8'),
      };
    }

    if (filters.format === 'xlsx') {
      const wb = new ExcelJS.Workbook();
      const sheet = wb.addWorksheet('Attendance');
      sheet.columns = [
        { header: 'Employee Code', key: 'code', width: 14 },
        { header: 'Employee', key: 'name', width: 24 },
        { header: 'Date', key: 'date', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
        { header: 'Check In', key: 'in', width: 22 },
        { header: 'Check Out', key: 'out', width: 22 },
        { header: 'Late (min)', key: 'late', width: 10 },
        { header: 'Early (min)', key: 'early', width: 10 },
        { header: 'OT (min)', key: 'ot', width: 10 },
        { header: 'Worked (min)', key: 'worked', width: 12 },
      ];
      for (const r of rows) {
        sheet.addRow({
          code: r.employee?.employeeCode,
          name: r.employee?.fullName,
          date: r.workDate,
          status: r.status,
          in: r.checkInAt,
          out: r.checkOutAt,
          late: r.lateMinutes,
          early: r.earlyDepartureMinutes,
          ot: r.overtimeMinutes,
          worked: r.workedMinutes,
        });
      }
      const buffer = Buffer.from(await wb.xlsx.writeBuffer());
      return {
        filename: `attendance_${filters.from}_${filters.to}.xlsx`,
        contentType:
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer,
      };
    }

    const buffer = await this.buildPdf(
      `Attendance ${filters.from} → ${filters.to}`,
      rows.map(
        (r) =>
          `${r.workDate}  ${(r.employee?.employeeCode ?? '').padEnd(10)}  ${(r.employee?.fullName ?? '').padEnd(22).slice(0, 22)}  ${r.status.padEnd(10)}  late=${r.lateMinutes} early=${r.earlyDepartureMinutes} ot=${r.overtimeMinutes}`,
      ),
    );
    return {
      filename: `attendance_${filters.from}_${filters.to}.pdf`,
      contentType: 'application/pdf',
      buffer,
    };
  }

  // ---- Reports ----

  async reportDaily(user: AuthUser, date: string) {
    this.requireReport(user);
    const rows = await this.list(user, { from: date, to: date });
    const summary = this.summarize(rows);
    return { date, summary, rows };
  }

  async reportWeekly(user: AuthUser, from: string) {
    this.requireReport(user);
    const start = new Date(from + 'T00:00:00');
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const to = end.toISOString().slice(0, 10);
    const rows = await this.list(user, { from, to });
    return { from, to, summary: this.summarize(rows), rows };
  }

  async reportMonthly(user: AuthUser, year: number, month: number) {
    this.requireReport(user);
    const from = `${year}-${String(month).padStart(2, '0')}-01`;
    const last = new Date(year, month, 0).getDate();
    const to = `${year}-${String(month).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
    const rows = await this.list(user, { from, to });
    return { year, month, from, to, summary: this.summarize(rows), rows };
  }

  async reportSummary(user: AuthUser, from: string, to: string) {
    this.requireReport(user);
    const rows = await this.list(user, { from, to });
    return { from, to, summary: this.summarize(rows) };
  }

  // ---- helpers ----

  private requireReport(user: AuthUser) {
    if (
      !hasAnyPermission(user.permissions, [
        'attendance.report.read',
        'attendance.read',
      ])
    ) {
      throw new ForbiddenException('Missing attendance.report.read');
    }
  }

  private summarize(rows: ReturnType<AttendanceService['serializeAttendance']>[]) {
    const byStatus: Record<string, number> = {};
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    }
    return {
      total: rows.length,
      byStatus,
      totalLateMinutes: rows.reduce((s, r) => s + (r.lateMinutes || 0), 0),
      totalOvertimeMinutes: rows.reduce(
        (s, r) => s + (r.overtimeMinutes || 0),
        0,
      ),
      totalEarlyMinutes: rows.reduce(
        (s, r) => s + (r.earlyDepartureMinutes || 0),
        0,
      ),
      totalWorkedMinutes: rows.reduce((s, r) => s + (r.workedMinutes || 0), 0),
    };
  }

  private recalculatePunchMetrics(
    row: Attendance,
    shift: Shift | null | undefined,
  ) {
    if (row.checkInAt && row.checkOutAt) {
      row.workedMinutes = Math.max(
        0,
        Math.round(
          (row.checkOutAt.getTime() - row.checkInAt.getTime()) / 60_000,
        ),
      );
    } else if (row.checkInAt && !row.checkOutAt) {
      row.workedMinutes = 0;
    }
    if (row.checkInAt && shift) {
      row.lateMinutes = computeLateMinutes(shift, row.checkInAt);
    } else if (!row.checkInAt) {
      row.lateMinutes = 0;
    }
    if (row.checkOutAt && shift) {
      row.earlyDepartureMinutes = computeEarlyDepartureMinutes(
        shift,
        row.checkOutAt,
      );
      row.overtimeMinutes = computeOvertimeMinutes(shift, row.checkOutAt);
    } else {
      row.earlyDepartureMinutes = 0;
      row.overtimeMinutes = 0;
    }
    if (row.checkInAt) {
      row.status = statusFromPunch({
        lateMinutes: row.lateMinutes,
        checkInAt: row.checkInAt,
        checkOutAt: row.checkOutAt,
      });
    }
  }

  private async employeesOnLeave(ds: DataSource, workDate: string) {
    const leaves = await ds.getRepository(Leave).find({
      where: { status: 'approved' },
    });
    const ids = new Set<number>();
    for (const leave of leaves) {
      if (leave.startDate <= workDate && leave.endDate >= workDate) {
        ids.add(leave.employeeId);
      }
    }
    return ids;
  }

  private async applyScopeFilter(
    qb: { andWhere: (sql: string, params?: object) => unknown },
    ds: DataSource,
    user: AuthUser,
    column: string,
  ) {
    const scope = resolveAttendanceScope(user.permissions);
    if (scope === 'company') return;
    const ids = await this.scopeEmployeeIds(ds, user, scope);
    if (!ids.length) {
      qb.andWhere('1=0');
      return;
    }
    qb.andWhere(`${column} IN (:...scopeIds)`, { scopeIds: ids });
  }

  private async assertCanAccessEmployee(
    ds: DataSource,
    user: AuthUser,
    employeeId: number,
  ) {
    const scope = resolveAttendanceScope(user.permissions);
    if (scope === 'company') return;
    const ids = await this.scopeEmployeeIds(ds, user, scope);
    if (!ids.includes(employeeId)) {
      throw new ForbiddenException('Outside your attendance scope');
    }
  }

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

  private async scopeEmployeeIds(
    ds: DataSource,
    user: AuthUser,
    scope?: AttendanceScope,
  ) {
    const resolved = scope ?? resolveAttendanceScope(user.permissions);
    const self = await ds.getRepository(Employee).findOne({
      where: { userId: user.userId },
    });
    if (!self) return [] as number[];
    if (resolved === 'self') return [self.id];
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
        (!a.effectiveTo || a.effectiveTo >= workDate) &&
        a.shift?.isActive !== false,
    );
    return match?.shift ?? null;
  }

  private buildPdf(title: string, lines: string[]): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.fontSize(14).text(title, { underline: true });
      doc.moveDown();
      doc.fontSize(9);
      for (const line of lines) doc.text(line);
      if (!lines.length) doc.text('No records.');
      doc.end();
    });
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
      earlyDepartureMinutes: r.earlyDepartureMinutes ?? 0,
      overtimeMinutes: r.overtimeMinutes ?? 0,
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
