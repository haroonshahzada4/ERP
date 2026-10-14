import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { tenantContextStorage } from '../../../common/tenant/tenant-context';
import { MembershipStatus } from '../entities/tenant-membership.entity';
import { MembershipGuard } from './membership.guard';

describe('MembershipGuard security', () => {
  const memberships = { findOne: jest.fn() };
  const reflector = {
    getAllAndOverride: jest.fn().mockReturnValue(false),
  };
  let guard: MembershipGuard;

  beforeEach(() => {
    jest.resetAllMocks();
    reflector.getAllAndOverride.mockReturnValue(false);
    guard = new MembershipGuard(
      reflector as unknown as Reflector,
      memberships as never,
    );
  });

  function ctx(user: object | undefined) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as never;
  }

  it('rejects when JWT user tenant does not match resolved tenant', async () => {
    await expect(
      tenantContextStorage.run(
        { tenantId: 2, tenantSlug: 'b', host: 'b.localhost' },
        () =>
          guard.canActivate(
            ctx({
              audience: 'tenant',
              userId: 1,
              tenantId: 1,
              membershipId: 1,
            }),
          ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('re-checks active membership in Master DB', async () => {
    memberships.findOne.mockResolvedValue({
      id: 1,
      userId: 1,
      tenantId: 1,
      status: MembershipStatus.ACTIVE,
    });

    const ok = await tenantContextStorage.run(
      { tenantId: 1, tenantSlug: 'a', host: 'a.localhost' },
      () =>
        guard.canActivate(
          ctx({
            audience: 'tenant',
            userId: 1,
            tenantId: 1,
            membershipId: 1,
          }),
        ),
    );

    expect(ok).toBe(true);
  });

  it('allows platform audience without membership', async () => {
    const ok = await guard.canActivate(
      ctx({
        audience: 'platform',
        userId: 1,
        tenantId: null,
        membershipId: null,
        isPlatformAdmin: true,
      }),
    );
    expect(ok).toBe(true);
    expect(memberships.findOne).not.toHaveBeenCalled();
  });

  it('rejects revoked membership', async () => {
    memberships.findOne.mockResolvedValue(null);

    await expect(
      tenantContextStorage.run(
        { tenantId: 1, tenantSlug: 'a', host: 'a.localhost' },
        () =>
          guard.canActivate(
            ctx({
              audience: 'tenant',
              userId: 1,
              tenantId: 1,
              membershipId: 1,
            }),
          ),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
