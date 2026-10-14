import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FEATURES_KEY } from '../../common/decorators/features.decorator';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';
import { FeatureGuard } from './feature.guard';

describe('FeatureGuard', () => {
  const entitlements = {
    assertFeatures: jest.fn(),
  };
  const supportAccess = {
    getActiveGrant: jest.fn(),
  };
  const reflector = {
    getAllAndOverride: jest.fn(),
  };

  let guard: FeatureGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    guard = new FeatureGuard(
      reflector as unknown as Reflector,
      entitlements as never,
      supportAccess as never,
    );
  });

  function ctx(user?: {
    isPlatformAdmin?: boolean;
    userId?: number;
    audience?: 'platform' | 'tenant';
  }) {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as never;
  }

  it('allows public routes', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) =>
      key === IS_PUBLIC_KEY ? true : undefined,
    );
    await expect(guard.canActivate(ctx())).resolves.toBe(true);
    expect(entitlements.assertFeatures).not.toHaveBeenCalled();
  });

  it('enforces entitlements for normal users', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === IS_PUBLIC_KEY) return false;
      if (key === FEATURES_KEY) return ['hrm.payroll'];
      return undefined;
    });
    // getTenantContext is used inside — stub via assertFeatures being called
    // When no tenant context, guard returns true early. Simulate with spy on module.
    const tenantContext = await import('../../common/tenant/tenant-context');
    jest.spyOn(tenantContext, 'getTenantContext').mockReturnValue({
      tenantId: 1,
      tenantSlug: 'demo',
      host: 'demo.localhost',
    });

    entitlements.assertFeatures.mockResolvedValue(undefined);
    await expect(
      guard.canActivate(ctx({ isPlatformAdmin: false, userId: 1 })),
    ).resolves.toBe(true);
    expect(entitlements.assertFeatures).toHaveBeenCalledWith(1, [
      'hrm.payroll',
    ]);
  });

  it('blocks when entitlement assert fails', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === FEATURES_KEY) return ['hrm.payroll'];
      return false;
    });
    const tenantContext = await import('../../common/tenant/tenant-context');
    jest.spyOn(tenantContext, 'getTenantContext').mockReturnValue({
      tenantId: 1,
      tenantSlug: 'horizon',
      host: 'horizon.localhost',
    });
    entitlements.assertFeatures.mockRejectedValue(
      new ForbiddenException('Feature not enabled'),
    );
    supportAccess.getActiveGrant.mockResolvedValue(null);

    await expect(
      guard.canActivate(ctx({ isPlatformAdmin: false, userId: 1 })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows Super Admin only with matching support grant', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === FEATURES_KEY) return ['hrm.employees'];
      return false;
    });
    const tenantContext = await import('../../common/tenant/tenant-context');
    jest.spyOn(tenantContext, 'getTenantContext').mockReturnValue({
      tenantId: 1,
      tenantSlug: 'demo',
      host: 'demo.localhost',
    });
    supportAccess.getActiveGrant.mockResolvedValue({
      featureKeys: ['hrm.employees'],
    });

    await expect(
      guard.canActivate(
        ctx({ isPlatformAdmin: true, userId: 99, audience: 'platform' }),
      ),
    ).resolves.toBe(true);
    expect(entitlements.assertFeatures).not.toHaveBeenCalled();
  });

  it('blocks Super Admin without support grant', async () => {
    reflector.getAllAndOverride.mockImplementation((key: string) => {
      if (key === FEATURES_KEY) return ['hrm.employees'];
      return false;
    });
    const tenantContext = await import('../../common/tenant/tenant-context');
    jest.spyOn(tenantContext, 'getTenantContext').mockReturnValue({
      tenantId: 1,
      tenantSlug: 'demo',
      host: 'demo.localhost',
    });
    supportAccess.getActiveGrant.mockResolvedValue(null);

    await expect(
      guard.canActivate(
        ctx({ isPlatformAdmin: true, userId: 99, audience: 'platform' }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

