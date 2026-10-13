import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipRole } from '../../modules/access/entities/membership-role.entity';
import { Permission } from '../../modules/access/entities/permission.entity';
import {
  COMPANY_ADMIN_ROLE,
  isCompanyAdminRole,
  LEGACY_TENANT_ADMIN_ROLE,
  PLATFORM_FULL_ACCESS_PERMISSION,
  PLATFORM_PERMISSION_KEYS,
  SUPER_ADMIN_ROLE,
  TENANT_FULL_ACCESS_PERMISSION,
} from '../../modules/access/system-roles';
import { SupportAccessService } from '../catalog/support-access.service';
import { TenantConnectionManager } from '../../infrastructure/database/tenant-connection.manager';
import { TenantDatabase } from '../tenants/entities/tenant-database.entity';
import { User } from './entities/user.entity';
import { CachedRbac, RbacCacheService } from './rbac-cache.service';

@Injectable()
export class RbacService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    private readonly tenantConnections: TenantConnectionManager,
    private readonly cache: RbacCacheService,
    private readonly supportAccess: SupportAccessService,
  ) {}

  async getForUser(
    membershipId: number,
    userId: number,
    tenantId: number,
    user?: User | null,
  ): Promise<CachedRbac> {
    // Support grants are time-sensitive — do not serve a stale cache that
    // omits (or keeps) temporary tenant permissions.
    const entity =
      user ?? (await this.users.findOne({ where: { id: userId } }));
    if (!entity?.isPlatformAdmin) {
      const cached = await this.cache.get(tenantId, userId);
      if (cached) return cached;
    }

    const rbac = await this.loadFromDb(membershipId, userId, tenantId, entity);
    if (!rbac.isPlatformAdmin) {
      await this.cache.set(tenantId, userId, rbac);
    }
    return rbac;
  }

  async invalidateTenant(tenantId: number) {
    await this.cache.invalidateTenant(tenantId);
  }

  private async loadFromDb(
    membershipId: number,
    userId: number,
    tenantId: number,
    user: User | null,
  ): Promise<CachedRbac> {
    const dbMeta = await this.tenantDatabases.findOne({ where: { tenantId } });
    const tenantPermissionKeys = dbMeta
      ? await this.loadTenantPermissionKeys(tenantId, dbMeta)
      : [];

    // Super Admin: platform:* only — NEVER automatic tenant data access.
    // Temporary tenant permissions come only from an approved support grant.
    if (user?.isPlatformAdmin) {
      const base = [...PLATFORM_PERMISSION_KEYS];
      const withSupport = await this.supportAccess.augmentPermissions(
        userId,
        tenantId,
        true,
        base,
      );
      return {
        roles: [SUPER_ADMIN_ROLE],
        permissions: withSupport.includes(PLATFORM_FULL_ACCESS_PERMISSION)
          ? withSupport
          : [PLATFORM_FULL_ACCESS_PERMISSION, ...withSupport],
        isPlatformAdmin: true,
      };
    }

    if (!dbMeta) {
      return { roles: [], permissions: [], isPlatformAdmin: false };
    }

    const ds = await this.tenantConnections.getOrCreate(tenantId, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
    });

    const rows = await ds
      .getRepository(MembershipRole)
      .createQueryBuilder('mr')
      .innerJoinAndSelect('mr.role', 'role')
      .leftJoinAndSelect('role.rolePermissions', 'rp')
      .leftJoinAndSelect('rp.permission', 'permission')
      .where('mr.membershipId = :membershipId', { membershipId })
      .andWhere('mr.userId = :userId', { userId })
      .getMany();

    const roles = [
      ...new Set(
        rows.map((r) =>
          r.role.key === LEGACY_TENANT_ADMIN_ROLE
            ? COMPANY_ADMIN_ROLE
            : r.role.key,
        ),
      ),
    ];

    if (roles.some(isCompanyAdminRole)) {
      return {
        roles,
        permissions: [TENANT_FULL_ACCESS_PERMISSION, ...tenantPermissionKeys],
        isPlatformAdmin: false,
      };
    }

    const permissions = [
      ...new Set(
        rows.flatMap((r) =>
          (r.role.rolePermissions ?? [])
            .map((rp) => rp.permission?.key)
            .filter((key): key is string => !!key),
        ),
      ),
    ];

    return { roles, permissions, isPlatformAdmin: false };
  }

  private async loadTenantPermissionKeys(
    tenantId: number,
    dbMeta: TenantDatabase,
  ) {
    const ds = await this.tenantConnections.getOrCreate(tenantId, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
    });
    return (await ds.getRepository(Permission).find({ select: ['key'] })).map(
      (p) => p.key,
    );
  }
}
