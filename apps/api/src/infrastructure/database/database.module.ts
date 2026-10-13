import { DynamicModule, Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { masterEntities } from './master.entities';
import { InitAuthSchema1730000001000 } from './migrations/master/1730000001000-InitAuthSchema';
import { InitMasterSchema1730000000000 } from './migrations/master/1730000000000-InitMasterSchema';
import { AddTenantBranding1730000002000 } from './migrations/master/1730000002000-AddTenantBranding';
import { InitPlatformCatalog1730000003000 } from './migrations/master/1730000003000-InitPlatformCatalog';
import { TenantConnectionManager } from './tenant-connection.manager';

@Global()
@Module({})
export class DatabaseModule {
  static register(): DynamicModule {
    const enabled = (process.env.MASTER_DB_ENABLED ?? 'true') === 'true';

    if (!enabled) {
      return {
        module: DatabaseModule,
        global: true,
        providers: [TenantConnectionManager],
        exports: [TenantConnectionManager],
      };
    }

    return {
      module: DatabaseModule,
      global: true,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres' as const,
            host: config.get<string>('masterDb.host'),
            port: config.get<number>('masterDb.port'),
            username: config.get<string>('masterDb.username'),
            password: config.get<string>('masterDb.password'),
            database: config.get<string>('masterDb.database'),
            entities: masterEntities,
            migrations: [
              InitMasterSchema1730000000000,
              InitAuthSchema1730000001000,
              AddTenantBranding1730000002000,
              InitPlatformCatalog1730000003000,
            ],
            synchronize: false,
            logging: config.get<boolean>('typeorm.logging'),
            retryAttempts: 15,
            retryDelay: 2000,
          }),
        }),
        TypeOrmModule.forFeature(masterEntities),
      ],
      providers: [TenantConnectionManager],
      exports: [TenantConnectionManager, TypeOrmModule],
    };
  }
}
