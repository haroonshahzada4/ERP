import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { tenantContextStorage } from '../../common/tenant/tenant-context';
import { MembershipStatus } from './entities/tenant-membership.entity';
import { AccessPayload, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy security', () => {
  const userId = 1;
  const tenantId = 10;
  const otherTenantId = 20;
  const sessionId = 100;
  const membershipId = 5;

  const users = { findOne: jest.fn() };
  const sessions = { findOne: jest.fn() };
  const memberships = { findOne: jest.fn() };
  const rbac = { getForUser: jest.fn() };
  const supportAccess = { getActiveGrant: jest.fn() };

  let strategy: JwtStrategy;

  beforeEach(() => {
    jest.resetAllMocks();
    strategy = new JwtStrategy(
      { getOrThrow: () => 'test-secret' } as unknown as ConfigService,
      users as never,
      sessions as never,
      memberships as never,
      rbac as never,
      supportAccess as never,
    );
  });

  function runWithTenant<T>(tid: number, fn: () => Promise<T>) {
    return tenantContextStorage.run(
      { tenantId: tid, tenantSlug: 'demo', host: 'demo.localhost' },
      fn,
    );
  }

  const tenantPayload: AccessPayload = {
    sub: userId,
    tid: tenantId,
    sid: sessionId,
    typ: 'access',
    aud: 'tenant',
  };

  it('loads RBAC from DB and ignores embedded roles in payload', async () => {
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
      strategy.validate({} as never, {
        ...tenantPayload,
        roles: ['company_admin'],
        permissions: ['*'],
      } as AccessPayload),
    );

    expect(authUser.audience).toBe('tenant');
    expect(authUser.roles).toEqual(['employee']);
    expect(authUser.permissions).toEqual(['employee.read']);
  });

  it('rejects JWT when token tenant differs from host-resolved tenant', async () => {
    await expect(
      runWithTenant(otherTenantId, () =>
        strategy.validate({} as never, tenantPayload),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('accepts platform token without tid or tenant context', async () => {
    sessions.findOne.mockResolvedValue({
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.findOne.mockResolvedValue({
      id: userId,
      email: 'superadmin@demo.com',
      fullName: 'SA',
      isActive: true,
      isPlatformAdmin: true,
    });

    const authUser = await strategy.validate({} as never, {
      sub: userId,
      sid: sessionId,
      typ: 'access',
      aud: 'platform',
    });

    expect(authUser.audience).toBe('platform');
    expect(authUser.tenantId).toBeNull();
    expect(authUser.membershipId).toBeNull();
    expect(authUser.isPlatformAdmin).toBe(true);
  });

  it('platform token on tenant host loads support grant permissions', async () => {
    sessions.findOne.mockResolvedValue({
      id: sessionId,
      userId,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
    });
    users.findOne.mockResolvedValue({
      id: userId,
      email: 'superadmin@demo.com',
      fullName: 'SA',
      isActive: true,
      isPlatformAdmin: true,
    });
    supportAccess.getActiveGrant.mockResolvedValue({
      permissionKeys: ['employee.read'],
      featureKeys: ['hrm.employees'],
    });

    const authUser = await runWithTenant(tenantId, () =>
      strategy.validate({} as never, {
        sub: userId,
        sid: sessionId,
        typ: 'access',
        aud: 'platform',
      }),
    );

    expect(authUser.tenantId).toBe(tenantId);
    expect(authUser.permissions).toContain('employee.read');
  });

  it('rejects when Master DB membership is missing for tenant token', async () => {
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
        strategy.validate({} as never, tenantPayload),
      ),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
