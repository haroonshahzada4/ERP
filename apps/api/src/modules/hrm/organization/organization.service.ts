import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getTenantContext } from '../../../common/tenant/tenant-context';
import { TenantConnectionManager } from '../../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../../../platform/tenants/entities/tenant-database.entity';
import { Branch } from './entities/branch.entity';
import { Department } from './entities/department.entity';
import { Designation } from './entities/designation.entity';
import { DocumentType } from './entities/document-type.entity';
import { EmploymentStatus } from './entities/employment-status.entity';
import { EmploymentType } from './entities/employment-type.entity';

@Injectable()
export class OrganizationService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  async getSetup() {
    const ds = await this.tenantDs();
    const [branches, departments, designations, employmentTypes, employmentStatuses, documentTypes] =
      await Promise.all([
        ds.getRepository(Branch).find({ order: { name: 'ASC' } }),
        ds.getRepository(Department).find({
          relations: { branch: true },
          order: { name: 'ASC' },
        }),
        ds.getRepository(Designation).find({ order: { name: 'ASC' } }),
        ds.getRepository(EmploymentType).find({ order: { name: 'ASC' } }),
        ds.getRepository(EmploymentStatus).find({ order: { name: 'ASC' } }),
        ds.getRepository(DocumentType).find({ order: { name: 'ASC' } }),
      ]);

    return {
      branches,
      departments,
      designations,
      employmentTypes,
      employmentStatuses,
      documentTypes,
    };
  }

  async createBranch(input: { name: string; code: string; city?: string }) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Branch);
    return repo.save(
      repo.create({
        name: input.name,
        code: input.code.toUpperCase(),
        city: input.city ?? null,
        isActive: true,
      }),
    );
  }

  async createDepartment(input: {
    name: string;
    code: string;
    branchId?: number;
  }) {
    const ds = await this.tenantDs();
    if (input.branchId) {
      const branch = await ds.getRepository(Branch).findOne({
        where: { id: input.branchId },
      });
      if (!branch) throw new NotFoundException('Branch not found');
    }
    const repo = ds.getRepository(Department);
    return repo.save(
      repo.create({
        name: input.name,
        code: input.code.toUpperCase(),
        branchId: input.branchId ?? null,
        isActive: true,
      }),
    );
  }

  async createDesignation(input: { name: string; code: string }) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Designation);
    return repo.save(
      repo.create({
        name: input.name,
        code: input.code.toUpperCase(),
        isActive: true,
      }),
    );
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
