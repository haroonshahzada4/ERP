import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AUTHENTICATED_KEY } from '../../../common/decorators/authenticated.decorator';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { PLATFORM_ADMIN_KEY } from '../../../common/decorators/platform-admin.decorator';
import { IS_PUBLIC_KEY } from '../../../common/decorators/public.decorator';
import { PermissionsGuard } from './permissions.guard';

describe('PermissionsGuard default-deny', () => {
  const reflector = { getAllAndOverride: jest.fn() };
  let guard: PermissionsGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new PermissionsGuard(reflector as unknown as Reflector);
  });

  function ctx(user?: object) {
    return {
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
  }

  function meta(map: Record<string, unknown>) {
    reflector.getAllAndOverride.mockImplementation((key: string) => map[key]);
  }

  it('allows @Public routes', () => {
    meta({ [IS_PUBLIC_KEY]: true });
    expect(guard.canActivate(ctx())).toBe(true);
  });

  it('denies unannotated protected routes', () => {
    meta({});
    expect(() =>
      guard.canActivate(
        ctx({
          userId: 1,
          audience: 'tenant',
          permissions: [],
          roles: [],
          isPlatformAdmin: false,
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows @Authenticated when user present', () => {
    meta({ [AUTHENTICATED_KEY]: true });
    expect(
      guard.canActivate(
        ctx({
          userId: 1,
          audience: 'tenant',
          permissions: [],
          roles: [],
        }),
      ),
    ).toBe(true);
  });

  it('allows @RequirePlatformAdmin for platform admin', () => {
    meta({ [PLATFORM_ADMIN_KEY]: true });
    expect(
      guard.canActivate(ctx({ isPlatformAdmin: true, audience: 'platform' })),
    ).toBe(true);
  });

  it('blocks platform token from tenant permission without grant perms', () => {
    meta({ [PERMISSIONS_KEY]: ['employee.read'] });
    expect(() =>
      guard.canActivate(
        ctx({
          audience: 'platform',
          isPlatformAdmin: true,
          permissions: ['platform:*'],
          roles: ['super_admin'],
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('allows platform token when support grant added tenant permission', () => {
    meta({ [PERMISSIONS_KEY]: ['employee.read'] });
    expect(
      guard.canActivate(
        ctx({
          audience: 'platform',
          isPlatformAdmin: true,
          permissions: ['platform:*', 'employee.read'],
          roles: ['super_admin'],
        }),
      ),
    ).toBe(true);
  });
});
