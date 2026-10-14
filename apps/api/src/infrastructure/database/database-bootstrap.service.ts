import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogSeeder } from '../../platform/catalog/catalog.seeder';
import { TenantProvisionerService } from '../../platform/tenants/tenant-provisioner.service';
import { ensurePlatformSuperAdmin } from './seeders/demo.seeder';

const SEED_TENANTS = [
  {
    slug: 'demo',
    name: 'Nexus HR',
    host: 'demo.localhost',
    adminEmail: 'admin@demo.com',
    brandPrimary: '#1ecf8a',
    brandSecondary: '#149a66',
    themeMode: 'dark' as const,
    logoUrl: null as string | null,
    seedEmployees: true,
  },
  {
    slug: 'horizon',
    name: 'Horizon Logistics',
    host: 'horizon.localhost',
    adminEmail: 'admin@horizon.com',
    brandPrimary: '#f97316',
    brandSecondary: '#ea580c',
    themeMode: 'dark' as const,
    logoUrl: null as string | null,
    seedEmployees: false,
  },
  {
    slug: 'summit',
    name: 'Summit Foods',
    host: 'summit.localhost',
    adminEmail: 'admin@summit.com',
    brandPrimary: '#38bdf8',
    brandSecondary: '#0284c7',
    themeMode: 'dark' as const,
    logoUrl: null as string | null,
    seedEmployees: false,
  },
];

@Injectable()
export class DatabaseBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectDataSource() private readonly masterDs: DataSource,
    private readonly provisioner: TenantProvisionerService,
    private readonly catalogSeeder: CatalogSeeder,
  ) {}

  async onApplicationBootstrap() {
    if (!this.config.get<boolean>('masterDb.enabled')) {
      this.logger.warn('Master DB disabled — skipping bootstrap');
      return;
    }

    if (this.config.get<boolean>('typeorm.runMigrations')) {
      const executed = await this.masterDs.runMigrations();
      this.logger.log(
        `Master migrations applied: ${executed.length ? executed.map((m) => m.name).join(', ') : 'none (up to date)'}`,
      );
    }

    const password =
      this.config.get<string>('demoTenant.adminPassword') ?? 'admin';

    for (const seed of SEED_TENANTS) {
      await this.provisioner.provision({
        ...seed,
        adminPassword: password,
        adminEmail:
          seed.slug === 'demo'
            ? (this.config.get<string>('demoTenant.adminEmail') ??
              seed.adminEmail)
            : seed.adminEmail,
      });
    }

    // Platform Super Admin: global user only — no tenant memberships.
    await ensurePlatformSuperAdmin(this.masterDs, password);

    await this.catalogSeeder.seedAll();
  }
}
