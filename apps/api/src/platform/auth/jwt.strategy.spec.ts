import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tenantContextStorage } from '../../common/tenant/tenant-context';
import { MembershipStatus } from './entities/tenant-membership.entity';
import { AccessPayload, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy security', () => {
  const userId = 'user-1';
  const tenantId = 'tenant-a';
  const otherTenantId = 'tenant-b';
  const sessionId = 'session-1';
  const membershipId = 'mem-1';

  const users = {
    findOne: jest.fn(),
  };
  const sessions = {
    findOne: jest.fn(),
  };
  const memberships = {
    findOne: jest.fn(),
  };
  const rbac = {
    getForUser: jest.fn(),
  };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.resetAllMocks();
    strategy = new JwtStrategy(
      {
        getOrThrow: () => 'test-secret',
      } as unknown as ConfigService,
      users as never,
      sessions as never,
      memberships as never,
      rbac as never,
    );
  });

  function runWithTenant<T>(tid: string, fn: () => Promise<T>) {
    return tenantContextStorage.run(
      { tenantId: tid, tenantSlug: 'demo', host: 'demo.localhost' },
      fn,
    );
  }

  const validPayload: AccessPayload = {
    sub: userId,
    tid: tenantId,
    sid: sessionId,
    typ: 'access',
  };

  it('rejects tokens that embed roles/permissions by requiring slim claims path', async () => {
    // Even if an old token somehow carried roles, strategy ignores them and loads RBAC.
    sessions.findOne.mockResolvedValue({
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.findOne.mockResolvedValue({
      id: userId,
      email: 'a@demo.com',
      fullName: 'A',
      isActive: true,
      isPlatformAdmin: false,
    });
    memberships.findOne.mockResolvedValue({
      id: membershipId,
      userId,
      tenantId,
      status: MembershipStatus.ACTIVE,
    });
    rbac.getForUser.mockResolvedValue({
      roles: ['employee'],
      permissions: ['employee.read'],
      isPlatformAdmin: false,
    });

    const authUser = await runWithTenant(tenantId, () =>
      strategy.validate(
        {} as never,
        {
          ...validPayload,
          roles: ['company_admin'],
          permissions: ['*'],
        } as AccessPayload,
      ),
    );

    expect(authUser.roles).toEqual(['employee']);
    expect(authUser.permissions).toEqual(['employee.read']);
    expect(rbac.getForUser).toHaveBeenCalledWith(
      membershipId,
      userId,
      tenantId,
      expect.any(Object),
    );
  });

  it('rejects JWT when token tenant differs from host-resolved tenant', async () => {
    await expect(
      runWithTenant(otherTenantId, () =>
        strategy.validate({} as never, validPayload),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects when Master DB membership is missing/inactive', async () => {
    sessions.findOne.mockResolvedValue({
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.findOne.mockResolvedValue({
      id: userId,
      email: 'a@demo.com',
      fullName: 'A',
      isActive: true,
    });
    memberships.findOne.mockResolvedValue(null);

    await expect(
      runWithTenant(tenantId, () =>
        strategy.validate({} as never, validPayload),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects revoked sessions', async () => {
    sessions.findOne.mockResolvedValue({
      id: sessionId,
      userId,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });

    await expect(
      runWithTenant(tenantId, () =>
        strategy.validate({} as never, validPayload),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
