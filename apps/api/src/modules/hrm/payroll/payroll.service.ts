import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { Attendance } from '../attendance/entities/attendance.entity';
import { Holiday } from '../attendance/entities/holiday.entity';
import { resolveTenantDs } from '../common/tenant-ds';
import { Employee } from '../employees/entities/employee.entity';
import { PayrollAllowance } from './entities/allowance.entity';
import { Compensation } from './entities/compensation.entity';
import { PayrollDeduction } from './entities/deduction.entity';
import { PayrollApproval } from './entities/payroll-approval.entity';
import { PayrollItem } from './entities/payroll-item.entity';
import {
  PayrollRun,
  PayrollRunStatus,
} from './entities/payroll-run.entity';
import { Payslip } from './entities/payslip.entity';
import { TaxSlab } from './entities/tax-slab.entity';
import {
  calculateEmployeePay,
  countWeekdays,
  PAYROLL_CALC_VERSION,
} from './payroll-calculator';

function effectiveInPeriod(
  from: string,
  to: string | null,
  periodStart: string,
  periodEnd: string,
) {
  return from <= periodEnd && (!to || to >= periodStart);
}

@Injectable()
export class PayrollService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  private ds() {
    return resolveTenantDs(this.tenantDatabases, this.tenantConnections);
  }

  private assertMutable(run: PayrollRun) {
    if (run.finalizedAt || run.status === PayrollRunStatus.APPROVED) {
      throw new BadRequestException('Approved payroll runs are immutable');
    }
  }

  /** Salary roster: employees + current compensation. */
  async salaryRoster() {
    const ds = await this.ds();
    const employees = await ds.getRepository(Employee).find({
      order: { employeeCode: 'ASC' },
      take: 500,
    });
    const comps = await ds.getRepository(Compensation).find({
      order: { effectiveFrom: 'DESC' },
    });
    const today = new Date().toISOString().slice(0, 10);
    return employees.map((e) => {
      const current = comps.find(
        (c) =>
          c.employeeId === e.id &&
          c.effectiveFrom <= today &&
          (!c.effectiveTo || c.effectiveTo >= today),
      );
      return {
        employeeId: e.id,
        employeeCode: e.employeeCode,
        fullName: `${e.firstName} ${e.lastName}`.trim(),
        email: e.email,
        compensation: current
          ? {
              id: current.id,
              baseCents: current.baseCents,
              currency: current.currency,
              effectiveFrom: current.effectiveFrom,
              effectiveTo: current.effectiveTo,
            }
          : null,
      };
    });
  }

  async listCompensations(employeeId?: number) {
    const ds = await this.ds();
    return ds.getRepository(Compensation).find({
      where: employeeId ? { employeeId } : {},
      order: { effectiveFrom: 'DESC' },
      take: 500,
    });
  }

  async upsertCompensation(input: {
    employeeId: number;
    baseCents: number;
    currency?: string;
    effectiveFrom: string;
    effectiveTo?: string | null;
  }) {
    if (input.baseCents < 0) {
      throw new BadRequestException('baseCents must be >= 0');
    }
    const ds = await this.ds();
    const emp = await ds.getRepository(Employee).findOne({
      where: { id: input.employeeId },
    });
    if (!emp) throw new NotFoundException('Employee not found');

    const repo = ds.getRepository(Compensation);
    const row = repo.create({
      employeeId: input.employeeId,
      baseCents: input.baseCents,
      currency: input.currency ?? 'USD',
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    });
    return repo.save(row);
  }

  async listAllowances(employeeId?: number) {
    const ds = await this.ds();
    return ds.getRepository(PayrollAllowance).find({
      where: employeeId ? { employeeId } : {},
      order: { effectiveFrom: 'DESC' },
      take: 500,
    });
  }

  async upsertAllowance(input: {
    employeeId: number;
    name: string;
    kind: 'fixed' | 'percent_base';
    amountValue: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    isTaxable?: boolean;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(PayrollAllowance);
    return repo.save(
      repo.create({
        employeeId: input.employeeId,
        name: input.name,
        kind: input.kind,
        amountValue: input.amountValue,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        isTaxable: input.isTaxable !== false,
      }),
    );
  }

  async listDeductions(employeeId?: number) {
    const ds = await this.ds();
    return ds.getRepository(PayrollDeduction).find({
      where: employeeId ? { employeeId } : {},
      order: { effectiveFrom: 'DESC' },
      take: 500,
    });
  }

  async upsertDeduction(input: {
    employeeId: number;
    name: string;
    kind: 'fixed' | 'percent_base';
    amountValue: number;
    effectiveFrom: string;
    effectiveTo?: string | null;
    isPreTax?: boolean;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(PayrollDeduction);
    return repo.save(
      repo.create({
        employeeId: input.employeeId,
        name: input.name,
        kind: input.kind,
        amountValue: input.amountValue,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo ?? null,
        isPreTax: input.isPreTax !== false,
      }),
    );
  }

  async listTaxSlabs() {
    const ds = await this.ds();
    return ds.getRepository(TaxSlab).find({
      where: { isActive: true },
      order: { sortOrder: 'ASC', fromCents: 'ASC' },
    });
  }

  async upsertTaxSlab(input: {
    id?: number;
    name: string;
    fromCents: number;
    toCents?: number | null;
    rateBps: number;
    sortOrder?: number;
    isActive?: boolean;
  }) {
    const ds = await this.ds();
    const repo = ds.getRepository(TaxSlab);
    if (input.id) {
      const row = await repo.findOne({ where: { id: input.id } });
      if (!row) throw new NotFoundException('Tax slab not found');
      row.name = input.name;
      row.fromCents = input.fromCents;
      row.toCents = input.toCents ?? null;
      row.rateBps = input.rateBps;
      if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
      if (input.isActive !== undefined) row.isActive = input.isActive;
      return repo.save(row);
    }
    return repo.save(
      repo.create({
        name: input.name,
        fromCents: input.fromCents,
        toCents: input.toCents ?? null,
        rateBps: input.rateBps,
        sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive !== false,
      }),
    );
  }

  async ensureDefaultTaxSlabs() {
    const ds = await this.ds();
    const repo = ds.getRepository(TaxSlab);
    const count = await repo.count();
    if (count > 0) return this.listTaxSlabs();
    // Monthly taxable income slabs (cents).
    await repo.save([
      repo.create({
        name: 'Nil',
        fromCents: 0,
        toCents: 100_000,
        rateBps: 0,
        sortOrder: 1,
      }),
      repo.create({
        name: '5%',
        fromCents: 100_000,
        toCents: 300_000,
        rateBps: 500,
        sortOrder: 2,
      }),
      repo.create({
        name: '10%',
        fromCents: 300_000,
        toCents: null,
        rateBps: 1000,
        sortOrder: 3,
      }),
    ]);
    return this.listTaxSlabs();
  }

  async listRuns() {
    const ds = await this.ds();
    return ds.getRepository(PayrollRun).find({
      order: { periodStart: 'DESC' },
      take: 50,
    });
  }

  async getRun(id: number) {
    const ds = await this.ds();
    const run = await ds.getRepository(PayrollRun).findOne({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    const items = await ds.getRepository(PayrollItem).find({
      where: { payrollRunId: id },
      order: { employeeId: 'ASC' },
    });
    const approvals = await ds.getRepository(PayrollApproval).find({
      where: { payrollRunId: id },
      order: { createdAt: 'ASC' },
    });
    const employees = await ds.getRepository(Employee).find();
    const byId = new Map(employees.map((e) => [e.id, e]));
    return {
      ...run,
      items: items.map((i) => {
        const e = byId.get(i.employeeId);
        return {
          ...i,
          employeeCode: e?.employeeCode,
          fullName: e ? `${e.firstName} ${e.lastName}`.trim() : null,
        };
      }),
      approvals,
    };
  }

  async generateRun(
    user: AuthUser,
    input: { periodStart: string; periodEnd: string; notes?: string },
  ) {
    if (input.periodEnd < input.periodStart) {
      throw new BadRequestException('periodEnd must be >= periodStart');
    }
    const ds = await this.ds();
    await this.ensureDefaultTaxSlabs();

    const runRepo = ds.getRepository(PayrollRun);
    const existing = await runRepo.findOne({
      where: {
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: PayrollRunStatus.APPROVED,
      },
    });
    if (existing) {
      throw new BadRequestException(
        'An approved run already exists for this period',
      );
    }

    const employees = await ds.getRepository(Employee).find({ take: 500 });
    const comps = await ds.getRepository(Compensation).find();
    const allowances = await ds.getRepository(PayrollAllowance).find();
    const deductions = await ds.getRepository(PayrollDeduction).find();
    const taxSlabs = await ds.getRepository(TaxSlab).find({
      where: { isActive: true },
      order: { sortOrder: 'ASC' },
    });
    const holidayRows = await ds.getRepository(Holiday).find({
      where: {
        holidayDate: Between(input.periodStart, input.periodEnd),
      },
    });
    const holidaySet = new Set(
      holidayRows
        .filter((h) => !h.isOptional)
        .map((h) => h.holidayDate),
    );

    let daysExpected = countWeekdays(input.periodStart, input.periodEnd);
    // Subtract weekday holidays
    for (const d of holidaySet) {
      const day = new Date(`${d}T00:00:00Z`).getUTCDay();
      if (day !== 0 && day !== 6) daysExpected = Math.max(0, daysExpected - 1);
    }

    const attendances = await ds.getRepository(Attendance).find({
      where: {
        workDate: Between(input.periodStart, input.periodEnd) as never,
      },
    });
    const presentByEmp = new Map<number, number>();
    for (const a of attendances) {
      if (a.status === 'present' || a.status === 'late') {
        presentByEmp.set(a.employeeId, (presentByEmp.get(a.employeeId) ?? 0) + 1);
      }
    }

    const snapshotAt = new Date();
    const run = await runRepo.save(
      runRepo.create({
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: PayrollRunStatus.DRAFT,
        createdByUserId: user.userId,
        notes: input.notes ?? null,
        totalCents: 0,
        calculationVersion: PAYROLL_CALC_VERSION,
        attendanceSnapshotAt: snapshotAt,
        finalizedAt: null,
      }),
    );

    const itemRepo = ds.getRepository(PayrollItem);
    let total = 0;

    for (const emp of employees) {
      const comp = comps
        .filter((c) => c.employeeId === emp.id)
        .filter((c) =>
          effectiveInPeriod(
            c.effectiveFrom,
            c.effectiveTo,
            input.periodStart,
            input.periodEnd,
          ),
        )
        .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];

      const baseCents = comp?.baseCents ?? 0;
      const empAllow = allowances
        .filter((a) => a.employeeId === emp.id)
        .filter((a) =>
          effectiveInPeriod(
            a.effectiveFrom,
            a.effectiveTo,
            input.periodStart,
            input.periodEnd,
          ),
        );
      const empDed = deductions
        .filter((d) => d.employeeId === emp.id)
        .filter((d) =>
          effectiveInPeriod(
            d.effectiveFrom,
            d.effectiveTo,
            input.periodStart,
            input.periodEnd,
          ),
        );

      const daysPresent = presentByEmp.get(emp.id) ?? daysExpected;
      const calc = calculateEmployeePay({
        employeeId: emp.id,
        baseCents,
        allowances: empAllow.map((a) => ({
          name: a.name,
          kind: a.kind,
          amountValue: a.amountValue,
          isTaxable: a.isTaxable,
        })),
        deductions: empDed.map((d) => ({
          name: d.name,
          kind: d.kind,
          amountValue: d.amountValue,
          isPreTax: d.isPreTax,
        })),
        daysPresent: presentByEmp.has(emp.id) ? daysPresent : daysExpected,
        daysExpected,
        taxSlabs: taxSlabs.map((s) => ({
          fromCents: s.fromCents,
          toCents: s.toCents,
          rateBps: s.rateBps,
        })),
      });

      total += calc.netCents;
      await itemRepo.save(
        itemRepo.create({
          payrollRunId: run.id,
          employeeId: emp.id,
          baseCents: calc.proratedBaseCents,
          allowanceCents: calc.allowanceCents,
          deductionCents: calc.deductionCents,
          taxCents: calc.taxCents,
          netCents: calc.netCents,
          daysPresent: calc.daysPresent,
          daysExpected: calc.daysExpected,
          breakdown: calc.breakdown,
        }),
      );
    }

    run.totalCents = total;
    await runRepo.save(run);
    return this.getRun(run.id);
  }

  async recalculateDraft(id: number, user: AuthUser) {
    const ds = await this.ds();
    const run = await ds.getRepository(PayrollRun).findOne({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    this.assertMutable(run);
    if (run.status !== PayrollRunStatus.DRAFT) {
      throw new BadRequestException('Only draft runs can be recalculated');
    }
    const periodStart = run.periodStart;
    const periodEnd = run.periodEnd;
    const notes = run.notes;
    await ds.getRepository(PayrollItem).delete({ payrollRunId: id });
    await ds.getRepository(PayrollRun).delete({ id });
    return this.generateRun(user, { periodStart, periodEnd, notes: notes ?? undefined });
  }

  async submitForHr(id: number) {
    return this.transition(id, PayrollRunStatus.DRAFT, PayrollRunStatus.PENDING_HR);
  }

  async decideHr(
    id: number,
    user: AuthUser,
    input: { approve: boolean; remarks?: string },
  ) {
    const ds = await this.ds();
    const run = await ds.getRepository(PayrollRun).findOne({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    this.assertMutable(run);
    if (run.status !== PayrollRunStatus.PENDING_HR) {
      throw new BadRequestException('Run is not pending HR approval');
    }
    await ds.getRepository(PayrollApproval).save(
      ds.getRepository(PayrollApproval).create({
        payrollRunId: id,
        step: 'hr',
        decision: input.approve ? 'approved' : 'rejected',
        actorUserId: user.userId,
        remarks: input.remarks ?? null,
      }),
    );
    run.status = input.approve
      ? PayrollRunStatus.PENDING_CEO
      : PayrollRunStatus.REJECTED;
    await ds.getRepository(PayrollRun).save(run);
    return this.getRun(id);
  }

  async decideCeo(
    id: number,
    user: AuthUser,
    input: { approve: boolean; remarks?: string },
  ) {
    const ds = await this.ds();
    const run = await ds.getRepository(PayrollRun).findOne({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    this.assertMutable(run);
    if (run.status !== PayrollRunStatus.PENDING_CEO) {
      throw new BadRequestException('Run is not pending CEO approval');
    }
    // Separation of duties: HR approver cannot also be CEO approver on same run.
    const hrApproval = await ds.getRepository(PayrollApproval).findOne({
      where: { payrollRunId: id, step: 'hr', decision: 'approved' },
    });
    if (hrApproval && hrApproval.actorUserId === user.userId) {
      throw new ForbiddenException(
        'Same user cannot approve both HR and CEO steps',
      );
    }

    await ds.getRepository(PayrollApproval).save(
      ds.getRepository(PayrollApproval).create({
        payrollRunId: id,
        step: 'ceo',
        decision: input.approve ? 'approved' : 'rejected',
        actorUserId: user.userId,
        remarks: input.remarks ?? null,
      }),
    );

    if (!input.approve) {
      run.status = PayrollRunStatus.REJECTED;
      await ds.getRepository(PayrollRun).save(run);
      return this.getRun(id);
    }

    // Finalize + issue payslips (immutable).
    run.status = PayrollRunStatus.APPROVED;
    run.finalizedAt = new Date();
    await ds.getRepository(PayrollRun).save(run);

    const items = await ds.getRepository(PayrollItem).find({
      where: { payrollRunId: id },
    });
    const employees = await ds.getRepository(Employee).find();
    const byId = new Map(employees.map((e) => [e.id, e]));
    const payslipRepo = ds.getRepository(Payslip);
    const issuedAt = new Date();
    for (const item of items) {
      const emp = byId.get(item.employeeId);
      await payslipRepo.save(
        payslipRepo.create({
          payrollRunId: id,
          payrollItemId: item.id,
          employeeId: item.employeeId,
          issuedAt,
          snapshot: {
            runId: id,
            periodStart: run.periodStart,
            periodEnd: run.periodEnd,
            calculationVersion: run.calculationVersion,
            employeeCode: emp?.employeeCode,
            fullName: emp ? `${emp.firstName} ${emp.lastName}`.trim() : null,
            baseCents: item.baseCents,
            allowanceCents: item.allowanceCents,
            deductionCents: item.deductionCents,
            taxCents: item.taxCents,
            netCents: item.netCents,
            daysPresent: item.daysPresent,
            daysExpected: item.daysExpected,
            breakdown: item.breakdown,
          },
        }),
      );
    }

    return this.getRun(id);
  }

  async listPayslips(employeeId?: number) {
    const ds = await this.ds();
    return ds.getRepository(Payslip).find({
      where: employeeId ? { employeeId } : {},
      order: { issuedAt: 'DESC' },
      take: 200,
    });
  }

  async getPayslip(id: number, user: AuthUser) {
    const ds = await this.ds();
    const slip = await ds.getRepository(Payslip).findOne({ where: { id } });
    if (!slip) throw new NotFoundException('Payslip not found');

    const canViewAll =
      user.permissions.includes('payroll.view') ||
      user.permissions.includes('tenant:*');
    if (!canViewAll) {
      const me = await ds.getRepository(Employee).findOne({
        where: { userId: user.userId },
      });
      if (!me || me.id !== slip.employeeId) {
        throw new ForbiddenException('Cannot view this payslip');
      }
    }
    return slip;
  }

  private async transition(
    id: number,
    from: PayrollRunStatus,
    to: PayrollRunStatus,
  ) {
    const ds = await this.ds();
    const repo = ds.getRepository(PayrollRun);
    const run = await repo.findOne({ where: { id } });
    if (!run) throw new NotFoundException('Payroll run not found');
    this.assertMutable(run);
    if (run.status !== from) {
      throw new BadRequestException(
        `Run must be ${from} to transition (current: ${run.status})`,
      );
    }
    run.status = to;
    await repo.save(run);
    return this.getRun(id);
  }
}
