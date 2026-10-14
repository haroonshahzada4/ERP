import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { getTenantContext } from '../../../common/tenant/tenant-context';
import {
  MembershipStatus,
  TenantMembership,
} from '../entities/tenant-membership.entity';

/**
 * Defense-in-depth: tenant tokens re-check Master DB membership.
 * Platform tokens skip membership; Feature/Permissions guards enforce support grants.
 */
@Injectable()
export class MembershipGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @InjectRepository(TenantMembership)
    private readonly memberships: Repository<TenantMembership>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    if (!user) return true;

    if (user.audience === 'platform') {
      return true;
    }

    const tenant = getTenantContext();
    if (!tenant) {
      throw new ForbiddenException('Tenant context required');
    }

    if (user.tenantId !== tenant.tenantId) {
      throw new ForbiddenException('Tenant mismatch');
    }

    if (user.membershipId == null) {
      throw new ForbiddenException('Membership required');
    }

    const membership = await this.memberships.findOne({
      where: {
        userId: user.userId,
        tenantId: tenant.tenantId,
        status: MembershipStatus.ACTIVE,
      },
    });

    if (!membership || membership.id !== user.membershipId) {
      throw new ForbiddenException('Membership revoked');
    }
    return true;
  }
}
