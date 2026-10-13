import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CatalogModule } from '../catalog/catalog.module';
import { TenantDatabase } from '../tenants/entities/tenant-database.entity';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { Session } from './entities/session.entity';
import { TenantMembership } from './entities/tenant-membership.entity';
import { User } from './entities/user.entity';
import { JwtStrategy } from './jwt.strategy';
import { RbacCacheService } from './rbac-cache.service';
import { RbacService } from './rbac.service';

@Module({
  imports: [
    forwardRef(() => CatalogModule),
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('jwt.accessSecret'),
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      Session,
      TenantMembership,
      TenantDatabase,
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, RbacService, RbacCacheService],
  exports: [AuthService, RbacService, TypeOrmModule],
})
export class AuthModule {}
