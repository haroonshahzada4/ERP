import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_KEY } from '../../../common/decorators/authenticated.decorator';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { PLATFORM_ADMIN_KEY } from '../../../common/decorators/platform-admin.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { hasPermission } from '../../../modules/access/system-roles';

/**
 * Default-deny: protected routes must declare @Public, @Authenticated,
 * @RequirePlatformAdmin, or @RequirePermissions.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;

    const requiresPlatformAdmin = this.reflector.getAllAndOverride<boolean>(
      PLATFORM_ADMIN_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (requiresPlatformAdmin) {
      if (!user?.isPlatformAdmin) {
        throw new ForbiddenException('Super Admin required');
      }
      return true;
    }

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required?.length) {
      if (!user) {
        throw new ForbiddenException('Not authenticated');
      }
      // Platform tokens cannot satisfy tenant permission checks without support-granted perms.
      if (
        user.audience === 'platform' &&
        required.some((p) => !p.startsWith('platform.') && p !== 'platform:*' && p !== '*')
      ) {
        const ok = required.every((p) =>
          hasPermission(
            {
              permissions: user.permissions,
              roles: user.roles,
              isPlatformAdmin: false,
            },
            p,
          ),
        );
        if (!ok) {
          throw new ForbiddenException('Missing permission');
        }
        return true;
      }

      const ok = required.every((p) =>
        hasPermission(
          {
            permissions: user.permissions,
            roles: user.roles,
            isPlatformAdmin: user.isPlatformAdmin,
          },
          p,
        ),
      );
      if (!ok) {
        throw new ForbiddenException('Missing permission');
      }
      return true;
    }

    const authenticatedOnly = this.reflector.getAllAndOverride<boolean>(
      AUTHENTICATED_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (authenticatedOnly) {
      if (!user) {
        throw new ForbiddenException('Not authenticated');
      }
      return true;
    }

    throw new ForbiddenException(
      'Route is not annotated for authorization (default-deny)',
    );
  }
}
