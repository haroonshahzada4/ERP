import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { getTenantContext } from '../../common/tenant/tenant-context';
import { TenantConnectionManager } from '../../infrastructure/database/tenant-connection.manager';
import {
  MembershipStatus,
  TenantMembership,
} from '../../platform/auth/entities/tenant-membership.entity';
import { User } from '../../platform/auth/entities/user.entity';
import { RbacService } from '../../platform/auth/rbac.service';
import { TenantDatabase } from '../../platform/tenants/entities/tenant-database.entity';
import {
  CreatePermissionDto,
  CreateRoleDto,
  UpdatePermissionDto,
  UpdateRoleDto,
} from './dto/access.dto';
import { MembershipRole } from './entities/membership-role.entity';
import { Permission } from './entities/permission.entity';
import { RolePermission } from './entities/role-permission.entity';
import { Role } from './entities/role.entity';
import {
  COMPANY_ADMIN_ROLE,
  isCompanyAdminRole,
  TENANT_SYSTEM_ROLES,
} from './system-roles';

@Injectable()
export class AccessService {
  constructor(
    @InjectRepository(TenantDatabase)
    private readonly tenantDatabases: Repository<TenantDatabase>,
    @InjectRepository(TenantMembership)
    private readonly memberships: Repository<TenantMembership>,
    @InjectRepository(User)
    private readonly users: Repository<User>,
    private readonly tenantConnections: TenantConnectionManager,
    private readonly rbac: RbacService,
  ) {}

  private async bustRbacCache() {
    const tenant = getTenantContext();
    if (tenant) await this.rbac.invalidateTenant(tenant.tenantId);
  }

  async listRolesMatrix() {
    const ds = await this.tenantDs();
    const roles = await ds.getRepository(Role).find({
      relations: { rolePermissions: { permission: true } },
      order: { name: 'ASC' },
    });
    const permissions = await ds.getRepository(Permission).find({
      order: { key: 'ASC' },
    });

    const allKeys = permissions.map((p) => p.key);

    return {
      permissions: permissions.map((p) => ({
        id: p.id,
        key: p.key,
        label: p.label,
        description: p.description,
      })),
      roles: roles.map((role) => {
        const fullAccess = isCompanyAdminRole(role.key);
        return {
          id: role.id,
          key: role.key === 'tenant_admin' ? COMPANY_ADMIN_ROLE : role.key,
          name: fullAccess ? 'Company Admin' : role.name,
          isSystem: role.isSystem,
          fullAccess,
          permissions: fullAccess
            ? allKeys
            : (role.rolePermissions ?? []).map((rp) => rp.permission.key),
        };
      }),
    };
  }

