import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import {
  canApproveLeave,
  resolveTenantDs,
} from '../common/tenant-ds';
import { Employee } from '../employees/entities/employee.entity';
import { LeaveBalance } from './entities/leave-balance.entity';
import { Leave } from './entities/leave.entity';
import { LeaveType } from './entities/leave-type.entity';
import {
  currentLeaveSession,
  type LeaveSessionWindow,
} from './leave-session';

@Injectable()
export class LeavesService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  private ds() {
    return resolveTenantDs(this.tenantDatabases, this.tenantConnections);
  }

  async listTypes() {
    const ds = await this.ds();
    return ds.getRepository(LeaveType).find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async createType(input: {
    name: string;
    code: string;
    isPaid?: boolean;
    allowHalfDay?: boolean;
    maxDaysPerYear?: number;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(LeaveType);
    return repo.save(
      repo.create({
        name: input.name,
        code: input.code.toUpperCase(),
        isPaid: input.isPaid ?? true,
        allowHalfDay: input.allowHalfDay ?? true,
        maxDaysPerYear: String(input.maxDaysPerYear ?? 0),
        isActive: true,
      }),
    );
  }

  /** Computed Jul–Jun window (no sessions table). */
  listSessions() {
    return [currentLeaveSession()];
  }

  async myBalances(user: AuthUser) {
    const ds = await this.ds();
    const self = await this.requireSelf(ds, user);
    const session = currentLeaveSession();
    await this.ensureBalancesForEmployee(ds, self.id, session);
    const rows = await ds.getRepository(LeaveBalance).find({
      where: {
        employeeId: self.id,
        sessionStartsOn: session.startsOn,
      },
      relations: { leaveType: true },
    });
    return {
      session: {
        name: session.name,
        startsOn: session.startsOn,
        endsOn: session.endsOn,
      },
      balances: rows.map((b) => ({
        id: b.id,
        leaveType: {
          id: b.leaveType.id,
          name: b.leaveType.name,
          code: b.leaveType.code,
          allowHalfDay: b.leaveType.allowHalfDay,
        },
        accrued: Number(b.accrued),
        used: Number(b.used),
        remaining: Number(b.accrued) - Number(b.used),
      })),
    };
  }

  async apply(
    user: AuthUser,
    input: {
      leaveTypeId: number;
      startDate: string;
      endDate: string;
      isHalfDay?: boolean;
      reason: string;
    },
  ) {
    const ds = await this.ds();
    const self = await this.requireSelf(ds, user);
    const session = currentLeaveSession();
    const leaveType = await ds.getRepository(LeaveType).findOne({
      where: { id: input.leaveTypeId, isActive: true },
    });
    if (!leaveType) throw new NotFoundException('Leave type not found');

    if (input.startDate > input.endDate) {
      throw new BadRequestException('startDate must be on or before endDate');
    }

    let days = this.countDays(input.startDate, input.endDate);
    if (input.isHalfDay) {
      if (!leaveType.allowHalfDay) {
        throw new BadRequestException('Half day not allowed for this type');
      }
      if (input.startDate !== input.endDate) {
        throw new BadRequestException('Half day must be a single date');
      }
      days = 0.5;
    }

    await this.ensureBalancesForEmployee(ds, self.id, session);
    const balance = await ds.getRepository(LeaveBalance).findOne({
      where: {
        employeeId: self.id,
        leaveTypeId: leaveType.id,
        sessionStartsOn: session.startsOn,
      },
    });
    if (!balance) throw new BadRequestException('No leave balance');
    const remaining = Number(balance.accrued) - Number(balance.used);
    if (days > remaining) {
      throw new BadRequestException(
        `Insufficient balance (${remaining} remaining)`,
      );
    }

    const overlap = await ds
      .getRepository(Leave)
      .createQueryBuilder('r')
      .where('r.employeeId = :employeeId', { employeeId: self.id })
      .andWhere('r.status IN (:...statuses)', {
        statuses: ['pending_manager', 'pending_hr', 'approved'],
      })
      .andWhere('r.startDate <= :end AND r.endDate >= :start', {
        start: input.startDate,
        end: input.endDate,
      })
      .getOne();
    if (overlap) {
      throw new BadRequestException('Overlapping leave request exists');
    }

    const repo = ds.getRepository(Leave);
    const row = await repo.save(
      repo.create({
        employeeId: self.id,
        leaveTypeId: leaveType.id,
        sessionName: session.name,
        sessionStartsOn: session.startsOn,
        sessionEndsOn: session.endsOn,
        startDate: input.startDate,
        endDate: input.endDate,
        days: String(days),
        isHalfDay: !!input.isHalfDay,
        reason: input.reason,
        status: 'pending_manager',
        managerStatus: 'pending',
        hrStatus: null,
      }),
    );

    return this.getRequest(row.id, user);
  }

  async listRequests(user: AuthUser, status?: string) {
    const ds = await this.ds();
    const qb = ds
      .getRepository(Leave)
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.employee', 'employee')
      .leftJoinAndSelect('r.leaveType', 'leaveType')
      .orderBy('r.createdAt', 'DESC');

    if (status) qb.andWhere('r.status = :status', { status });

    if (!canApproveLeave(user)) {
      const self = await this.requireSelf(ds, user);
      const reports = await ds.getRepository(Employee).find({
        where: { reportingToId: self.id },
        select: ['id'],
      });
      const ids = [self.id, ...reports.map((r) => r.id)];
      qb.andWhere('r.employeeId IN (:...ids)', { ids });
    }

    return (await qb.getMany()).map((r) => this.serialize(r));
  }

  async getRequest(id: number, user: AuthUser) {
    const ds = await this.ds();
    const row = await ds.getRepository(Leave).findOne({
      where: { id },
      relations: { employee: true, leaveType: true },
    });
    if (!row) throw new NotFoundException('Leave request not found');
    await this.assertCanSee(ds, row, user);
    return this.serialize(row);
  }

  async decide(
    id: number,
    user: AuthUser,
    input: { approve: boolean; note?: string },
  ) {
    const ds = await this.ds();
    const repo = ds.getRepository(Leave);
    const row = await repo.findOne({
      where: { id },
      relations: { employee: true, leaveType: true },
    });
    if (!row) throw new NotFoundException('Leave request not found');

    if (row.status === 'pending_manager') {
      await this.assertCanManagerDecide(ds, row, user);
      row.managerStatus = input.approve ? 'approved' : 'rejected';
      row.managerDecidedByUserId = user.userId;
      row.managerDecidedAt = new Date();
      row.managerNote = input.note ?? null;
      if (!input.approve) {
        row.status = 'rejected';
        await repo.save(row);
        return this.serialize(row);
      }
      row.status = 'pending_hr';
      row.hrStatus = 'pending';
      await repo.save(row);
      return this.getRequest(row.id, user);
    }

    if (row.status === 'pending_hr') {
      if (!canApproveLeave(user)) {
        throw new ForbiddenException('Missing leave.approve');
      }
      row.hrStatus = input.approve ? 'approved' : 'rejected';
      row.hrDecidedByUserId = user.userId;
      row.hrDecidedAt = new Date();
      row.hrNote = input.note ?? null;
      if (!input.approve) {
        row.status = 'rejected';
        await repo.save(row);
        return this.serialize(row);
      }
      row.status = 'approved';
      await repo.save(row);
      await this.consumeBalance(ds, row);
      return this.getRequest(row.id, user);
    }

    throw new BadRequestException('Request is not awaiting a decision');
  }

  private async consumeBalance(ds: DataSource, row: Leave) {
    const balance = await ds.getRepository(LeaveBalance).findOne({
      where: {
        employeeId: row.employeeId,
        leaveTypeId: row.leaveTypeId,
        sessionStartsOn: row.sessionStartsOn,
      },
    });
    if (!balance) return;
    balance.used = String(Number(balance.used) + Number(row.days));
    await ds.getRepository(LeaveBalance).save(balance);
  }

  private async ensureBalancesForEmployee(
    ds: DataSource,
    employeeId: number,
    session: LeaveSessionWindow,
  ) {
    const types = await ds.getRepository(LeaveType).find({
      where: { isActive: true },
    });
    const repo = ds.getRepository(LeaveBalance);
    for (const t of types) {
      const existing = await repo.findOne({
        where: {
          employeeId,
          leaveTypeId: t.id,
          sessionStartsOn: session.startsOn,
        },
      });
      if (!existing) {
        await repo.save(
          repo.create({
            employeeId,
            leaveTypeId: t.id,
            sessionName: session.name,
            sessionStartsOn: session.startsOn,
            sessionEndsOn: session.endsOn,
            accrued: t.maxDaysPerYear,
            used: '0',
          }),
        );
      }
    }
  }

  private countDays(start: string, end: string) {
    const a = new Date(start + 'T00:00:00Z');
    const b = new Date(end + 'T00:00:00Z');
    const diff = Math.round((b.getTime() - a.getTime()) / 86_400_000);
    return diff + 1;
  }

  private async requireSelf(ds: DataSource, user: AuthUser) {
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

  private async assertCanSee(ds: DataSource, row: Leave, user: AuthUser) {
    if (canApproveLeave(user)) return;
    const self = await this.requireSelf(ds, user);
    if (row.employeeId === self.id) return;
    if (row.employee?.reportingToId === self.id) return;
    const emp = await ds.getRepository(Employee).findOne({
      where: { id: row.employeeId },
    });
    if (emp?.reportingToId === self.id) return;
    throw new ForbiddenException('Not allowed to view this request');
  }

  private async assertCanManagerDecide(
    ds: DataSource,
    row: Leave,
    user: AuthUser,
  ) {
    if (canApproveLeave(user)) return;
    const self = await this.requireSelf(ds, user);
    const emp =
      row.employee ??
      (await ds.getRepository(Employee).findOne({ where: { id: row.employeeId } }));
    if (emp?.reportingToId !== self.id) {
      throw new ForbiddenException('Only the reporting manager can decide');
    }
  }

  private serialize(r: Leave) {
    const approvals: {
      step: 'manager' | 'hr';
      status: string;
      decidedAt: Date | null;
      note: string | null;
    }[] = [];
    if (r.managerStatus) {
      approvals.push({
        step: 'manager',
        status: r.managerStatus,
        decidedAt: r.managerDecidedAt,
        note: r.managerNote,
      });
    }
    if (r.hrStatus) {
      approvals.push({
        step: 'hr',
        status: r.hrStatus,
        decidedAt: r.hrDecidedAt,
        note: r.hrNote,
      });
    }

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
      leaveType: r.leaveType
        ? {
            id: r.leaveType.id,
            name: r.leaveType.name,
            code: r.leaveType.code,
          }
        : null,
      session: {
        name: r.sessionName,
        startsOn: r.sessionStartsOn,
        endsOn: r.sessionEndsOn,
      },
      startDate: r.startDate,
      endDate: r.endDate,
      days: Number(r.days),
      isHalfDay: r.isHalfDay,
      reason: r.reason,
      status: r.status,
      approvals,
      createdAt: r.createdAt,
    };
  }
}
