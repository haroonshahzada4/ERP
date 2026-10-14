import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { LoggerModule } from 'nestjs-pino';
import { join } from 'node:path';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { HealthModule } from './common/health/health.module';
import { TenantResolverMiddleware } from './common/tenant/tenant-resolver.middleware';
import configuration from './config/configuration';
import { envValidationSchema } from './config/env.validation';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AccessModule } from './modules/access/access.module';
import { AttendanceModule } from './modules/hrm/attendance/attendance.module';
import { EmployeesModule } from './modules/hrm/employees/employees.module';
import { LeavesModule } from './modules/hrm/leaves/leaves.module';
import { OrganizationModule } from './modules/hrm/organization/organization.module';
import { PayrollModule } from './modules/hrm/payroll/payroll.module';
import { RecruitmentModule } from './modules/hrm/recruitment/recruitment.module';
import { AuthModule } from './platform/auth/auth.module';
import { JwtAuthGuard } from './platform/auth/guards/jwt-auth.guard';
import { MembershipGuard } from './platform/auth/guards/membership.guard';
import { PermissionsGuard } from './platform/auth/guards/permissions.guard';
import { CatalogModule } from './platform/catalog/catalog.module';
import { FeatureGuard } from './platform/catalog/feature.guard';
import { TenantsModule } from './platform/tenants/tenants.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validationSchema: envValidationSchema,
      // Resolve from package root whether cwd is monorepo root or apps/api.
      envFilePath: [
        join(__dirname, '..', '.env'),
        join(__dirname, '..', '.env.local'),
        join(process.cwd(), 'apps/api/.env'),
        join(process.cwd(), '.env'),
        '.env',
        '.env.local',
      ],
    }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        transport:
          process.env.NODE_ENV !== 'production'
            ? { target: 'pino-pretty', options: { singleLine: true } }
            : undefined,
        redact: {
          paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'dbPassword',
          ],
          remove: true,
        },
        customProps: () => ({ service: 'erp-api' }),
        autoLogging: true,
      },
    }),
    DatabaseModule.register(),
    RedisModule,
    HealthModule,
    AuthModule,
    CatalogModule,
    AccessModule,
    OrganizationModule,
    EmployeesModule,
    AttendanceModule,
    LeavesModule,
    PayrollModule,
    RecruitmentModule,
    TenantsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    TenantResolverMiddleware,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: MembershipGuard },
    { provide: APP_GUARD, useClass: FeatureGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantResolverMiddleware).forRoutes('*');
  }
}
