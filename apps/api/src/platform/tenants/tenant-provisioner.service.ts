import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { Client } from 'pg';
import { DataSource, Repository } from 'typeorm';
import { seedTenantData } from '../../infrastructure/database/seeders/demo.seeder';
import { TenantConnectionManager } from '../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from './entities/tenant-database.entity';
import { TenantDomain } from './entities/tenant-domain.entity';
import { Tenant, TenantStatus } from './entities/tenant.entity';

export type ProvisionTenantInput = {
  slug: string;
  name: string;
  host?: string;
  adminEmail?: string;
  adminPassword?: string;
  brandPrimary?: string;
  brandSecondary?: string;
  themeMode?: 'dark' | 'light';
  logoUrl?: string | null;
  seedEmployees?: boolean;
};

@Injectable()
export class TenantProvisionerService {
  private readonly logger = new Logger(TenantProvisionerService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly masterDs: DataSource,
    @InjectRepository(Tenant) private readonly tenants: Repository<Tenant>,
    @InjectRepository(TenantDomain)
    private readonly domains: Repository<TenantDomain>,
    @InjectRepository(TenantDatabase)
    private readonly databases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
  ) {}

  async provision(input: ProvisionTenantInput) {
    const slug = input.slug.trim().toLowerCase();
    if (!/^[a-z0-9-]+$/.test(slug)) {
      throw new BadRequestException('Invalid tenant slug');
    }

    const host = (input.host ?? `${slug}.localhost`).toLowerCase();
    const dbName = `erp_tenant_${slug.replace(/-/g, '_')}`;
    const dbHost = this.config.getOrThrow<string>('masterDb.host');
    const dbPort = this.config.getOrThrow<number>('masterDb.port');
    const dbUser = this.config.getOrThrow<string>('masterDb.username');
    const dbPassword = this.config.getOrThrow<string>('masterDb.password');

    await this.ensureDatabaseExists(dbName);

    let tenant = await this.tenants.findOne({ where: { slug } });
    if (!tenant) {
      tenant = await this.tenants.save(
        this.tenants.create({
          slug,
          name: input.name,
          status: TenantStatus.PROVISIONING,
          schemaVersion: '0.1.0',
          logoUrl: input.logoUrl ?? null,
          brandPrimary: input.brandPrimary ?? '#1ecf8a',
          brandSecondary: input.brandSecondary ?? '#149a66',
          themeMode: input.themeMode ?? 'dark',
        }),
      );
    } else {
      tenant.name = input.name;
      if (input.brandPrimary) tenant.brandPrimary = input.brandPrimary;
      if (input.brandSecondary) tenant.brandSecondary = input.brandSecondary;
      if (input.themeMode) tenant.themeMode = input.themeMode;
      if (input.logoUrl !== undefined) tenant.logoUrl = input.logoUrl;
      tenant = await this.tenants.save(tenant);
    }

    if (!(await this.domains.findOne({ where: { host } }))) {
      await this.domains.save(
        this.domains.create({
          tenantId: tenant.id,
          host,
          isPrimary: true,
          isVerified: true,
        }),
      );
    }

    let dbMeta = await this.databases.findOne({ where: { tenantId: tenant.id } });
    if (!dbMeta) {
      dbMeta = await this.databases.save(
        this.databases.create({
          tenantId: tenant.id,
          dbName,
          dbHost,
          dbPort,
          dbUser,
          dbPassword,
          schemaVersion: '0.1.0',
        }),
      );
    } else {
      dbMeta.dbPassword = dbPassword;
      dbMeta.dbUser = dbUser;
      dbMeta.dbHost = dbHost;
      dbMeta.dbPort = dbPort;
      dbMeta = await this.databases.save(dbMeta);
    }

    const tenantDs = await this.tenantConnections.getOrCreate(tenant.id, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
      logging: this.config.get<boolean>('typeorm.logging'),
    });

    if (this.config.get<boolean>('typeorm.runMigrations')) {
      await tenantDs.runMigrations();
    }

    await seedTenantData(this.masterDs, tenantDs, {
      tenantId: tenant.id,
      adminEmail: input.adminEmail ?? `admin@${slug}.com`,
      adminPassword:
        input.adminPassword ??
        this.config.get<string>('demoTenant.adminPassword') ??
        'admin',
      companyName: input.name,
      brandPrimary: tenant.brandPrimary,
      brandSecondary: tenant.brandSecondary,
      themeMode: tenant.themeMode,
      logoUrl: tenant.logoUrl,
      seedEmployees: input.seedEmployees ?? slug === 'demo',
      seedSuperAdmin: true,
    });

    if (tenant.status !== TenantStatus.ACTIVE) {
      tenant.status = TenantStatus.ACTIVE;
      tenant = await this.tenants.save(tenant);
    }

    this.logger.log(`Tenant ready: ${slug} / ${dbName}`);
    return this.tenants.findOneOrFail({
      where: { id: tenant.id },
      relations: { domains: true, databases: true },
    });
  }

  private async ensureDatabaseExists(database: string) {
    const host = this.config.getOrThrow<string>('masterDb.host');
    const port = this.config.getOrThrow<number>('masterDb.port');
    const user = this.config.getOrThrow<string>('masterDb.username');
    const password = this.config.getOrThrow<string>('masterDb.password');
    const masterDb = this.config.getOrThrow<string>('masterDb.database');

    const client = new Client({
      host,
      port,
      user,
      password,
      database: masterDb,
    });
    await client.connect();
    try {
      const result = await client.query(
        `SELECT 1 FROM pg_database WHERE datname = $1`,
        [database],
      );
      if (result.rowCount === 0) {
        await client.query(`CREATE DATABASE "${database.replace(/"/g, '')}"`);
        this.logger.log(`Created database ${database}`);
      }
    } finally {
      await client.end();
    }
  }
}