  async createPermission(dto: CreatePermissionDto) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Permission);
    const existing = await repo.findOne({ where: { key: dto.key } });
    if (existing) throw new BadRequestException('Permission key already exists');
    const created = await repo.save(
      repo.create({
        key: dto.key,
        label: dto.label,
        description: dto.description ?? null,
      }),
    );
    await this.bustRbacCache();
    return created;
  }

  async updatePermission(id: number, dto: UpdatePermissionDto) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Permission);
    const permission = await repo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Permission not found');
    if (dto.label !== undefined) permission.label = dto.label;
    if (dto.description !== undefined) permission.description = dto.description;
    const saved = await repo.save(permission);
    await this.bustRbacCache();
    return saved;
  }

  async deletePermission(id: number) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Permission);
    const permission = await repo.findOne({ where: { id } });
    if (!permission) throw new NotFoundException('Permission not found');
    await repo.remove(permission);
    await this.bustRbacCache();
    return { status: 'ok', id };
  }

  async createRole(dto: CreateRoleDto) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Role);
    const key = dto.key.trim().toLowerCase();
    if (
      isCompanyAdminRole(key) ||
      TENANT_SYSTEM_ROLES.some((r) => r.key === key)
    ) {
      throw new BadRequestException('Reserved system role key');
    }
    const existing = await repo.findOne({ where: { key } });
    if (existing) throw new BadRequestException('Role key already exists');
    return repo.save(
      repo.create({
        key,
        name: dto.name,
        isSystem: false,
      }),
    );
  }

  async updateRole(id: number, dto: UpdateRoleDto) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Role);
    const role = await repo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (dto.name !== undefined) role.name = dto.name;
    return repo.save(role);
  }

  async deleteRole(id: number) {
    const ds = await this.tenantDs();
    const repo = ds.getRepository(Role);
    const role = await repo.findOne({ where: { id } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) {
      throw new BadRequestException('System roles cannot be deleted');
    }
    await repo.remove(role);
    await this.bustRbacCache();
    return { status: 'ok', id };
  }

  async setRolePermission(
    roleId: number,
    permissionKey: string,
    granted: boolean,
  ) {
    const ds = await this.tenantDs();
    const role = await ds.getRepository(Role).findOne({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');

    if (isCompanyAdminRole(role.key)) {
      throw new BadRequestException(
        'Company Admin has full tenant access by scope; grants cannot be edited',
      );
    }

    const permission = await ds
      .getRepository(Permission)
      .findOne({ where: { key: permissionKey } });
    if (!permission) throw new NotFoundException('Permission not found');

    const rpRepo = ds.getRepository(RolePermission);
    const existing = await rpRepo.findOne({
      where: { roleId: role.id, permissionId: permission.id },
    });

    if (granted && !existing) {
      await rpRepo.save(
        rpRepo.create({ roleId: role.id, permissionId: permission.id }),
      );
    }
    if (!granted && existing) {
      await rpRepo.remove(existing);
    }

    await this.bustRbacCache();

    return {
      status: 'ok',
      roleId: role.id,
      roleKey: role.key,
      permissionKey,
      granted,
    };
  }

  async listMembers() {
    const tenant = getTenantContext();
    if (!tenant) throw new ForbiddenException('Tenant required');

    const memberships = await this.memberships.find({
      where: { tenantId: tenant.tenantId },
      relations: { user: true },
      order: { createdAt: 'ASC' },
    });

    const ds = await this.tenantDs();
    const assignments = await ds.getRepository(MembershipRole).find({
      relations: { role: true },
    });

    return memberships.map((m) => ({
      membershipId: m.id,
      status: m.status,
      user: {
        id: m.user.id,
        email: m.user.email,
        fullName: m.user.fullName,
      },
      roles: assignments
        .filter((a) => a.membershipId === m.id)
        .map((a) => a.role.key),
    }));
  }

  async assignRole(membershipId: number, roleKey: string, actorUserId: number) {
    const tenant = getTenantContext();
    if (!tenant) throw new ForbiddenException('Tenant required');

    const membership = await this.memberships.findOne({
      where: { id: membershipId, tenantId: tenant.tenantId },
    });
    if (!membership || membership.status !== MembershipStatus.ACTIVE) {
      throw new NotFoundException('Membership not found');
    }

    const ds = await this.tenantDs();
    const role = await ds.getRepository(Role).findOne({ where: { key: roleKey } });
    if (!role) throw new NotFoundException('Role not found');

    const repo = ds.getRepository(MembershipRole);
    const existing = await repo.findOne({
      where: { membershipId, roleId: role.id },
    });
    if (!existing) {
      await repo.save(
        repo.create({
          membershipId,
          userId: membership.userId,
          roleId: role.id,
        }),
      );
    }

    await this.bustRbacCache();

    return {
      status: 'ok',
      membershipId,
      roleKey,
      assignedBy: actorUserId,
    };
  }

  async unassignRole(membershipId: number, roleKey: string) {
    const tenant = getTenantContext();
    if (!tenant) throw new ForbiddenException('Tenant required');

    const membership = await this.memberships.findOne({
      where: { id: membershipId, tenantId: tenant.tenantId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    const ds = await this.tenantDs();
    const role = await ds.getRepository(Role).findOne({ where: { key: roleKey } });
    if (!role) throw new NotFoundException('Role not found');

    const repo = ds.getRepository(MembershipRole);
    const existing = await repo.findOne({
      where: { membershipId, roleId: role.id },
    });
    if (existing) await repo.remove(existing);

    await this.bustRbacCache();

    return { status: 'ok', membershipId, roleKey };
  }

  async revokeMembership(membershipId: number) {
    const tenant = getTenantContext();
    if (!tenant) throw new ForbiddenException('Tenant required');

    const membership = await this.memberships.findOne({
      where: { id: membershipId, tenantId: tenant.tenantId },
    });
    if (!membership) throw new NotFoundException('Membership not found');

    membership.status = MembershipStatus.REVOKED;
    await this.memberships.save(membership);
    await this.bustRbacCache();
    return { status: 'ok', membershipId };
  }

  private async tenantDs() {
    const tenant = getTenantContext();
    if (!tenant) throw new ForbiddenException('Tenant required');
    const dbMeta = await this.tenantDatabases.findOne({
      where: { tenantId: tenant.tenantId },
    });
    if (!dbMeta) throw new NotFoundException('Tenant database missing');
    return this.tenantConnections.getOrCreate(tenant.tenantId, {
      host: dbMeta.dbHost,
      port: dbMeta.dbPort,
      username: dbMeta.dbUser,
      password: dbMeta.dbPassword,
      database: dbMeta.dbName,
    });
  }
}
