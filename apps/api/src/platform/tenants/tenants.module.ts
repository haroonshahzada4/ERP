import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DatabaseBootstrapService } from '../../infrastructure/database/database-bootstrap.service';
import { CatalogModule } from '../catalog/catalog.module';
import { TenantDatabase } from './entities/tenant-database.entity';
import { TenantDomain } from './entities/tenant-domain.entity';
import { Tenant } from './entities/tenant.entity';
import { TenantProvisionerService } from './tenant-provisioner.service';
import { TenantsController } from './tenants.controller';
import { TenantsService } from './tenants.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tenant, TenantDomain, TenantDatabase]),
    CatalogModule,
  ],
  controllers: [TenantsController],
  providers: [
    TenantsService,
    TenantProvisionerService,
    DatabaseBootstrapService,
  ],
  exports: [TenantsService, TenantProvisionerService],
})
export class TenantsModule {}
