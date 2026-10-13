import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tenant } from '../tenants/entities/tenant.entity';
import { CatalogSeeder } from './catalog.seeder';
import { EntitlementsService } from './entitlements.service';
import { FeatureGuard } from './feature.guard';
import { PlanFeature } from './entities/plan-feature.entity';
import { Plan } from './entities/plan.entity';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { PlatformFeature } from './entities/platform-feature.entity';
import { PlatformModule as PlatformModuleEntity } from './entities/platform-module.entity';
import { Subscription } from './entities/subscription.entity';
import { SupportAccessRequest } from './entities/support-access-request.entity';
import { TenantFeatureEntitlement } from './entities/tenant-feature-entitlement.entity';
import { PlatformAuditService } from './platform-audit.service';
import { PlatformCatalogController } from './platform-catalog.controller';
import { SupportAccessService } from './support-access.service';

export const catalogEntities = [
  PlatformModuleEntity,
  PlatformFeature,
  Plan,
  PlanFeature,
  Subscription,
  TenantFeatureEntitlement,
  PlatformAuditLog,
  SupportAccessRequest,
];

@Module({
  imports: [TypeOrmModule.forFeature([...catalogEntities, Tenant])],
  controllers: [PlatformCatalogController],
  providers: [
    EntitlementsService,
    SupportAccessService,
    PlatformAuditService,
    FeatureGuard,
    CatalogSeeder,
  ],
  exports: [
    EntitlementsService,
    SupportAccessService,
    PlatformAuditService,
    FeatureGuard,
    CatalogSeeder,
    TypeOrmModule,
  ],
})
export class CatalogModule {}
