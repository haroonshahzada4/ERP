import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../../../common/decorators/current-user.decorator';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { PLATFORM_ADMIN_KEY } from '../../../common/decorators/platform-admin.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { hasPermission } from '../../../modules/access/system-roles';

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
    if (!required?.length) {
      return true;
    }

    if (!user) {
      throw new ForbiddenException('Not authenticated');
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
}
