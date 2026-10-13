import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getTenantContext } from '../../common/tenant/tenant-context';
import { TenantConnectionManager } from '../../infrastructure/database/tenant-connection.manager';
import { CompanySettings } from '../../modules/access/entities/company-settings.entity';
import {
  CreateTenantDto,
  UpdateCompanySettingsDto,
  UpdateTenantDto,
} from './dto/tenant.dto';
import { TenantDatabase } from './entities/tenant-database.entity';
import { Tenant, TenantStatus } from './entities/tenant.entity';
import { TenantProvisionerService } from './tenant-provisioner.service';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenants: Repository<Tenant>,
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
    private readonly provisioner: TenantProvisionerService,
  ) {}

  /** Branding for the host-resolved tenant. Non-sensitive; used by login + shell. */
  async getBranding() {
    const ctx = getTenantContext();
    if (!ctx) throw new ForbiddenException('Tenant required');
    const tenant = await this.tenants.findOne({ where: { id: ctx.tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return {
      slug: tenant.slug,
      name: tenant.name,
      logoUrl: tenant.logoUrl,
      brandPrimary: tenant.brandPrimary,
      brandSecondary: tenant.brandSecondary,
      themeMode: tenant.themeMode,
    };
  }

  async findAll() {
    const rows = await this.tenants.find({
      order: { createdAt: 'ASC' },
      relations: { domains: true, databases: true },
    });
    const counts: { tenant_id: number; n: string }[] =
      await this.tenants.manager.query(
        `SELECT tenant_id, COUNT(*)::text AS n
           FROM tenant_memberships
          WHERE status = 'active'
          GROUP BY tenant_id`,
      );
    const byTenant = new Map(
      counts.map((c) => [Number(c.tenant_id), Number(c.n)]),
    );
    return rows.map((t) => ({
      ...this.toSafeTenant(t),
      activeMembers: byTenant.get(t.id) ?? 0,
    }));
  }

  async findOne(id: number) {
    const tenant = await this.tenants.findOne({
      where: { id },
      relations: { domains: true, databases: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const status = await this.getTenantStatus(tenant);
    return { ...this.toSafeTenant(tenant), ...status };
  }

  create(dto: CreateTenantDto) {
    return this.provisioner
      .provision({
        slug: dto.slug,
        name: dto.name,
        host: dto.host,
        adminEmail: dto.adminEmail,
        adminPassword: dto.adminPassword,
        brandPrimary: dto.brandPrimary,
        brandSecondary: dto.brandSecondary,
        themeMode: dto.themeMode,
        logoUrl: dto.logoUrl ?? null,
        seedEmployees: false,
      })
      .then((t) => this.toSafeTenant(t));
  }

  async update(id: number, dto: UpdateTenantDto) {
    const tenant = await this.tenants.findOne({
      where: { id },
      relations: { domains: true, databases: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (dto.name !== undefined) tenant.name = dto.name;
    if (dto.brandPrimary !== undefined) tenant.brandPrimary = dto.brandPrimary;
    if (dto.brandSecondary !== undefined) {
      tenant.brandSecondary = dto.brandSecondary;
    }
    if (dto.themeMode !== undefined) tenant.themeMode = dto.themeMode;
    if (dto.logoUrl !== undefined) tenant.logoUrl = dto.logoUrl ?? null;
    if (dto.status !== undefined) tenant.status = dto.status as TenantStatus;

    if (dto.slug && dto.slug !== tenant.slug) {
      throw new BadRequestException('Tenant slug cannot be changed');
    }

    const saved = await this.tenants.save(tenant);

    // Keep company_settings branding in sync when possible.
    try {
      await this.patchCompanySettingsForTenant(saved.id, {
        name: saved.name,
        brandPrimary: saved.brandPrimary,
        brandSecondary: saved.brandSecondary,
        themeMode: saved.themeMode,
        logoUrl: saved.logoUrl,
      });
    } catch {
      // tenant DB may be offline — master row still updated
    }

    return this.toSafeTenant(
      (await this.tenants.findOne({
        where: { id: saved.id },
        relations: { domains: true, databases: true },
      }))!,
    );
  }

  async remove(id: number) {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    if (tenant.slug === 'demo') {
      throw new BadRequestException('Demo tenant cannot be deleted');
    }
    tenant.status = TenantStatus.SUSPENDED;
    await this.tenants.save(tenant);
    return { status: 'ok', id, action: 'suspended' };
  }

  async getCurrentTenantStatus() {
    const ctx = getTenantContext();
    if (!ctx) throw new ForbiddenException('Tenant required');
    const tenant = await this.tenants.findOne({
      where: { id: ctx.tenantId },
      relations: { domains: true, databases: true },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');
    const status = await this.getTenantStatus(tenant);
    return { ...this.toSafeTenant(tenant), ...status };
  }

  /** @deprecated prefer getCurrentTenantStatus */
  async getDemoTenantStatus() {
    return this.getCurrentTenantStatus();
  }

  async getCompanySettings() {
    const ctx = getTenantContext();
    if (!ctx) throw new ForbiddenException('Tenant required');
    const ds = await this.tenantDs(ctx.tenantId);
    const rows = await ds.getRepository(CompanySettings).find({
      take: 1,
      order: { createdAt: 'ASC' },
    });
    return rows[0] ?? null;
  }

  async updateCompanySettings(dto: UpdateCompanySettingsDto) {
    const ctx = getTenantContext();
    if (!ctx) throw new ForbiddenException('Tenant required');
    const ds = await this.tenantDs(ctx.tenantId);
    const repo = ds.getRepository(CompanySettings);
    let row = (
      await repo.find({ take: 1, order: { createdAt: 'ASC' } })
    )[0];
    if (!row) {
      row = repo.create({
        name: dto.name ?? 'Company',
        timezone: dto.timezone ?? 'UTC',
        fiscalYearStartMonth: dto.fiscalYearStartMonth ?? 7,
        logoUrl: dto.logoUrl ?? null,
        brandPrimary: dto.brandPrimary ?? '#1ecf8a',
        brandSecondary: dto.brandSecondary ?? '#149a66',
        themeMode: dto.themeMode ?? 'dark',
      });
    } else {
      if (dto.name !== undefined) row.name = dto.name;
      if (dto.timezone !== undefined) row.timezone = dto.timezone;
      if (dto.fiscalYearStartMonth !== undefined) {
        row.fiscalYearStartMonth = dto.fiscalYearStartMonth;
      }
      if (dto.logoUrl !== undefined) row.logoUrl = dto.logoUrl;
      if (dto.brandPrimary !== undefined) row.brandPrimary = dto.brandPrimary;
      if (dto.brandSecondary !== undefined) {
        row.brandSecondary = dto.brandSecondary;
      }
      if (dto.themeMode !== undefined) row.themeMode = dto.themeMode;
    }
    const saved = await repo.save(row);

    const tenant = await this.tenants.findOne({ where: { id: ctx.tenantId } });
    if (tenant) {
      tenant.name = saved.name;
      tenant.logoUrl = saved.logoUrl;
      tenant.brandPrimary = saved.brandPrimary;
      tenant.brandSecondary = saved.brandSecondary;
      tenant.themeMode = saved.themeMode;
      await this.tenants.save(tenant);
    }

    return saved;
  }

  private async patchCompanySettingsForTenant(
    tenantId: number,
    dto: UpdateCompanySettingsDto,
  ) {
    const ds = await this.tenantDs(tenantId);
    const repo = ds.getRepository(CompanySettings);
    const row = (await repo.find({ take: 1, order: { createdAt: 'ASC' } }))[0];
    if (!row) return;
    if (dto.name !== undefined) row.name = dto.name;
    if (dto.brandPrimary !== undefined) row.brandPrimary = dto.brandPrimary;
    if (dto.brandSecondary !== undefined) {
      row.brandSecondary = dto.brandSecondary;
    }
    if (dto.themeMode !== undefined) row.themeMode = dto.themeMode;
    if (dto.logoUrl !== undefined) row.logoUrl = dto.logoUrl ?? null;
    await repo.save(row);
  }

  private async getTenantStatus(tenant: Tenant) {
    const dbMeta = tenant.databases[0];
    if (!dbMeta) {
      return {
        database: null,
        companySettings: null,
      };
    }

    const ds = await this.tenantConnections.getOrCreate(tenant.id, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
    });

    const settings = await ds.getRepository(CompanySettings).find({
      take: 1,
      order: { createdAt: 'ASC' },
    });

    return {
      database: {
        name: dbMeta.dbName,
        host: dbMeta.dbHost,
        port: dbMeta.dbPort,
        schemaVersion: dbMeta.schemaVersion,
        connected: ds.isInitialized,
      },
      companySettings: settings[0] ?? null,
    };
  }

  private async tenantDs(tenantId: number) {
    const dbMeta = await this.tenantDatabases.findOne({ where: { tenantId } });
    if (!dbMeta) throw new NotFoundException('Tenant database missing');
    return this.tenantConnections.getOrCreate(tenantId, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
    });
  }

  private toSafeTenant(tenant: Tenant) {
    return {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      status: tenant.status,
      schemaVersion: tenant.schemaVersion,
      logoUrl: tenant.logoUrl,
      brandPrimary: tenant.brandPrimary,
      brandSecondary: tenant.brandSecondary,
      themeMode: tenant.themeMode,
      domains: (tenant.domains ?? []).map((d) => d.host),
      databaseName: tenant.databases?.[0]?.dbName ?? null,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
    };
  }
}
