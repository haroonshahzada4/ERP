import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURES_KEY } from '../../common/decorators/features.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { getTenantContext } from '../../common/tenant/tenant-context';
import { AuthUser } from '../../common/decorators/current-user.decorator';
import { EntitlementsService } from './entitlements.service';
import { SupportAccessService } from './support-access.service';

/**
 * Enforces Master-DB feature entitlements for the host-resolved tenant.
 * Independent of RBAC: Feature enabled AND user authorized.
 * Platform tokens without an approved support grant cannot use tenant features.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
    private readonly supportAccess: SupportAccessService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(FEATURES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required?.length) return true;

    const tenant = getTenantContext();
    if (!tenant) {
      throw new ForbiddenException('Tenant context required for feature check');
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    if (user?.audience === 'platform' || user?.isPlatformAdmin) {
      const grant = await this.supportAccess.getActiveGrant(
        user.userId,
        tenant.tenantId,
      );
      if (grant) {
        const ok = required.every(
          (f) =>
            grant.featureKeys.includes(f) ||
            grant.featureKeys.includes('*'),
        );
        if (ok) return true;
      }
      throw new ForbiddenException(
        'Support access grant required for tenant features',
      );
    }

    await this.entitlements.assertFeatures(tenant.tenantId, required);
    return true;
  }
}
