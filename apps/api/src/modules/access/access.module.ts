import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../../platform/auth/auth.module';
import { TenantMembership } from '../../platform/auth/entities/tenant-membership.entity';
import { User } from '../../platform/auth/entities/user.entity';
import { CatalogModule } from '../../platform/catalog/catalog.module';
import { TenantDatabase } from '../../platform/tenants/entities/tenant-database.entity';
import { AccessController } from './access.controller';
import { AccessService } from './access.service';

@Module({
  imports: [
    AuthModule,
    CatalogModule,
    TypeOrmModule.forFeature([TenantDatabase, TenantMembership, User]),
  ],
  controllers: [AccessController],
  providers: [AccessService],
  exports: [AccessService],
})
export class AccessModule {}
