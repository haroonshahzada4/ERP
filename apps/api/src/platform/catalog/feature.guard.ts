import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
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
    if (!tenant) return true; // MembershipGuard / JwtStrategy handle missing tenant

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    // Active support grant may temporarily unlock requested features for Super Admin.
    if (user?.isPlatformAdmin) {
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
      // Without a matching support grant, Super Admin still cannot use tenant features.
    }

    await this.entitlements.assertFeatures(tenant.tenantId, required);
    return true;
  }
}
