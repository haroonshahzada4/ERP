import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { getTenantContext } from '../../../common/tenant/tenant-context';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { Employee } from './entities/employee.entity';
import { EmploymentHistory } from './entities/employment-history.entity';

@Injectable()
export class EmployeesService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  async list(
    filters: {
      q?: string;
      departmentId?: number;
      branchId?: number;
    },
    user: AuthUser,
  ) {
    const ds = await this.tenantDs();
    const qb = ds
      .getRepository(Employee)
      .createQueryBuilder('e')
      .leftJoinAndSelect('e.branch', 'branch')
      .leftJoinAndSelect('e.department', 'department')
      .leftJoinAndSelect('e.designation', 'designation')
      .leftJoinAndSelect('e.employmentStatus', 'employmentStatus')
      .leftJoinAndSelect('e.employmentType', 'employmentType')
      .leftJoinAndSelect('e.reportingTo', 'reportingTo')
      .orderBy('e.employeeCode', 'ASC');

    if (filters.q) {
      qb.andWhere(
        `(e.firstName ILIKE :q OR e.lastName ILIKE :q OR e.email ILIKE :q OR e.employeeCode ILIKE :q)`,
        { q: `%${filters.q}%` },
      );
    }
    if (filters.departmentId) {
      qb.andWhere('e.departmentId = :departmentId', {
        departmentId: filters.departmentId,
      });
    }
    if (filters.branchId) {
      qb.andWhere('e.branchId = :branchId', { branchId: filters.branchId });
    }

    if (!user.permissions.includes('employee.write')) {
      const self = await ds.getRepository(Employee).findOne({
        where: { userId: user.userId },
      });
      if (!self) return [];
      qb.andWhere('(e.id = :selfId OR e.reportingToId = :selfId)', {
        selfId: self.id,
      });
    }

    const rows = await qb.getMany();
    return rows.map((row) => this.serialize(row, user));
  }

  async getById(id: number, user: AuthUser) {
    const ds = await this.tenantDs();
    const employee = await this.loadEmployee(ds, id);
    await this.assertCanRead(ds, employee, user);
    return this.serialize(employee, user, true);
  }

  async create(dto: CreateEmployeeDto, user: AuthUser) {
    this.assertCanWrite(user);
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Employee);

    if (dto.reportingToId) {
      const manager = await repo.findOne({ where: { id: dto.reportingToId } });
      if (!manager) throw new NotFoundException('Reporting manager not found');
    }

    const employee = await repo.save(
      repo.create({
        employeeCode: dto.employeeCode.toUpperCase(),
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        phone: dto.phone ?? null,
        branchId: dto.branchId ?? null,
        departmentId: dto.departmentId ?? null,
        designationId: dto.designationId ?? null,
        employmentTypeId: dto.employmentTypeId ?? null,
        employmentStatusId: dto.employmentStatusId ?? null,
        reportingToId: dto.reportingToId ?? null,
        dateOfJoining: dto.dateOfJoining ?? null,
        basicSalary: dto.basicSalary ?? null,
        cnic: dto.cnic ?? null,
        userId: null,
      }),
    );

    await ds.getRepository(EmploymentHistory).save(
      ds.getRepository(EmploymentHistory).create({
        employeeId: employee.id,
        title: 'Joined organization',
        notes: 'Created via ERP employee wizard',
        effectiveFrom:
          dto.dateOfJoining ?? new Date().toISOString().slice(0, 10),
        effectiveTo: null,
      }),
    );

    return this.getById(employee.id, user);
  }

  async update(id: number, dto: UpdateEmployeeDto, user: AuthUser) {
    this.assertCanWrite(user);
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Employee);
    const employee = await this.loadEmployee(ds, id);

    if (dto.reportingToId === id) {
      throw new BadRequestException('Employee cannot report to themselves');
    }
    if (dto.reportingToId) {
      const manager = await repo.findOne({ where: { id: dto.reportingToId } });
      if (!manager) throw new NotFoundException('Reporting manager not found');
    }

    const oldDesignationId = employee.designationId;
    const beforeDesignation = employee.designation?.name;

    if (dto.employeeCode !== undefined) {
      employee.employeeCode = dto.employeeCode.toUpperCase();
    }
    if (dto.firstName !== undefined) employee.firstName = dto.firstName;
    if (dto.lastName !== undefined) employee.lastName = dto.lastName;
    if (dto.email !== undefined) employee.email = dto.email.toLowerCase();
    if (dto.phone !== undefined) employee.phone = dto.phone;
    if (dto.branchId !== undefined) employee.branchId = dto.branchId;
    if (dto.departmentId !== undefined) employee.departmentId = dto.departmentId;
    if (dto.designationId !== undefined) {
      employee.designationId = dto.designationId;
    }
    if (dto.employmentTypeId !== undefined) {
      employee.employmentTypeId = dto.employmentTypeId;
    }
    if (dto.employmentStatusId !== undefined) {
      employee.employmentStatusId = dto.employmentStatusId;
    }
    if (dto.reportingToId !== undefined) {
      employee.reportingToId = dto.reportingToId;
    }
    if (dto.dateOfJoining !== undefined) {
      employee.dateOfJoining = dto.dateOfJoining;
    }
    if (dto.basicSalary !== undefined) employee.basicSalary = dto.basicSalary;
    if (dto.cnic !== undefined) employee.cnic = dto.cnic;

    await repo.save(employee);

    if (
      dto.designationId !== undefined &&
      dto.designationId !== oldDesignationId
    ) {
      await ds.getRepository(EmploymentHistory).save(
        ds.getRepository(EmploymentHistory).create({
          employeeId: employee.id,
          title: 'Designation changed',
          notes: beforeDesignation
            ? `Updated from previous designation ${beforeDesignation}`
            : 'Employee designation updated',
          effectiveFrom: new Date().toISOString().slice(0, 10),
          effectiveTo: null,
        }),
      );
    }

    return this.getById(id, user);
  }

  async remove(id: number, user: AuthUser) {
    this.assertCanWrite(user);
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Employee);
    const employee = await repo.findOne({ where: { id } });
    if (!employee) throw new NotFoundException('Employee not found');

    const reports = await repo.count({ where: { reportingToId: id } });
    if (reports > 0) {
      throw new BadRequestException(
        'Reassign direct reports before deleting this employee',
      );
    }

    await repo.remove(employee);
    return { status: 'ok', id };
  }

  async myProfile(user: AuthUser) {
    const ds = await this.tenantDs();
    const employee = await ds.getRepository(Employee).findOne({
      where: { userId: user.userId },
    });
    if (!employee) {
      throw new NotFoundException('No employee profile linked to this user');
    }
    return this.getById(employee.id, user);
  }

  private assertCanWrite(user: AuthUser) {
    if (!user.permissions.includes('employee.write')) {
      throw new ForbiddenException('Missing employee.write');
    }
  }

  private async assertCanRead(
    ds: Awaited<ReturnType<EmployeesService['tenantDs']>>,
    employee: Employee,
    user: AuthUser,
  ) {
    if (user.permissions.includes('employee.write')) return;
    const self = await ds.getRepository(Employee).findOne({
      where: { userId: user.userId },
    });
    if (
      !self ||
      (employee.id !== self.id && employee.reportingToId !== self.id)
    ) {
      throw new ForbiddenException('Outside manager scope');
    }
  }

  private async loadEmployee(
    ds: Awaited<ReturnType<EmployeesService['tenantDs']>>,
    id: number,
  ) {
    const employee = await ds.getRepository(Employee).findOne({
      where: { id },
      relations: {
        branch: true,
        department: true,
        designation: true,
        employmentType: true,
        employmentStatus: true,
        reportingTo: true,
        documents: { documentType: true },
        history: true,
        directReports: true,
      },
    });
    if (!employee) throw new NotFoundException('Employee not found');
    return employee;
  }

  private serialize(employee: Employee, user: AuthUser, detailed = false) {
    const canSeeSensitive =
      user.permissions.includes('employee.write') ||
      user.permissions.includes('payroll.view');

    const base = {
      id: employee.id,
      employeeCode: employee.employeeCode,
      firstName: employee.firstName,
      lastName: employee.lastName,
      fullName: `${employee.firstName} ${employee.lastName}`,
      email: employee.email,
      phone: employee.phone,
      userId: employee.userId,
      dateOfJoining: employee.dateOfJoining,
      branchId: employee.branchId,
      departmentId: employee.departmentId,
      designationId: employee.designationId,
      employmentTypeId: employee.employmentTypeId,
      employmentStatusId: employee.employmentStatusId,
      reportingToId: employee.reportingToId,
      branch: employee.branch
        ? {
            id: employee.branch.id,
            name: employee.branch.name,
            code: employee.branch.code,
          }
        : null,
      department: employee.department
        ? {
            id: employee.department.id,
            name: employee.department.name,
            code: employee.department.code,
          }
        : null,
      designation: employee.designation
        ? {
            id: employee.designation.id,
            name: employee.designation.name,
            code: employee.designation.code,
          }
        : null,
      employmentType: employee.employmentType
        ? {
            id: employee.employmentType.id,
            name: employee.employmentType.name,
            code: employee.employmentType.code,
          }
        : null,
      employmentStatus: employee.employmentStatus
        ? {
            id: employee.employmentStatus.id,
            name: employee.employmentStatus.name,
            code: employee.employmentStatus.code,
          }
        : null,
      reportingTo: employee.reportingTo
        ? {
            id: employee.reportingTo.id,
            fullName: `${employee.reportingTo.firstName} ${employee.reportingTo.lastName}`,
            employeeCode: employee.reportingTo.employeeCode,
          }
        : null,
      basicSalary: canSeeSensitive ? employee.basicSalary : null,
      cnic: canSeeSensitive ? employee.cnic : null,
    };

    if (!detailed) return base;

    return {
      ...base,
      documents: (employee.documents ?? []).map((d) => ({
        id: d.id,
        fileName: d.fileName,
        storageKey: d.storageKey,
        documentType: d.documentType
          ? {
              id: d.documentType.id,
              name: d.documentType.name,
              code: d.documentType.code,
            }
          : null,
      })),
      history: (employee.history ?? []).map((h) => ({
        id: h.id,
        title: h.title,
        notes: h.notes,
        effectiveFrom: h.effectiveFrom,
        effectiveTo: h.effectiveTo,
      })),
      directReports: (employee.directReports ?? []).map((r) => ({
        id: r.id,
        fullName: `${r.firstName} ${r.lastName}`,
        employeeCode: r.employeeCode,
      })),
    };
  }

  private async tenantDs() {
    const tenant = getTenantContext();
    if (!tenant) throw new NotFoundException('Tenant required');
    const dbMeta = await this.tenantDatabases.findOne({
      where: { tenantId: tenant.tenantId },
    });
    if (!dbMeta) throw new NotFoundException('Tenant database missing');
    return this.tenantConnections.getOrCreate(tenant.tenantId, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
    });
  }
}
